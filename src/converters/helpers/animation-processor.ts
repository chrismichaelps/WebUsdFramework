/**
 * Animation Processor
 * 
 * Main entry point for processing GLTF animations.
 * Uses factory pattern to route animations to specialized processors.
 * Supports multiple animation types (skeleton, node, etc.) and can be extended.
 */

import { Document, Node, Skin, Animation } from '@gltf-transform/core';
import { Logger } from '../../utils';
import { SkeletonData } from './skeleton-processor';
import { ANIMATION } from '../../constants';
import { UsdNode } from '../../core/usd-node';
import { AnimationProcessorFactory, AnimationProcessorContext } from './animation-processor-factory';
import { setSkeletonAnimationSources } from './processors/skeleton-animation-processor';

/**
 * Animation time code metadata
 */
export interface AnimationTimeCode {
  startTimeCode: number;
  endTimeCode: number;
  timeCodesPerSecond: number;
  framesPerSecond: number;
}

/**
 * Process animations from GLTF document
 */
/**
 * Get animation duration from channels
 */
function getAnimationDuration(animation: Animation): number {
  const channels = animation.listChannels();
  let maxTime = 0;

  for (const channel of channels) {
    const sampler = channel.getSampler();
    if (!sampler) continue;

    const input = sampler.getInput();
    if (!input) continue;

    const inputArray = input.getArray();
    if (!inputArray) continue;

    const times = Array.from(inputArray as Float32Array);
    if (times.length > 0) {
      maxTime = Math.max(maxTime, ...times);
    }
  }

  return maxTime;
}

/**
 * Process animations from GLTF document
 * Uses factory pattern to route each animation to the appropriate processor
 */
export function processAnimations(
  document: Document,
  nodeMap: Map<Node, UsdNode>,
  logger: Logger,
  skeletonMap?: Map<Skin, SkeletonData>
): AnimationTimeCode | null {
  const root = document.getRoot();
  const animations = root.listAnimations();

  if (animations.length === 0) {
    return null;
  }

  logger.info(`Processing ${animations.length} animations`);

  // Create factory and processor context
  const factory = new AnimationProcessorFactory(logger);
  const context: AnimationProcessorContext = {
    nodeMap,
    logger,
    skeletonMap
  };

  const frameRate = ANIMATION.FRAME_RATE;
  const animationSourcesMap = new Map<Skin, Array<{ path: string; name: string; index: number }>>();
  let firstAnimationDuration = 0;

  // Process each animation using the factory
  for (let animIdx = 0; animIdx < animations.length; animIdx++) {
    const animation = animations[animIdx];

    // Get the appropriate processor for this animation
    const processor = factory.getProcessor(animation, context);

    if (!processor) {
      logger.warn(`No processor found for animation: ${animation.getName() || `Animation_${animIdx}`}`);
      continue;
    }

    // Process the animation
    const result = processor.process(animation, animIdx, context);

    if (!result) {
      continue;
    }

    // Track first animation duration for time codes
    if (animIdx === 0) {
      firstAnimationDuration = result.duration;
    }

    // Collect skeleton animation sources for later binding
    if (result.animationSource) {
      const { targetSkin, path, name, index } = result.animationSource;
      if (!animationSourcesMap.has(targetSkin)) {
        animationSourcesMap.set(targetSkin, []);
      }
      animationSourcesMap.get(targetSkin)!.push({
        path,
        name,
        index
      });
    }
  }

  // Set all animation sources on skeletons
  if (skeletonMap && skeletonMap.size > 0 && animationSourcesMap.size > 0) {
    setSkeletonAnimationSources(animationSourcesMap, skeletonMap, logger);
  }

  // Calculate time codes
  // Always return time code metadata if animations exist, even if no skeleton animations
  // This ensures the header includes time code metadata for USDZ compatibility
  if (animations.length === 0) {
    return null;
  }

  // If no skeleton animations were processed, use default duration from first animation
  let duration = firstAnimationDuration;
  if (duration === 0 && animations.length > 0) {
    duration = getAnimationDuration(animations[0]);
  }

  // If still no duration, use a default value to ensure header metadata is set
  if (duration === 0) {
    duration = 1.0; // Default 1 second animation
  }

  const startTimeCode = 0;
  const endTimeCode = Math.ceil(duration * frameRate);

  logger.info('Animation time code metadata', {
    startTimeCode,
    endTimeCode,
    duration,
    frameRate,
    hasSkeletonAnimations: firstAnimationDuration > 0,
    totalAnimations: animations.length
  });

  return {
    startTimeCode,
    endTimeCode,
    timeCodesPerSecond: frameRate,
    framesPerSecond: frameRate
  };
}

