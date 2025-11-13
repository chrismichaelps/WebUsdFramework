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

    // Get the actual skeleton joint paths - if we omitted the root joint, it won't be in this list
    // even though jointNodes might still reference it
    const skeletonJointPaths = targetSkeleton.jointPaths;
    const skeletonJointPathsSet = new Set(skeletonJointPaths);

    // Collect all animation time points from all joints
    // We need every time sample to build complete arrays for each frame
    // Skip joints that aren't in the final skeleton (like omitted root joint)
    const allAnimationTimes = new Set<number>();
    let maxTime = 0;

    for (const channel of channels) {
      const targetNode = channel.getTargetNode();
      if (!targetNode || !targetSkeleton.jointNodes.has(targetNode)) continue;

      const jointUsdNode = targetSkeleton.jointNodes.get(targetNode);
      if (!jointUsdNode) continue;

      const jointPath = jointUsdNode.getPath();

      // Skip this joint if it's not in the final skeleton (e.g., omitted root joint)
      if (!skeletonJointPathsSet.has(jointPath)) {
        continue;
      }

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
        const rawFrameRate = 1 / avgInterval;
        // Round to nearest standard frame rate (24, 30, 60)
        const standardRates = [24, 30, 60];
        detectedFrameRate = standardRates.reduce((prev, curr) =>
          Math.abs(curr - rawFrameRate) < Math.abs(prev - rawFrameRate) ? curr : prev
        );
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

    // Collect animation data for each joint
    // Only process joints that are in the final skeleton (skip omitted root joint)
    const jointAnimations = new Map<string, JointAnimationData>();
    const collectedJointPaths = new Set<string>();

    for (const channel of channels) {
      const targetNode = channel.getTargetNode();
      if (!targetNode || !targetSkeleton.jointNodes.has(targetNode)) continue;

      const jointUsdNode = targetSkeleton.jointNodes.get(targetNode);
      if (!jointUsdNode) continue;

      const jointPath = jointUsdNode.getPath();

      // Skip joints that aren't in the final skeleton (e.g., omitted root joint)
      if (!skeletonJointPathsSet.has(jointPath)) {
        this.logger.debug('Skipping animation data for omitted joint', {
          jointPath,
          jointName: targetNode.getName(),
          rootJointOmitted: targetSkeleton.rootJointOmitted
        });
        continue;
      }

      collectedJointPaths.add(jointPath);

      this.logger.debug('Collecting animation data for joint', {
        jointPath,
        jointName: targetNode.getName(),
        targetPath: channel.getTargetPath(),
        isInSkeleton: skeletonJointPathsSet.has(jointPath)
      });

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
    // skeletonJointPaths was already defined above when filtering animation channels

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
    // IMPORTANT: Joint order in animation arrays must match skeleton joints array exactly
    // We iterate over skeleton joints in order (not animation channels) to guarantee correct mapping
    for (const time of sortedTimes) {
      const transArray: string[] = [];
      const rotArray: string[] = [];
      const scaleArray: string[] = [];

      // Use rest pose translations as defaults for joints without translation animation
      const restPoseTranslations = targetSkeleton.restPoseTranslations || [];

      if (time === sortedTimes[0] && restPoseTranslations.length > 0) {
        this.logger.debug('Using rest pose translations as defaults', {
          animationName,
          restPoseTranslationCount: restPoseTranslations.length,
          skeletonJointCount: skeletonJointPaths.length,
          first3RestPoseTranslations: restPoseTranslations.slice(0, 3)
        });
      }

      // Iterate over skeleton joints in their exact order to ensure correct mapping
      for (let i = 0; i < skeletonJointPaths.length; i++) {
        const jointPath = skeletonJointPaths[i];
        const jointAnim = jointAnimations.get(jointPath);

        // Use rest pose translation if this joint doesn't have translation animation
        // This prevents joints from defaulting to (0, 0, 0) when they should use their rest pose position
        const defaultTranslation = i < restPoseTranslations.length ? restPoseTranslations[i] : '(0, 0, 0)';
        if (jointAnim?.translations) {
          transArray.push(getValueAtTime(jointAnim.translations, time, defaultTranslation));
        } else {
          transArray.push(defaultTranslation);
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

    // Validate that animation arrays match skeleton joint count
    // IMPORTANT: Joint order in animation arrays must match skeleton joints array exactly
    const validationTime = sortedTimes[0];
    if (translations.has(validationTime)) {
      const transLength = translations.get(validationTime)!.length;
      const expectedLength = skeletonJointPaths.length;
      if (transLength !== expectedLength) {
        this.logger.error('Animation array length mismatch!', {
          animationName,
          expectedLength,
          actualLength: transLength,
          skeletonJointCount: expectedLength
        });
      } else {
        // Log joint order info to help debug skeleton mapping issues
        const firstJointPath = skeletonJointPaths[0];
        const lastJointPath = skeletonJointPaths[skeletonJointPaths.length - 1];
        const animatedJointCount = jointAnimations.size;
        this.logger.info('Animation array length matches skeleton joints', {
          animationName,
          arrayLength: transLength,
          skeletonJointCount: expectedLength,
          animatedJointCount,
          firstSkeletonJointPath: firstJointPath,
          lastSkeletonJointPath: lastJointPath,
          firstAnimatedJointPath: Array.from(jointAnimations.keys())[0] || 'none',
          skeletonJointOrderPreserved: true
        });

        // Log which joints have animation data vs which don't
        const jointsWithoutAnimation: string[] = [];
        for (let i = 0; i < skeletonJointPaths.length; i++) {
          const jointPath = skeletonJointPaths[i];
          if (!jointAnimations.has(jointPath)) {
            jointsWithoutAnimation.push(jointPath);
          }
        }

        if (jointsWithoutAnimation.length > 0) {
          this.logger.warn('Some skeleton joints have no animation data', {
            animationName,
            jointsWithoutAnimationCount: jointsWithoutAnimation.length,
            first5WithoutAnimation: jointsWithoutAnimation.slice(0, 5).map(p => p.split('/').pop() || p),
            totalSkeletonJoints: skeletonJointPaths.length,
            totalAnimatedJoints: jointAnimations.size
          });
        } else {
          this.logger.info('All skeleton joints have animation data', {
            animationName,
            totalJoints: skeletonJointPaths.length
          });
        }

        // Log collected joint paths vs skeleton joint paths
        this.logger.info('Animation data collection summary', {
          animationName,
          collectedJointPathsCount: collectedJointPaths.size,
          skeletonJointPathsCount: skeletonJointPaths.length,
          collectedJointNames: Array.from(collectedJointPaths).slice(0, 5).map(p => p.split('/').pop() || p),
          skeletonJointNames: skeletonJointPaths.slice(0, 5).map(p => p.split('/').pop() || p),
          allCollectedMatchSkeleton: skeletonJointPaths.every(p => collectedJointPaths.has(p))
        });
      }
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
        translations.set(time, translations.has(firstTime) ? [...translations.get(firstTime)!] : skeletonJointPaths.map(() => '(0, 0, 0)'));
      }
      if (!rotations.has(time)) {
        const firstTime = sortedCommonTimes[0];
        rotations.set(time, rotations.has(firstTime) ? [...rotations.get(firstTime)!] : skeletonJointPaths.map(() => '(1, 0, 0, 0)'));
      }
      if (!scales.has(time)) {
        const firstTime = sortedCommonTimes[0];
        scales.set(time, scales.has(firstTime) ? [...scales.get(firstTime)!] : skeletonJointPaths.map(() => '(1, 1, 1)'));
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

    // Resample animation at regular intervals with proper interpolation
    // This gives us smooth animation and consecutive time codes that USD expects
    this.logger.info('Resampling animation at regular intervals', {
      animationName,
      originalSampleCount: sortedCommonTimes.length,
      firstTimeInSeconds: sortedCommonTimes[0],
      lastTimeInSeconds: sortedCommonTimes[sortedCommonTimes.length - 1],
      detectedFrameRate,
      usingFrameRate: detectedFrameRate
    });

    // Resample at regular intervals using standard interpolation methods
    // Linear interpolation for translations/scales, slerp (spherical linear interpolation) for rotations
    const resampleAtRegularIntervals = (
      timeSamples: Map<number, string[]>,
      startTime: number,
      endTime: number,
      frameRate: number,
      isRotation: boolean = false
    ): Map<number, string[]> => {
      const sortedOriginalTimes = Array.from(timeSamples.keys()).sort((a, b) => a - b);
      const resampled = new Map<number, string[]>();
      const frameInterval = 1 / frameRate;

      // Helper to interpolate between two tuples
      const interpolateTuple = (prev: number[], next: number[], t: number): number[] => {
        if (prev.length !== next.length) return prev;
        return prev.map((p, i) => p + (next[i] - p) * t);
      };

      // Helper to interpolate quaternion (slerp)
      const slerp = (q1: number[], q2: number[], t: number): number[] => {
        if (q1.length !== 4 || q2.length !== 4) return q1;
        const [w1, x1, y1, z1] = q1;
        const [w2, x2, y2, z2] = q2;

        let dot = w1 * w2 + x1 * x2 + y1 * y2 + z1 * z2;
        if (dot < 0) {
          dot = -dot;
          const negQ2 = [-w2, -x2, -y2, -z2];
          return slerp(q1, negQ2, t);
        }

        if (dot > 0.9995) {
          return interpolateTuple(q1, q2, t);
        }

        const theta = Math.acos(Math.max(-1, Math.min(1, dot)));
        const sinTheta = Math.sin(theta);
        const w = Math.sin((1 - t) * theta) / sinTheta;
        const v = Math.sin(t * theta) / sinTheta;

        return [
          w * w1 + v * w2,
          w * x1 + v * x2,
          w * y1 + v * y2,
          w * z1 + v * z2
        ];
      };

      // Helper to get value at a specific time by interpolating between keyframes
      const getValueAtTime = (time: number): string[] => {
        // Find surrounding keyframes
        let prevTime = sortedOriginalTimes[0];
        let nextTime = sortedOriginalTimes[sortedOriginalTimes.length - 1];

        for (let i = 0; i < sortedOriginalTimes.length; i++) {
          if (sortedOriginalTimes[i] <= time) {
            prevTime = sortedOriginalTimes[i];
          }
          if (sortedOriginalTimes[i] >= time && nextTime >= time) {
            nextTime = sortedOriginalTimes[i];
            break;
          }
        }

        // If exact match, return it
        if (prevTime === time && timeSamples.has(time)) {
          return timeSamples.get(time)!;
        }

        // If at edges, return closest
        if (time <= prevTime) {
          return timeSamples.get(prevTime)!;
        }
        if (time >= nextTime) {
          return timeSamples.get(nextTime)!;
        }

        // Interpolate between prev and next
        const prevValue = timeSamples.get(prevTime)!;
        const nextValue = timeSamples.get(nextTime)!;
        const t = (time - prevTime) / (nextTime - prevTime);

        // Parse tuples and interpolate each joint
        const parseTuple = (tupleStr: string): number[] => {
          const match = tupleStr.match(/\(([^)]+)\)/);
          if (!match) return [];
          return match[1].split(',').map(s => parseFloat(s.trim()));
        };

        const interpolated: string[] = [];
        for (let i = 0; i < prevValue.length && i < nextValue.length; i++) {
          const prevTuple = parseTuple(prevValue[i]);
          const nextTuple = parseTuple(nextValue[i]);

          if (prevTuple.length === 0 || nextTuple.length === 0) {
            interpolated.push(prevValue[i]);
            continue;
          }

          let result: number[];
          if (isRotation && prevTuple.length === 4 && nextTuple.length === 4) {
            result = slerp(prevTuple, nextTuple, t);
          } else {
            result = interpolateTuple(prevTuple, nextTuple, t);
          }

          if (result.length === 3) {
            interpolated.push(formatUsdTuple3(result[0], result[1], result[2]));
          } else if (result.length === 4) {
            interpolated.push(formatUsdTuple4(result[0], result[1], result[2], result[3]));
          } else {
            interpolated.push(prevValue[i]);
          }
        }

        return interpolated;
      };

      // Resample at regular intervals to create evenly spaced samples
      // These will map to consecutive time codes (0, 1, 2, 3...)
      for (let time = startTime; time <= endTime + frameInterval * 0.5; time += frameInterval) {
        // Clamp to end time to avoid floating point precision issues
        const clampedTime = Math.min(time, endTime);
        resampled.set(clampedTime, getValueAtTime(clampedTime));
      }

      return resampled;
    };

    // Resample all animation data at regular intervals using proper interpolation
    const resampledTranslations = resampleAtRegularIntervals(
      translations,
      sortedCommonTimes[0],
      sortedCommonTimes[sortedCommonTimes.length - 1],
      detectedFrameRate,
      false
    );
    const resampledRotations = resampleAtRegularIntervals(
      rotations,
      sortedCommonTimes[0],
      sortedCommonTimes[sortedCommonTimes.length - 1],
      detectedFrameRate,
      true
    );
    const resampledScales = resampleAtRegularIntervals(
      scales,
      sortedCommonTimes[0],
      sortedCommonTimes[sortedCommonTimes.length - 1],
      detectedFrameRate,
      false
    );

    // Convert resampled data to time codes
    // After resampling at regular intervals, time codes should be consecutive (0, 1, 2, 3...)
    const transTimeCodes = TimeCodeConverter.convertArraysToTimeCodes(resampledTranslations, detectedFrameRate);
    const rotTimeCodes = TimeCodeConverter.convertArraysToTimeCodes(resampledRotations, detectedFrameRate);
    const scaleTimeCodes = TimeCodeConverter.convertArraysToTimeCodes(resampledScales, detectedFrameRate);

    // Make sure time codes are consecutive (handle any floating point precision edge cases)
    const ensureConsecutive = (timeCodes: Map<number, string>): Map<number, string> => {
      if (timeCodes.size === 0) return timeCodes;

      const sortedTimeCodes = Array.from(timeCodes.keys()).sort((a, b) => a - b);
      const minTimeCode = sortedTimeCodes[0];
      const maxTimeCode = sortedTimeCodes[sortedTimeCodes.length - 1];

      const filledTimeCodes = new Map<number, string>();

      // After resampling, gaps should be minimal - just fill any missing frames
      for (let frame = minTimeCode; frame <= maxTimeCode; frame++) {
        if (timeCodes.has(frame)) {
          filledTimeCodes.set(frame, timeCodes.get(frame)!);
        } else {
          // Find closest frame (should be rare after resampling)
          let closestFrame = minTimeCode;
          let minDiff = Math.abs(frame - minTimeCode);
          for (const tc of sortedTimeCodes) {
            const diff = Math.abs(frame - tc);
            if (diff < minDiff) {
              minDiff = diff;
              closestFrame = tc;
            }
          }
          filledTimeCodes.set(frame, timeCodes.get(closestFrame)!);
        }
      }

      return filledTimeCodes;
    };

    // Fill any gaps to ensure consecutive time codes
    const filledTransTimeCodes = ensureConsecutive(transTimeCodes);
    const filledRotTimeCodes = ensureConsecutive(rotTimeCodes);
    const filledScaleTimeCodes = ensureConsecutive(scaleTimeCodes);

    // Get the first frame values to use as defaults (the rest pose)
    const timeCode0Translations = filledTransTimeCodes.get(0);
    const timeCode0Rotations = filledRotTimeCodes.get(0);
    const timeCode0Scales = filledScaleTimeCodes.get(0);

    // Use time code 0 values if available, otherwise fall back to first time in seconds
    const firstTime = sortedCommonTimes[0];
    const defaultTranslations = timeCode0Translations || (translations.has(firstTime) ? `[${translations.get(firstTime)!.join(', ')}]` : `[${skeletonJointPaths.map(() => '(0, 0, 0)').join(', ')}]`);
    const defaultRotations = timeCode0Rotations || (rotations.has(firstTime) ? `[${rotations.get(firstTime)!.join(', ')}]` : `[${skeletonJointPaths.map(() => '(1, 0, 0, 0)').join(', ')}]`);
    const defaultScales = timeCode0Scales || (scales.has(firstTime) ? `[${scales.get(firstTime)!.join(', ')}]` : `[${skeletonJointPaths.map(() => '(1, 1, 1)').join(', ')}]`);

    // Set default values (the pose before animation starts)
    skelAnimationNode.setProperty('float3[] translations', defaultTranslations, 'raw');
    skelAnimationNode.setProperty('quatf[] rotations', defaultRotations, 'raw');
    skelAnimationNode.setProperty('half3[] scales', defaultScales, 'raw');

    // Set the time-sampled animation data
    if (filledTransTimeCodes.size > 0) {
      skelAnimationNode.setTimeSampledProperty('float3[] translations', filledTransTimeCodes, 'float3[]');
    }

    if (filledRotTimeCodes.size > 0) {
      skelAnimationNode.setTimeSampledProperty('quatf[] rotations', filledRotTimeCodes, 'quatf[]');
    }

    if (filledScaleTimeCodes.size > 0) {
      skelAnimationNode.setTimeSampledProperty('half3[] scales', filledScaleTimeCodes, 'half3[]');
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
    }

    // Also set animation source on SkelRoot - Xcode/RealityKit needs it here, not just on the Skeleton prim
    ApiSchemaBuilder.addApiSchema(skelRootNode, API_SCHEMAS.SKEL_BINDING);
    skelRootNode.setProperty('rel skel:animationSource', firstAnimationSource, 'rel');

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

