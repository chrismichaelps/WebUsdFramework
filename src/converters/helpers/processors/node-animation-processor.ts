/**
 * Converts node animations from GLTF to USD format.
 * 
 * Handles animations that move entire objects (not skeleton bones).
 * Applies animations directly to transform nodes using xformOp properties.
 */

import { Animation } from '@gltf-transform/core';
import { UsdNode } from '../../../core/usd-node';
import { Logger } from '../../../utils';
import { ANIMATION } from '../../../constants';
import { IAnimationProcessor, AnimationProcessorContext, AnimationProcessorResult } from '../animation-processor-factory';
import { formatUsdTuple3, formatUsdTuple4 } from '../../../utils/usd-formatter';

/**
 * Stores animation data for a single node.
 * Each node can have translations, rotations, and scales that change over time.
 */
interface NodeAnimationData {
  translations?: Map<number, string>;
  rotations?: Map<number, string>;
  scales?: Map<number, string>;
}

/**
 * Processes node animations and applies them to USD transform nodes.
 */
export class NodeAnimationProcessor implements IAnimationProcessor {
  constructor(private logger: Logger) { }

  /**
   * Checks if this animation moves regular nodes (not skeleton joints).
   * Returns true if the animation has at least one channel with targetPath === 'translation' | 'rotation' | 'scale'
   * and doesn't target any skeleton bones.
   */
  canProcess(animation: Animation, context: AnimationProcessorContext): boolean {
    const channels = animation.listChannels();
    let hasTransformChannels = false;

    // Check if this animation has any transform channels (translation, rotation, scale)
    for (const channel of channels) {
      const targetPath = channel.getTargetPath();
      if (targetPath === 'translation' || targetPath === 'rotation' || targetPath === 'scale') {
        hasTransformChannels = true;

        // Check if this channel targets a skeleton joint
        if (context.skeletonMap && context.skeletonMap.size > 0) {
          const targetNode = channel.getTargetNode();
          if (targetNode) {
            for (const [, skeletonData] of context.skeletonMap) {
              if (skeletonData.jointNodes.has(targetNode)) {
                // This moves skeleton bones, so we can't handle it
                return false;
              }
            }
          }
        }
      }
    }

    // Only return true if we found transform channels (not morph targets or other types)
    return hasTransformChannels;
  }

  /**
   * Converts a GLTF node animation into USD xformOp properties.
   * 
   * Applies translations, rotations, and scales as time-sampled properties
   * on the USD transform nodes.
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

    // Collect all the time points where something animates
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

    // Group animation channels by which node they target
    const nodeAnimations = new Map<UsdNode, NodeAnimationData>();

    this.logger.info(`Processing node animation channels`, {
      animationName,
      totalChannels: channels.length,
      channelTargets: channels.map(ch => ({
        targetNode: ch.getTargetNode()?.getName() || 'null',
        targetPath: ch.getTargetPath(),
        hasSampler: !!ch.getSampler()
      }))
    });

    for (const channel of channels) {
      const targetPath = channel.getTargetPath();

      // Only process transform channels (translation, rotation, scale)
      // Ignore morph target channels (weights) - those are handled by MorphTargetAnimationProcessor
      if (targetPath !== 'translation' && targetPath !== 'rotation' && targetPath !== 'scale') {
        continue;
      }

      const targetNode = channel.getTargetNode();
      if (!targetNode) {
        this.logger.warn(`Channel has no target node`, { animationName });
        continue;
      }

      const usdNode = context.nodeMap.get(targetNode);
      if (!usdNode) {
        this.logger.warn(`USD node not found for GLTF node: ${targetNode.getName()}`, {
          animationName,
          targetNodeName: targetNode.getName()
        });
        continue;
      }

      const sampler = channel.getSampler();
      if (!sampler) {
        this.logger.warn(`Channel has no sampler`, {
          animationName,
          targetNode: targetNode.getName()
        });
        continue;
      }

      const input = sampler.getInput();
      const output = sampler.getOutput();
      if (!input || !output) {
        this.logger.warn(`Channel sampler missing input or output`, {
          animationName,
          targetNode: targetNode.getName(),
          hasInput: !!input,
          hasOutput: !!output
        });
        continue;
      }

      const inputArray = input.getArray();
      const outputArray = output.getArray();
      if (!inputArray || !outputArray) {
        this.logger.warn(`Channel sampler arrays are missing`, {
          animationName,
          targetNode: targetNode.getName(),
          hasInputArray: !!inputArray,
          hasOutputArray: !!outputArray
        });
        continue;
      }

      const times = Array.from(inputArray as Float32Array);
      const values = Array.from(outputArray as Float32Array);

      this.logger.info(`Processing animation channel`, {
        animationName,
        targetNode: targetNode.getName(),
        targetPath,
        timeSampleCount: times.length,
        valueCount: values.length,
        expectedValueCount: targetPath === 'rotation' ? times.length * 4 : times.length * 3
      });

      let nodeAnim = nodeAnimations.get(usdNode);
      if (!nodeAnim) {
        nodeAnim = {};
        nodeAnimations.set(usdNode, nodeAnim);
      }

      // Store animation values for this node at each time point
      const timeSamples = new Map<number, string>();
      const componentCount = targetPath === 'rotation' ? 4 : 3;

      for (let i = 0; i < times.length; i++) {
        const time = times[i];
        const startIdx = i * componentCount;
        const value = values.slice(startIdx, startIdx + componentCount);

        // Make sure we have enough values
        if (value.length < componentCount) {
          this.logger.warn(`Insufficient values for animation sample at time ${time}`, {
            expected: componentCount,
            actual: value.length,
            targetPath,
            nodePath: usdNode.getPath()
          });
          continue;
        }

        // Make sure all values are defined
        if (componentCount === 3) {
          if (value[0] === undefined || value[1] === undefined || value[2] === undefined) {
            this.logger.warn(`Undefined values in animation sample at time ${time}`, {
              values: value,
              targetPath,
              nodePath: usdNode.getPath()
            });
            continue;
          }
        } else {
          if (value[0] === undefined || value[1] === undefined || value[2] === undefined || value[3] === undefined) {
            this.logger.warn(`Undefined values in animation sample at time ${time}`, {
              values: value,
              targetPath,
              nodePath: usdNode.getPath()
            });
            continue;
          }
        }

        let valueString: string;
        if (componentCount === 3) {
          // Format as (x, y, z) tuple
          valueString = formatUsdTuple3(value[0], value[1], value[2]);
        } else {
          // Rotations: GLTF stores (x,y,z,w) but USD wants (w,x,y,z)
          valueString = formatUsdTuple4(value[3], value[0], value[1], value[2]);
        }
        timeSamples.set(time, valueString);
      }

      if (targetPath === 'translation') {
        nodeAnim.translations = timeSamples;
        this.logger.info(`Added translation animation`, {
          animationName,
          nodePath: usdNode.getPath(),
          timeSampleCount: timeSamples.size
        });
      } else if (targetPath === 'rotation') {
        nodeAnim.rotations = timeSamples;
        this.logger.info(`Added rotation animation`, {
          animationName,
          nodePath: usdNode.getPath(),
          timeSampleCount: timeSamples.size
        });
      } else if (targetPath === 'scale') {
        nodeAnim.scales = timeSamples;
        this.logger.info(`Added scale animation`, {
          animationName,
          nodePath: usdNode.getPath(),
          timeSampleCount: timeSamples.size
        });
      } else {
        this.logger.warn(`Unsupported animation target path: ${targetPath}`, {
          animationName,
          targetNode: targetNode.getName(),
          nodePath: usdNode.getPath(),
          supportedPaths: ['translation', 'rotation', 'scale']
        });
      }
    }

    // Apply animations to USD nodes
    if (nodeAnimations.size === 0) {
      this.logger.warn(`No valid node animations found after processing channels`, {
        animationName,
        totalChannels: channels.length
      });
      return {
        duration: maxTime
      };
    }

    for (const [usdNode, nodeAnim] of nodeAnimations) {
      // Remove existing xformOp:transform if present (USD doesn't allow mixing transform types)
      const existingTransform = usdNode.getProperty('xformOp:transform');
      if (existingTransform) {
        const existingOps = usdNode.getProperty('xformOpOrder');
        if (existingOps && Array.isArray(existingOps)) {
          const filteredOps = (existingOps as string[]).filter(op => op !== 'xformOp:transform');
          usdNode.setProperty('xformOpOrder', filteredOps, 'token[]');
        }
      }

      // Build the list of transform operations we'll use
      const xformOps: string[] = [];

      // Helper to convert time samples to USD time codes
      // Multiply times by the time code frame rate and round to integers when close
      const convertTimeSamplesToTimeCodes = (timeSamples: Map<number, string>): Map<number, string> => {
        const timeCodes = new Map<number, string>();

        for (const [timeSeconds, value] of timeSamples) {
          // Multiply by frame rate to get time code
          const s = ANIMATION.TIME_CODE_FPS * timeSeconds;
          // Round to nearest integer
          const r = Math.round(s);
          // If close to integer, use integer; otherwise use continuous value
          const timeCode = Math.abs(s - r) < ANIMATION.SNAP_TIME_CODE_TOL ? r : s;
          timeCodes.set(timeCode, value);
        }

        // Normalize time codes to start at 0
        if (timeCodes.size > 0) {
          const sortedTimeCodes = Array.from(timeCodes.keys()).sort((a, b) => a - b);
          const minTimeCode = sortedTimeCodes[0];

          if (minTimeCode !== 0) {
            // Shift all time codes so the first one becomes 0
            const normalizedTimeCodes = new Map<number, string>();
            for (const [timeCode, value] of timeCodes) {
              const normalizedTimeCode = timeCode - minTimeCode;
              normalizedTimeCodes.set(normalizedTimeCode, value);
            }

            return normalizedTimeCodes;
          }
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

