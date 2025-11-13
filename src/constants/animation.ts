/**
 * Animation Constants
 * 
 * Constants for animation timing and frame rates in USD.
 */
export const ANIMATION = {
  /**
   * Standard frame rate for USD animations.
   * USD viewers expect 60 fps for smooth animation playback.
   * This is the standard frame rate used in most USD workflows.
   */
  FRAME_RATE: 60,

  /**
   * Time codes per second for USD animations.
   * This tells USD viewers how to interpret time samples.
   * With timeCodesPerSecond = 60, animations play at real-time speed.
   */
  TIME_CODES_PER_SECOND: 60,
} as const;

