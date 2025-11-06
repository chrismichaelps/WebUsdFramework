/**
 * Time Code Converter
 * 
 * Handles conversion between animation time formats (seconds vs time codes).
 * GLTF animations use time in seconds, but USD requires integer time codes (frame numbers)
 * for proper animation playback.
 */

import { formatUsdArray } from './usd-formatter';
import { ANIMATION } from '../constants';

/**
 * Time sample data in seconds (GLTF format).
 * Maps time in seconds to animation values.
 */
type TimeSamplesInSeconds<T> = Map<number, T>;

/**
 * Time sample data in time codes (USD format).
 * Maps frame numbers to animation values.
 */
type TimeSamplesInTimeCodes<T> = Map<number, T>;


/**
 * Converter for handling time code conversions.
 * 
 * Converts between GLTF's time-in-seconds format and USD's frame-based time code format.
 * Operations are immutable - they return new maps instead of mutating existing ones.
 */
export class TimeCodeConverter {
  /**
   * Converts time samples from seconds (GLTF format) to time codes (USD format).
   * 
   * USD expects integer time codes (frame numbers) for proper animation playback.
   * This function converts fractional seconds like 0.0333 to integer frames like 1.
   */
  private static convertToTimeCodes<T>(
    timeSamples: TimeSamplesInSeconds<T>
  ): TimeSamplesInTimeCodes<T> {
    if (!timeSamples || timeSamples.size === 0) {
      return new Map();
    }

    const frameRate = ANIMATION.FRAME_RATE;

    // Convert each time sample to a time code
    const timeCodeMap = new Map<number, { time: number; value: T }[]>();
    const times = Array.from(timeSamples.keys()).sort((a, b) => a - b);

    for (const timeSeconds of times) {
      const timeCode = Math.round(timeSeconds * frameRate);
      const value = timeSamples.get(timeSeconds)!;

      if (!timeCodeMap.has(timeCode)) {
        timeCodeMap.set(timeCode, []);
      }
      timeCodeMap.get(timeCode)!.push({ time: timeSeconds, value });
    }

    // Handle duplicates - use the last value (most recent)
    const finalTimeCodes = new Map<number, T>();

    for (const [timeCode, entries] of timeCodeMap) {
      if (entries.length > 1) {
        // Use the last value when multiple samples map to the same frame
        finalTimeCodes.set(timeCode, entries[entries.length - 1].value);
      } else {
        finalTimeCodes.set(timeCode, entries[0].value);
      }
    }

    return finalTimeCodes;
  }

  /**
   * Converts time samples with array values (like translations, rotations, scales)
   * from seconds to time codes, formatting the arrays as USD strings.
   * 
   * This is specifically for USD SkelAnimation properties that need formatted array strings.
   */
  static convertArraysToTimeCodes(
    timeSamples: TimeSamplesInSeconds<string[]>
  ): TimeSamplesInTimeCodes<string> {
    const timeCodes = this.convertToTimeCodes(timeSamples);

    // Format arrays as USD strings
    const formattedTimeCodes = new Map<number, string>();
    for (const [timeCode, array] of timeCodes) {
      formattedTimeCodes.set(timeCode, formatUsdArray(array));
    }

    return formattedTimeCodes;
  }
}

