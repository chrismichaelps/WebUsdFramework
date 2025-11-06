/**
 * Node Animation Processor
 * 
 * Handles regular node animations (for models without skeletons).
 * Applies time-sampled xformOp properties directly to transform nodes.
 */

import { Animation } from '@gltf-transform/core';
import { UsdNode } from '../../../core/usd-node';
import { Logger } from '../../../utils';
import { ANIMATION } from '../../../constants';
import { IAnimationProcessor, AnimationProcessorContext, AnimationProcessorResult } from '../animation-processor-factory';

/**
 * Node animation data for a single node
 */
interface NodeAnimationData {
  translations?: Map<number, string>;
  rotations?: Map<number, string>;
  scales?: Map<number, string>;
}

/**
 * Processor for regular node animations
 */
export class NodeAnimationProcessor implements IAnimationProcessor {
  constructor(private logger: Logger) { }

  /**
   * Check if this is a regular node animation (not skeleton)
   * This processor handles animations that don't target skeleton joints
   */
  canProcess(animation: Animation, context: AnimationProcessorContext): boolean {
    // If there are skeletons, check if this animation targets them
    if (context.skeletonMap && context.skeletonMap.size > 0) {
      const channels = animation.listChannels();

      for (const channel of channels) {
        const targetNode = channel.getTargetNode();
        if (!targetNode) continue;

        for (const [, skeletonData] of context.skeletonMap) {
          if (skeletonData.jointNodes.has(targetNode)) {
            // This targets skeleton joints, so we can't process it
            return false;
          }
        }
      }
    }

    // If we get here, it's either a node animation or no skeletons exist
    return true;
  }

  /**
   * Process a node animation
   */
  process(
    animation: Animation,
    animationIndex: number,
    context: AnimationProcessorContext
  ): AnimationProcessorResult | null {
    const animationName = animation.getName() || `Animation_${animationIndex}`;
    const channels = animation.listChannels();

    if (channels.length === 0) {
      return null;
    }

    // Collect all unique times from all channels
    const allAnimationTimes = new Set<number>();
    let maxTime = 0;

    for (const channel of channels) {
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

    if (allAnimationTimes.size === 0) {
      return null;
    }

    // Group channels by target node
    const nodeAnimations = new Map<UsdNode, NodeAnimationData>();

    for (const channel of channels) {
      const targetNode = channel.getTargetNode();
      if (!targetNode) continue;

      const usdNode = context.nodeMap.get(targetNode);
      if (!usdNode) {
        this.logger.warn(`USD node not found for GLTF node: ${targetNode.getName()}`, {
          animationName,
          targetNodeName: targetNode.getName()
        });
        continue;
      }

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

      let nodeAnim = nodeAnimations.get(usdNode);
      if (!nodeAnim) {
        nodeAnim = {};
        nodeAnimations.set(usdNode, nodeAnim);
      }

      // Create time samples for this node
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
        nodeAnim.translations = timeSamples;
      } else if (targetPath === 'rotation') {
        nodeAnim.rotations = timeSamples;
      } else if (targetPath === 'scale') {
        nodeAnim.scales = timeSamples;
      }
    }

    // Apply animations to USD nodes
    for (const [usdNode, nodeAnim] of nodeAnimations) {
      // Remove existing xformOp:transform if present (USD doesn't allow mixing)
      const existingTransform = usdNode.getProperty('xformOp:transform');
      if (existingTransform) {
        // Remove xformOp:transform from xformOpOrder
        const existingOps = usdNode.getProperty('xformOpOrder');
        if (existingOps && Array.isArray(existingOps)) {
          const filteredOps = (existingOps as string[]).filter(op => op !== 'xformOp:transform');
          usdNode.setProperty('xformOpOrder', filteredOps, 'token[]');
        }
      }

      // Build xformOpOrder
      const xformOps: string[] = [];

      // Convert time samples from seconds to integer time codes (frame numbers)
      // USD expects integer time codes for proper animation playback at 24fps
      const frameRate = ANIMATION.FRAME_RATE;

      // Helper to convert time samples to time codes
      const convertTimeSamplesToTimeCodes = (timeSamples: Map<number, string>): Map<number, string> => {
        const timeCodes = new Map<number, string>();
        for (const [timeSeconds, value] of timeSamples) {
          const timeCode = Math.round(timeSeconds * frameRate);
          timeCodes.set(timeCode, value);
        }
        return timeCodes;
      };

      // Apply translations
      if (nodeAnim.translations && nodeAnim.translations.size > 0) {
        const transTimeCodes = convertTimeSamplesToTimeCodes(nodeAnim.translations);

        if (transTimeCodes.size > 1) {
          usdNode.setTimeSampledProperty('xformOp:translate', transTimeCodes, 'float3');
          xformOps.push('xformOp:translate');
        } else if (transTimeCodes.size === 1) {
          const singleValue = Array.from(transTimeCodes.values())[0];
          usdNode.setProperty('xformOp:translate', singleValue, 'raw');
          xformOps.push('xformOp:translate');
        }
      }

      // Apply rotations
      if (nodeAnim.rotations && nodeAnim.rotations.size > 0) {
        const rotTimeCodes = convertTimeSamplesToTimeCodes(nodeAnim.rotations);

        if (rotTimeCodes.size > 1) {
          usdNode.setTimeSampledProperty('xformOp:orient', rotTimeCodes, 'quatf');
          xformOps.push('xformOp:orient');
        } else if (rotTimeCodes.size === 1) {
          const singleValue = Array.from(rotTimeCodes.values())[0];
          usdNode.setProperty('xformOp:orient', singleValue, 'raw');
          xformOps.push('xformOp:orient');
        }
      }

      // Apply scales
      if (nodeAnim.scales && nodeAnim.scales.size > 0) {
        const scaleTimeCodes = convertTimeSamplesToTimeCodes(nodeAnim.scales);

        if (scaleTimeCodes.size > 1) {
          usdNode.setTimeSampledProperty('xformOp:scale', scaleTimeCodes, 'half3');
          xformOps.push('xformOp:scale');
        } else if (scaleTimeCodes.size === 1) {
          const singleValue = Array.from(scaleTimeCodes.values())[0];
          usdNode.setProperty('xformOp:scale', singleValue, 'raw');
          xformOps.push('xformOp:scale');
        }
      }

      // Set xformOpOrder
      if (xformOps.length > 0) {
        usdNode.setProperty('xformOpOrder', xformOps, 'token[]');
      }

      this.logger.info(`Applied node animation: ${animationName}`, {
        animationName,
        nodePath: usdNode.getPath(),
        nodeName: usdNode.getName(),
        hasTranslation: !!nodeAnim.translations,
        hasRotation: !!nodeAnim.rotations,
        hasScale: !!nodeAnim.scales,
        xformOps
      });
    }

    return {
      duration: maxTime
    };
  }
}

