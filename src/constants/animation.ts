/**
 * Animation Constants
 * 
 * Constants for animation timing and frame rates in USD.
 */
export const ANIMATION = {
  /**
   * Standard frame rate for USD animations.
   * USD viewers expect 24 fps for smooth animation playback.
   * This is the standard frame rate used in most USD workflows.
   */
  FRAME_RATE: 24,

  /**
   * Time codes per second for USD animations.
   * This tells USD viewers how to interpret time samples.
   * With timeCodesPerSecond = 24, animations play at real-time speed.
   */
  TIME_CODES_PER_SECOND: 24,
} as const;

