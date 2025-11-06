/**
 * Skeleton Animation Processor
 * 
 * Handles skeleton-based animations (for models with bones/joints).
 * Creates SkelAnimation prims and uses USD Skel API for character animations.
 */

import { Animation, Skin } from '@gltf-transform/core';
import { UsdNode } from '../../../core/usd-node';
import { Logger, sanitizeName, formatUsdQuotedArray, TimeCodeConverter } from '../../../utils';
import { ApiSchemaBuilder, API_SCHEMAS } from '../../../utils/api-schema-builder';
import { SkeletonData } from '../skeleton-processor';
import { IAnimationProcessor, AnimationProcessorContext, AnimationProcessorResult } from '../animation-processor-factory';

/**
 * Joint animation data for a single joint
 */
interface JointAnimationData {
  jointPath: string;
  translations?: Map<number, string>;
  rotations?: Map<number, string>;
  scales?: Map<number, string>;
}

/**
 * Processor for skeleton animations
 */
export class SkeletonAnimationProcessor implements IAnimationProcessor {
  constructor(private logger: Logger) { }

  /**
   * Check if this animation targets skeleton joints
   */
  canProcess(animation: Animation, context: AnimationProcessorContext): boolean {
    if (!context.skeletonMap || context.skeletonMap.size === 0) {
      return false;
    }

    const channels = animation.listChannels();

    for (const channel of channels) {
      const targetNode = channel.getTargetNode();
      if (!targetNode) continue;

      for (const [, skeletonData] of context.skeletonMap) {
        if (skeletonData.jointNodes.has(targetNode)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Process a skeleton animation
   */
  process(
    animation: Animation,
    animationIndex: number,
    context: AnimationProcessorContext
  ): AnimationProcessorResult | null {
    if (!context.skeletonMap || context.skeletonMap.size === 0) {
      return null;
    }

    // Find which skin this animation targets
    const channels = animation.listChannels();
    let targetSkin: Skin | null = null;

    for (const channel of channels) {
      const targetNode = channel.getTargetNode();
      if (!targetNode) continue;

      for (const [skin, skeletonData] of context.skeletonMap) {
        if (skeletonData.jointNodes.has(targetNode)) {
          targetSkin = skin;
          break;
        }
      }
      if (targetSkin) break;
    }

    if (!targetSkin) {
      return null;
    }

    // Get target skeleton from the provided skin
    const targetSkeleton = context.skeletonMap.get(targetSkin);
    if (!targetSkeleton) {
      return null;
    }

    const animationName = animation.getName() || `Animation_${animationIndex}`;

    // First, collect all unique times from all samplers
    // We need to get every time sample so we can build complete animation arrays
    const allAnimationTimes = new Set<number>();
    let maxTime = 0;

    for (const channel of channels) {
      const targetNode = channel.getTargetNode();
      if (!targetNode || !targetSkeleton.jointNodes.has(targetNode)) continue;

      const sampler = channel.getSampler();
      if (!sampler) continue;

      const input = sampler.getInput();
      if (!input) continue;

      const inputArray = input.getArray();
      if (!inputArray) continue;

      const times = Array.from(inputArray as Float32Array);
      for (const time of times) {
        allAnimationTimes.add(time);
      }

      if (times.length > 0) {
        maxTime = Math.max(maxTime, ...times);
      }
    }

    // Sort all the times so we have a clean list to work with
    const sortedAllTimes = Array.from(allAnimationTimes).sort((a, b) => a - b);

    this.logger.info(`Collected all animation times`, {
      animationName,
      totalUniqueTimes: sortedAllTimes.length,
      firstTime: sortedAllTimes[0],
      lastTime: sortedAllTimes[sortedAllTimes.length - 1],
      duration: sortedAllTimes[sortedAllTimes.length - 1] - sortedAllTimes[0],
      first10Times: sortedAllTimes.slice(0, 10),
      last10Times: sortedAllTimes.slice(-10),
      middle10Times: sortedAllTimes.length > 20
        ? sortedAllTimes.slice(Math.floor(sortedAllTimes.length / 2) - 5, Math.floor(sortedAllTimes.length / 2) + 5)
        : []
    });

    // Collect joint animation data for each joint
    const jointAnimations = new Map<string, JointAnimationData>();

    for (const channel of channels) {
      const targetNode = channel.getTargetNode();
      if (!targetNode || !targetSkeleton.jointNodes.has(targetNode)) continue;

      const jointUsdNode = targetSkeleton.jointNodes.get(targetNode);
      if (!jointUsdNode) continue;

      const jointPath = jointUsdNode.getPath();
      const sampler = channel.getSampler();
      if (!sampler) continue;

      const input = sampler.getInput();
      const output = sampler.getOutput();
      if (!input || !output) continue;

      const inputArray = input.getArray();
      const outputArray = output.getArray();
      if (!inputArray || !outputArray) continue;

      const times = Array.from(inputArray as Float32Array);
      const values = Array.from(outputArray as Float32Array);
      const targetPath = channel.getTargetPath();

      let jointAnim = jointAnimations.get(jointPath);
      if (!jointAnim) {
        jointAnim = { jointPath };
        jointAnimations.set(jointPath, jointAnim);
      }

      // Create time samples for this joint
      const timeSamples = new Map<number, string>();
      const componentCount = targetPath === 'rotation' ? 4 : 3;

      for (let i = 0; i < times.length; i++) {
        const time = times[i];
        const startIdx = i * componentCount;
        const value = values.slice(startIdx, startIdx + componentCount);

        let valueString: string;
        if (componentCount === 3) {
          valueString = `(${value[0]}, ${value[1]}, ${value[2]})`;
        } else {
          // Quaternion conversion: GLTF uses (x,y,z,w), USD uses (w,x,y,z)
          valueString = `(${value[3]}, ${value[0]}, ${value[1]}, ${value[2]})`;
        }
        timeSamples.set(time, valueString);
      }

      if (targetPath === 'translation') {
        jointAnim.translations = timeSamples;
      } else if (targetPath === 'rotation') {
        jointAnim.rotations = timeSamples;
      } else if (targetPath === 'scale') {
        jointAnim.scales = timeSamples;
      }
    }

    // Create SkelAnimation node
    const skelRootNode = targetSkeleton.skelRootNode;
    const skeletonPath = skelRootNode.getPath();
    const skeletonName = skelRootNode.getName();
    const sanitizedName = sanitizeName(animationName);
    const animationPath = `${skeletonPath}/${skeletonName}_${sanitizedName}`;

    const skelAnimationNode = new UsdNode(animationPath, 'SkelAnimation');
    const allSkeletonJointPaths = targetSkeleton.jointPaths;

    // Use the sorted times we collected earlier
    // This gives us all the time points where we need animation values
    const sortedTimes = sortedAllTimes;

    // USD Skel needs all three components (translation, rotation, scale) at every time sample
    // If a joint doesn't have a value at a specific time, we'll use the closest one we have
    const translations = new Map<number, string[]>();
    const rotations = new Map<number, string[]>();
    const scales = new Map<number, string[]>();

    // Helper to grab a value at a specific time
    // If we don't have an exact match, we use the closest time sample we have
    const getValueAtTime = (timeSamples: Map<number, string>, time: number, defaultValue: string): string => {
      if (timeSamples.has(time)) {
        return timeSamples.get(time)!;
      }

      // Find nearest time samples
      const sorted = Array.from(timeSamples.keys()).sort((a, b) => a - b);
      if (sorted.length === 0) return defaultValue;

      // Find closest sample
      let closest = sorted[0];
      let minDiff = Math.abs(time - closest);
      for (const t of sorted) {
        const diff = Math.abs(time - t);
        if (diff < minDiff) {
          minDiff = diff;
          closest = t;
        }
      }

      return timeSamples.get(closest) || defaultValue;
    };

    // Build arrays for all time samples
    for (const time of sortedTimes) {
      const transArray: string[] = [];
      const rotArray: string[] = [];
      const scaleArray: string[] = [];

      for (const jointPath of allSkeletonJointPaths) {
        const jointAnim = jointAnimations.get(jointPath);

        // Get translation - use interpolation if missing
        if (jointAnim?.translations) {
          transArray.push(getValueAtTime(jointAnim.translations, time, '(0, 0, 0)'));
        } else {
          transArray.push('(0, 0, 0)');
        }

        // Get rotation - use interpolation if missing
        if (jointAnim?.rotations) {
          rotArray.push(getValueAtTime(jointAnim.rotations, time, '(1, 0, 0, 0)'));
        } else {
          rotArray.push('(1, 0, 0, 0)');
        }

        // Get scale - use interpolation if missing
        if (jointAnim?.scales) {
          scaleArray.push(getValueAtTime(jointAnim.scales, time, '(1, 1, 1)'));
        } else {
          scaleArray.push('(1, 1, 1)');
        }
      }

      // Always set all three components at all times
      translations.set(time, transArray);
      rotations.set(time, rotArray);
      scales.set(time, scaleArray);
    }

    // Make sure all three components have values at the same times
    // USD needs translations, rotations, and scales to use the exact same time samples
    const allCommonTimes = new Set<number>();
    for (const time of translations.keys()) allCommonTimes.add(time);
    for (const time of rotations.keys()) allCommonTimes.add(time);
    for (const time of scales.keys()) allCommonTimes.add(time);

    const sortedCommonTimes = Array.from(allCommonTimes).sort((a, b) => a - b);

    // Ensure all three components have values at all common times
    for (const time of sortedCommonTimes) {
      if (!translations.has(time)) {
        // Use first available or default
        const firstTime = sortedCommonTimes[0];
        translations.set(time, translations.has(firstTime) ? [...translations.get(firstTime)!] : allSkeletonJointPaths.map(() => '(0, 0, 0)'));
      }
      if (!rotations.has(time)) {
        const firstTime = sortedCommonTimes[0];
        rotations.set(time, rotations.has(firstTime) ? [...rotations.get(firstTime)!] : allSkeletonJointPaths.map(() => '(1, 0, 0, 0)'));
      }
      if (!scales.has(time)) {
        const firstTime = sortedCommonTimes[0];
        scales.set(time, scales.has(firstTime) ? [...scales.get(firstTime)!] : allSkeletonJointPaths.map(() => '(1, 1, 1)'));
      }
    }

    // Copy the first frame to the last frame so the animation loops smoothly
    if (sortedCommonTimes.length > 1) {
      const firstTime = sortedCommonTimes[0];
      const lastTime = sortedCommonTimes[sortedCommonTimes.length - 1];

      if (firstTime !== lastTime) {
        translations.set(lastTime, [...translations.get(firstTime)!]);
        rotations.set(lastTime, [...rotations.get(firstTime)!]);
        scales.set(lastTime, [...scales.get(firstTime)!]);
      }
    }

    // Set joints array
    const jointsArray = formatUsdQuotedArray(allSkeletonJointPaths);
    skelAnimationNode.setProperty('uniform token[] joints', jointsArray, 'raw');

    // Convert time from seconds to frame numbers
    // USD uses frame numbers for animation, so we convert at 24fps
    const transTimeCodes = TimeCodeConverter.convertArraysToTimeCodes(translations);
    if (transTimeCodes.size > 1) {
      skelAnimationNode.setTimeSampledProperty('float3[] translations', transTimeCodes, 'float3[]');
    } else if (transTimeCodes.size === 1) {
      const singleValue = Array.from(transTimeCodes.values())[0];
      skelAnimationNode.setProperty('float3[] translations', singleValue, 'raw');
    }

    const rotTimeCodes = TimeCodeConverter.convertArraysToTimeCodes(rotations);
    if (rotTimeCodes.size > 1) {
      skelAnimationNode.setTimeSampledProperty('quatf[] rotations', rotTimeCodes, 'quatf[]');
    } else if (rotTimeCodes.size === 1) {
      const singleValue = Array.from(rotTimeCodes.values())[0];
      skelAnimationNode.setProperty('quatf[] rotations', singleValue, 'raw');
    }

    const scaleTimeCodes = TimeCodeConverter.convertArraysToTimeCodes(scales);
    if (scaleTimeCodes.size > 1) {
      skelAnimationNode.setTimeSampledProperty('half3[] scales', scaleTimeCodes, 'half3[]');
    } else if (scaleTimeCodes.size === 1) {
      const singleValue = Array.from(scaleTimeCodes.values())[0];
      skelAnimationNode.setProperty('half3[] scales', singleValue, 'raw');
    }

    // Add to SkelRoot
    skelRootNode.addChild(skelAnimationNode);

    // Verify all time samples are set correctly
    const finalTransTimes = Array.from(translations.keys()).sort((a, b) => a - b);
    const finalRotTimes = Array.from(rotations.keys()).sort((a, b) => a - b);
    const finalScaleTimes = Array.from(scales.keys()).sort((a, b) => a - b);

    this.logger.info(`Created SkelAnimation: ${animationName}`, {
      animationName,
      animationPath,
      timeSamples: sortedCommonTimes.length,
      duration: maxTime,
      translationSamples: finalTransTimes.length,
      rotationSamples: finalRotTimes.length,
      scaleSamples: finalScaleTimes.length,
      firstTime: sortedCommonTimes[0],
      lastTime: sortedCommonTimes[sortedCommonTimes.length - 1],
      timeRange: `${sortedCommonTimes[0]} - ${sortedCommonTimes[sortedCommonTimes.length - 1]}`,
      first10Times: sortedCommonTimes.slice(0, 10),
      last10Times: sortedCommonTimes.slice(-10)
    });

    return {
      duration: maxTime,
      path: animationPath,
      name: `${skeletonName}_${sanitizedName}`,
      animationSource: {
        path: animationPath,
        name: `${skeletonName}_${sanitizedName}`,
        index: animationIndex,
        targetSkin
      }
    };
  }
}

/**
 * Set animation sources on skeleton prims
 * This tells USDZ viewers which animation to play
 */
export function setSkeletonAnimationSources(
  animationSourcesMap: Map<Skin, Array<{ path: string; name: string; index: number }>>,
  skeletonMap: Map<Skin, SkeletonData>,
  logger: Logger
): void {
  for (const [skin, animationSources] of animationSourcesMap) {
    const skeletonData = skeletonMap.get(skin);
    if (!skeletonData || animationSources.length === 0) continue;

    const skelRootNode = skeletonData.skelRootNode;
    const skelPrim = skeletonData.skeletonPrimNode;

    // Set animation source on both SkelRoot and Skeleton prim
    // Different viewers look in different places, so we set it on both to be safe
    const firstAnimationSource = `<${animationSources[0].path}>`;

    // Verify we're using animation index 0
    const isUsingIndex0 = animationSources[0].index === 0;
    logger.info(`Setting animation source for skeleton`, {
      skeletonPath: skelRootNode.getPath(),
      skeletonPrimPath: skelPrim?.getPath(),
      animationIndex: animationSources[0].index,
      animationName: animationSources[0].name,
      animationPath: animationSources[0].path,
      isUsingIndex0,
      totalAnimations: animationSources.length
    });

    // Set animation source on both SkelRoot and Skeleton prim
    // Even though USD supports inheritance, some viewers need it set explicitly
    ApiSchemaBuilder.addApiSchema(skelRootNode, API_SCHEMAS.SKEL_BINDING);
    skelRootNode.setProperty('rel skel:animationSource', firstAnimationSource, 'rel');

    if (skelPrim) {
      ApiSchemaBuilder.addApiSchema(skelPrim, API_SCHEMAS.SKEL_BINDING);
      skelPrim.setProperty('rel skel:animationSource', firstAnimationSource, 'rel');
    }

    // Set customData with first animation as default
    if (animationSources.length > 0) {
      const firstAnim = animationSources[0];
      skelRootNode.setProperty('customData', { defaultAnimation: firstAnim.name });
    }

    logger.info(`Set all animations on skeleton`, {
      skeletonPath: skelRootNode.getPath(),
      animationCount: animationSources.length,
      animations: animationSources.map(a => ({ index: a.index, name: a.name }))
    });
  }
}

