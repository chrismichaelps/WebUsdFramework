/**
 * Animation Processor Factory
 * 
 * Factory pattern for creating animation processors based on animation type.
 * Supports multiple animation processing approaches (skeleton, node, etc.)
 * and can be extended for future animation types.
 */

import { Animation, Node, Skin } from '@gltf-transform/core';
import { UsdNode } from '../../core/usd-node';
import { Logger } from '../../utils';
import { SkeletonData } from './skeleton-processor';
import { SkeletonAnimationProcessor } from './processors/skeleton-animation-processor';
import { NodeAnimationProcessor } from './processors/node-animation-processor';

/**
 * Base interface for all animation processors
 */
export interface IAnimationProcessor {
  /**
   * Check if this processor can handle the given animation
   */
  canProcess(animation: Animation, context: AnimationProcessorContext): boolean;

  /**
   * Process the animation and return the duration
   */
  process(
    animation: Animation,
    animationIndex: number,
    context: AnimationProcessorContext
  ): AnimationProcessorResult | null;
}

/**
 * Context information needed by animation processors
 */
export interface AnimationProcessorContext {
  nodeMap: Map<Node, UsdNode>;
  logger: Logger;
  skeletonMap?: Map<Skin, SkeletonData> | undefined;
}

/**
 * Result of processing an animation
 */
export interface AnimationProcessorResult {
  duration: number;
  path?: string;
  name?: string;
  animationSource?: {
    path: string;
    name: string;
    index: number;
    targetSkin: Skin;
  };
}

/**
 * Animation processor factory
 * Determines which processor to use based on the animation type
 */
export class AnimationProcessorFactory {
  private processors: IAnimationProcessor[];

  constructor(logger: Logger) {
    // Initialize available processors
    this.processors = [
      new SkeletonAnimationProcessor(logger),
      new NodeAnimationProcessor(logger)
    ];
  }

  /**
   * Get the appropriate processor for an animation
   * Checks processors in order until one can handle the animation
   */
  getProcessor(animation: Animation, context: AnimationProcessorContext): IAnimationProcessor | null {
    for (const processor of this.processors) {
      if (processor.canProcess(animation, context)) {
        return processor;
      }
    }
    return null;
  }

  /**
   * Register a new processor type
   * Useful for extending with new animation types in the future
   */
  registerProcessor(processor: IAnimationProcessor): void {
    this.processors.push(processor);
  }
}

