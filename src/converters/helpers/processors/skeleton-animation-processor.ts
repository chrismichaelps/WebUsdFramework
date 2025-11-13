/**
 * Converts skeleton animations from GLTF to USD format.
 * 
 * Takes animations that move bones/joints and creates SkelAnimation prims
 * that USD can play back. This handles character animations like walking,
 * running, or any movement that involves a skeleton.
 */

import { Animation, Skin } from '@gltf-transform/core';
import { UsdNode } from '../../../core/usd-node';
import { Logger, sanitizeName, formatUsdQuotedArray, TimeCodeConverter } from '../../../utils';
import { formatUsdTuple3, formatUsdTuple4 } from '../../../utils/usd-formatter';
import { ApiSchemaBuilder, API_SCHEMAS } from '../../../utils/api-schema-builder';
import { SkeletonData } from '../skeleton-processor';
import { IAnimationProcessor, AnimationProcessorContext, AnimationProcessorResult } from '../animation-processor-factory';
import { ANIMATION } from '../../../constants';

/**
 * Stores animation data for a single joint (bone).
 * Each joint can have translations, rotations, and scales that change over time.
 */
interface JointAnimationData {
  jointPath: string;
  translations?: Map<number, string>;
  rotations?: Map<number, string>;
  scales?: Map<number, string>;
}

/**
 * Processes skeleton animations and converts them to USD SkelAnimation format.
 */
export class SkeletonAnimationProcessor implements IAnimationProcessor {
  constructor(private logger: Logger) { }

  /**
   * Checks if this animation moves skeleton joints (bones).
   * Returns true if any animation channel targets a joint node.
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
   * Converts a GLTF skeleton animation into a USD SkelAnimation prim.
   * 
   * This function:
   * 1. Finds which skeleton the animation targets
   * 2. Collects all animation times from all joints
   * 3. Detects the actual frame rate from the time intervals
   * 4. Builds arrays of translations, rotations, and scales for each frame
   * 5. Creates a SkelAnimation prim with time-sampled properties
   */
  process(
    animation: Animation,
    animationIndex: number,
    context: AnimationProcessorContext
  ): AnimationProcessorResult | null {
    if (!context.skeletonMap || context.skeletonMap.size === 0) {
      return null;
    }

    // Figure out which skeleton this animation is for
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

    // Get the skeleton data we'll be animating
    const targetSkeleton = context.skeletonMap.get(targetSkin);
    if (!targetSkeleton) {
      return null;
    }

    const animationName = animation.getName() || `Animation_${animationIndex}`;

    // Collect all the time points where something animates
    // We need every time sample so we can build complete arrays for each frame
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

    // Sort times so we can work through them in order
    const sortedAllTimes = Array.from(allAnimationTimes).sort((a, b) => a - b);

    // Figure out the actual frame rate by looking at time intervals
    // This prevents sparse time codes (like 0, 2, 4, 6) and gives us consecutive frames (0, 1, 2, 3)
    let detectedFrameRate: number = ANIMATION.FRAME_RATE;
    if (sortedAllTimes.length > 1) {
      const intervals: number[] = [];
      for (let i = 1; i < Math.min(sortedAllTimes.length, 100); i++) {
        const interval = sortedAllTimes[i] - sortedAllTimes[i - 1];
        if (interval > 0) {
          intervals.push(interval);
        }
      }
      if (intervals.length > 0) {
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        detectedFrameRate = Math.round(1 / avgInterval);
        // Keep frame rate between 24 and 60 fps
        detectedFrameRate = Math.max(24, Math.min(60, detectedFrameRate));
      }
    }

    this.logger.info(`Collected all animation times`, {
      animationName,
      totalUniqueTimes: sortedAllTimes.length,
      firstTime: sortedAllTimes[0],
      lastTime: sortedAllTimes[sortedAllTimes.length - 1],
      duration: sortedAllTimes[sortedAllTimes.length - 1] - sortedAllTimes[0],
      detectedFrameRate,
      defaultFrameRate: ANIMATION.FRAME_RATE,
      first10Times: sortedAllTimes.slice(0, 10),
      last10Times: sortedAllTimes.slice(-10),
      middle10Times: sortedAllTimes.length > 20
        ? sortedAllTimes.slice(Math.floor(sortedAllTimes.length / 2) - 5, Math.floor(sortedAllTimes.length / 2) + 5)
        : []
    });

    // Go through each joint and collect its animation data
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

      // Store the animation values for this joint at each time point
      const timeSamples = new Map<number, string>();
      const componentCount = targetPath === 'rotation' ? 4 : 3;

      for (let i = 0; i < times.length; i++) {
        const time = times[i];
        const startIdx = i * componentCount;
        const value = values.slice(startIdx, startIdx + componentCount);

        let valueString: string;
        if (componentCount === 3) {
          // Format as (x, y, z) tuple with consistent precision
          valueString = formatUsdTuple3(value[0], value[1], value[2]);
        } else {
          // Rotations: GLTF stores (x,y,z,w) but USD wants (w,x,y,z)
          valueString = formatUsdTuple4(value[3], value[0], value[1], value[2]);
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

    // Create the SkelAnimation node as a child of Skeleton
    // Structure: SkelRoot -> Skeleton -> SkelAnimation
    const skeletonPrimNode = targetSkeleton.skeletonPrimNode;
    const skeletonPrimPath = skeletonPrimNode.getPath();
    const skeletonPrimName = skeletonPrimNode.getName();
    const sanitizedName = sanitizeName(animationName);
    const animationPath = `${skeletonPrimPath}/${skeletonPrimName}_${sanitizedName}`;

    const skelAnimationNode = new UsdNode(animationPath, 'SkelAnimation');

    // Use relative joint paths (like "root", "root/body")
    // These must match the paths used in the Skeleton prim's joints array
    const allSkeletonJointRelativePaths = targetSkeleton.jointRelativePaths || targetSkeleton.jointPaths;
    const allSkeletonJointPaths = targetSkeleton.jointPaths;

    const sortedTimes = sortedAllTimes;

    // USD needs translations, rotations, and scales at every time point
    // If a joint doesn't animate at a specific time, we use the closest value we have
    const translations = new Map<number, string[]>();
    const rotations = new Map<number, string[]>();
    const scales = new Map<number, string[]>();

    // Helper to get a value at a specific time, using the closest match if needed
    const getValueAtTime = (timeSamples: Map<number, string>, time: number, defaultValue: string): string => {
      if (timeSamples.has(time)) {
        return timeSamples.get(time)!;
      }

      // Find the closest time sample we have
      const sorted = Array.from(timeSamples.keys()).sort((a, b) => a - b);
      if (sorted.length === 0) return defaultValue;

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

    // Build arrays for each time point with values for all joints
    for (const time of sortedTimes) {
      const transArray: string[] = [];
      const rotArray: string[] = [];
      const scaleArray: string[] = [];

      for (const jointPath of allSkeletonJointPaths) {
        const jointAnim = jointAnimations.get(jointPath);

        // Get translation, using default if this joint doesn't animate
        if (jointAnim?.translations) {
          transArray.push(getValueAtTime(jointAnim.translations, time, '(0, 0, 0)'));
        } else {
          transArray.push('(0, 0, 0)');
        }

        // Get rotation, using default if this joint doesn't animate
        if (jointAnim?.rotations) {
          rotArray.push(getValueAtTime(jointAnim.rotations, time, '(1, 0, 0, 0)'));
        } else {
          rotArray.push('(1, 0, 0, 0)');
        }

        // Get scale, using default if this joint doesn't animate
        if (jointAnim?.scales) {
          scaleArray.push(getValueAtTime(jointAnim.scales, time, '(1, 1, 1)'));
        } else {
          scaleArray.push('(1, 1, 1)');
        }
      }

      // Store arrays for this time point
      translations.set(time, transArray);
      rotations.set(time, rotArray);
      scales.set(time, scaleArray);
    }

    // Make sure translations, rotations, and scales all have values at the same times
    // USD requires all three to use identical time samples
    const allCommonTimes = new Set<number>();
    for (const time of translations.keys()) allCommonTimes.add(time);
    for (const time of rotations.keys()) allCommonTimes.add(time);
    for (const time of scales.keys()) allCommonTimes.add(time);

    const sortedCommonTimes = Array.from(allCommonTimes).sort((a, b) => a - b);

    // Fill in any missing values so all three components have data at every time
    for (const time of sortedCommonTimes) {
      if (!translations.has(time)) {
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

    // Make the animation loop by copying the first frame to the end
    if (sortedCommonTimes.length > 1) {
      const firstTime = sortedCommonTimes[0];
      const lastTime = sortedCommonTimes[sortedCommonTimes.length - 1];

      if (firstTime !== lastTime) {
        translations.set(lastTime, [...translations.get(firstTime)!]);
        rotations.set(lastTime, [...rotations.get(firstTime)!]);
        scales.set(lastTime, [...scales.get(firstTime)!]);
      }
    }

    // Set the joints array using relative paths
    const jointsArray = formatUsdQuotedArray(allSkeletonJointRelativePaths);
    skelAnimationNode.setProperty('uniform token[] joints', jointsArray, 'raw');

    // Convert times from seconds to frame numbers
    // Using the detected frame rate ensures we get consecutive frames (0,1,2,3) instead of sparse ones (0,2,4,6)
    this.logger.info('Converting time samples to time codes', {
      animationName,
      translationsSize: translations.size,
      rotationsSize: rotations.size,
      scalesSize: scales.size,
      firstTimeInSeconds: sortedCommonTimes[0],
      lastTimeInSeconds: sortedCommonTimes[sortedCommonTimes.length - 1],
      detectedFrameRate,
      usingFrameRate: detectedFrameRate
    });

    const transTimeCodes = TimeCodeConverter.convertArraysToTimeCodes(translations, detectedFrameRate);
    const rotTimeCodes = TimeCodeConverter.convertArraysToTimeCodes(rotations, detectedFrameRate);
    const scaleTimeCodes = TimeCodeConverter.convertArraysToTimeCodes(scales, detectedFrameRate);

    // Get the first frame values to use as defaults (the rest pose)
    const timeCode0Translations = transTimeCodes.get(0);
    const timeCode0Rotations = rotTimeCodes.get(0);
    const timeCode0Scales = scaleTimeCodes.get(0);

    // Use time code 0 values if available, otherwise fall back to first time in seconds
    const firstTime = sortedCommonTimes[0];
    const defaultTranslations = timeCode0Translations || (translations.has(firstTime) ? `[${translations.get(firstTime)!.join(', ')}]` : `[${allSkeletonJointPaths.map(() => '(0, 0, 0)').join(', ')}]`);
    const defaultRotations = timeCode0Rotations || (rotations.has(firstTime) ? `[${rotations.get(firstTime)!.join(', ')}]` : `[${allSkeletonJointPaths.map(() => '(1, 0, 0, 0)').join(', ')}]`);
    const defaultScales = timeCode0Scales || (scales.has(firstTime) ? `[${scales.get(firstTime)!.join(', ')}]` : `[${allSkeletonJointPaths.map(() => '(1, 1, 1)').join(', ')}]`);

    // Set default values (the pose before animation starts)
    skelAnimationNode.setProperty('float3[] translations', defaultTranslations, 'raw');
    skelAnimationNode.setProperty('quatf[] rotations', defaultRotations, 'raw');
    skelAnimationNode.setProperty('half3[] scales', defaultScales, 'raw');

    // Set the time-sampled animation data
    if (transTimeCodes.size > 0) {
      skelAnimationNode.setTimeSampledProperty('float3[] translations', transTimeCodes, 'float3[]');
    }

    if (rotTimeCodes.size > 0) {
      skelAnimationNode.setTimeSampledProperty('quatf[] rotations', rotTimeCodes, 'quatf[]');
    }

    if (scaleTimeCodes.size > 0) {
      skelAnimationNode.setTimeSampledProperty('half3[] scales', scaleTimeCodes, 'half3[]');
    }

    // Add SkelAnimation as a child of Skeleton
    skeletonPrimNode.addChild(skelAnimationNode);
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
      name: `${skeletonPrimName}_${sanitizedName}`,
      detectedFrameRate,
      animationSource: {
        path: animationPath,
        name: `${skeletonPrimName}_${sanitizedName}`,
        index: animationIndex,
        targetSkin
      }
    };
  }
}

/**
 * Tells USDZ viewers which animation to play by setting the animation source.
 * 
 * This connects the skeleton to its SkelAnimation so viewers know what to play.
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

    const firstAnimationSource = `<${animationSources[0].path}>`;

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

    // Set animation source on Skeleton prim
    if (skelPrim) {
      ApiSchemaBuilder.addApiSchema(skelPrim, API_SCHEMAS.SKEL_BINDING);
      skelPrim.setProperty('rel skel:animationSource', firstAnimationSource, 'rel');
    } else {
      // Fallback to SkelRoot if Skeleton prim isn't available
      ApiSchemaBuilder.addApiSchema(skelRootNode, API_SCHEMAS.SKEL_BINDING);
      skelRootNode.setProperty('rel skel:animationSource', firstAnimationSource, 'rel');
    }

    // Set the default animation name in customData
    if (animationSources.length > 0) {
      const firstAnim = animationSources[0];
      skelRootNode.setProperty('customData', { defaultAnimation: firstAnim.name });
      logger.info('Set customData.defaultAnimation on SkelRoot', {
        skelRootPath: skelRootNode.getPath(),
        defaultAnimation: firstAnim.name,
        animationPath: firstAnim.path
      });
    }

    logger.info(`Set all animations on skeleton`, {
      skeletonPath: skelRootNode.getPath(),
      animationCount: animationSources.length,
      animations: animationSources.map(a => ({ index: a.index, name: a.name }))
    });
  }
}

