/**
 * Animation Processor
 * 
 * Converts GLTF animations to USD time samples.
 * Handles translation, rotation, scale animations.
 */

import { Document, Node } from '@gltf-transform/core';
import { UsdNode } from '../../core/usd-node';
import { Logger } from '../../utils';

/**
 * Time sample entry
 */
interface TimeSample {
  time: number;
  value: string | number | number[];
}

/**
 * Animation data for a node
 */
interface NodeAnimationData {
  node: Node;
  usdNode: UsdNode;
  translations?: TimeSample[];
  rotations?: TimeSample[];
  scales?: TimeSample[];
}

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
 * Process animations from GLTF document and apply to USD nodes
 * Returns time code metadata if animations are present
 */
export function processAnimations(
  document: Document,
  nodeMap: Map<Node, UsdNode>,
  logger: Logger
): AnimationTimeCode | null {
  const root = document.getRoot();
  const animations = root.listAnimations();

  if (animations.length === 0) {
    logger.info('No animations found in GLTF document');
    return null;
  }

  logger.info(`Processing ${animations.length} animations`, {
    animationCount: animations.length
  });

  // Map to collect animation data per node
  const animationDataMap = new Map<Node, NodeAnimationData>();
  let minTime = Infinity;
  let maxTime = -Infinity;

  // Process each animation
  for (const animation of animations) {
    const channels = animation.listChannels();

    for (const channel of channels) {
      const targetNode = channel.getTargetNode();
      if (!targetNode) continue;

      const usdNode = nodeMap.get(targetNode);
      if (!usdNode) {
        logger.warn(`USD node not found for GLTF node: ${targetNode.getName()}`);
        continue;
      }

      const targetPath = channel.getTargetPath();
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

      // Track min/max times for time code metadata
      if (times.length > 0) {
        minTime = Math.min(minTime, ...times);
        maxTime = Math.max(maxTime, ...times);
      }

      // Get or create animation data for this node
      let animData = animationDataMap.get(targetNode);
      if (!animData) {
        animData = {
          node: targetNode,
          usdNode
        };
        animationDataMap.set(targetNode, animData);
      }

      // Process based on target path
      if (targetPath === 'translation') {
        animData.translations = createTimeSamples(times, values, 3);
      } else if (targetPath === 'rotation') {
        animData.rotations = createTimeSamples(times, values, 4);
      } else if (targetPath === 'scale') {
        animData.scales = createTimeSamples(times, values, 3);
      }
    }
  }

  // Apply animation data to USD nodes
  for (const animData of animationDataMap.values()) {
    applyNodeAnimations(animData, logger);
  }

  logger.info(`Applied animations to ${animationDataMap.size} nodes`);

  // Return time code metadata
  // USD time codes are in frames, not seconds
  // Convert time (seconds) to frames using framesPerSecond
  if (minTime !== Infinity && maxTime !== -Infinity) {
    const framesPerSecond = 24;
    const timeCodesPerSecond = 24;

    // Convert seconds to frames
    // Reference uses endTimeCode = 601 for maxTime = 25.0, so use ceil + 1 to match
    const startFrame = Math.floor(minTime * framesPerSecond);
    const endFrame = Math.ceil(maxTime * framesPerSecond) + 1; // Add 1 to match reference format

    return {
      startTimeCode: startFrame,
      endTimeCode: endFrame,
      timeCodesPerSecond,
      framesPerSecond
    };
  }

  return null;
}

/**
 * Create time samples from time and value arrays
 */
function createTimeSamples(
  times: number[],
  values: number[],
  componentCount: number
): TimeSample[] {
  const samples: TimeSample[] = [];
  const valueCount = values.length / componentCount;

  for (let i = 0; i < times.length && i < valueCount; i++) {
    const time = times[i];
    const startIdx = i * componentCount;
    const value = values.slice(startIdx, startIdx + componentCount);

    let valueString: string;
    if (componentCount === 3) {
      valueString = `(${value[0]}, ${value[1]}, ${value[2]})`;
    } else if (componentCount === 4) {
      // Quaternion rotation: Convert from GLTF (x, y, z, w) to USD quatf (w, x, y, z) format to match reference
      // GLTF stores quaternions as (x, y, z, w), USD quatf expects (w, x, y, z)
      valueString = `(${value[3]}, ${value[0]}, ${value[1]}, ${value[2]})`;
    } else {
      valueString = `(${value.join(', ')})`;
    }

    samples.push({ time, value: valueString });
  }

  return samples;
}

/**
 * Apply animation data to a USD node
 */
function applyNodeAnimations(
  animData: NodeAnimationData,
  _logger: Logger
): void {
  const { usdNode, translations, rotations, scales } = animData;

  // Build xformOpOrder based on what we're animating
  // Order: translate, orient, scale (USD convention - matches reference)
  const xformOps: string[] = [];

  // Process translations (use double3 for precision)
  if (translations && translations.length > 0) {
    const timeSamples = formatTimeSamples(translations);
    usdNode.setTimeSampledProperty('xformOp:translate', timeSamples, 'double3');
    xformOps.push('xformOp:translate');
  }

  // Process rotations (keep as quaternions using xformOp:orient)
  if (rotations && rotations.length > 0) {
    // Keep quaternions as-is, use xformOp:orient (USD convention)
    const timeSamples = formatTimeSamples(rotations);
    usdNode.setTimeSampledProperty('xformOp:orient', timeSamples, 'quatf');
    xformOps.push('xformOp:orient');
  }

  // Process scales (use double3 for precision)
  if (scales && scales.length > 0) {
    const timeSamples = formatTimeSamples(scales);
    usdNode.setTimeSampledProperty('xformOp:scale', timeSamples, 'double3');
    xformOps.push('xformOp:scale');
  }

  // Set xformOpOrder if we have any operations
  // USD doesn't allow mixing xformOp:transform (matrix) with individual ops
  // So we need to remove xformOp:transform if present and use individual ops instead
  if (xformOps.length > 0) {
    // Get existing xformOpOrder if present
    const existingOrder = usdNode.getProperty('xformOpOrder');
    if (existingOrder && Array.isArray(existingOrder)) {
      // Filter out xformOp:transform if present (can't mix with individual ops)
      const existingOps = (existingOrder as string[]).filter(op => op !== 'xformOp:transform');

      // Remove xformOp:transform property if it exists
      if (usdNode.getProperty('xformOp:transform')) {
        // We can't directly remove properties, but we can set xformOpOrder without it
        // The xformOp:transform will be ignored when xformOpOrder doesn't include it
      }

      // Merge: keep existing non-animated ops (excluding xformOp:transform), add new animated ops
      const newOps = [...existingOps];

      // Add new ops that aren't already present
      for (const op of xformOps) {
        if (!newOps.includes(op)) {
          newOps.push(op);
        }
      }

      usdNode.setProperty('xformOpOrder', newOps, 'token[]');
    } else {
      usdNode.setProperty('xformOpOrder', xformOps, 'token[]');
    }
  }
}


/**
 * Format time samples for USDA output
 * Converts time from seconds to frames (based on 24 fps)
 */
function formatTimeSamples(samples: TimeSample[]): Map<number, string> {
  const timeSamples = new Map<number, string>();
  const framesPerSecond = 24;

  for (const sample of samples) {
    // Convert time from seconds to frames
    const timeInFrames = sample.time * framesPerSecond;
    timeSamples.set(timeInFrames, sample.value as string);
  }
  return timeSamples;
}

