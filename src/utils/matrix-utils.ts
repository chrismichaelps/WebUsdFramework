/**
 * Matrix Utilities
 * 
 * Formats 4x4 transformation matrices for USD.
 * USD uses row-major matrix format, so we keep the formatting consistent here.
 */

/**
 * Identity matrix in USD format (row-major).
 * This is the default transform when no transformation is applied.
 */
export const IDENTITY_MATRIX = '( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1) )';

/**
 * Formats a 4x4 matrix array into USD matrix string format (row-major).
 * Takes a 16-element array and formats it as USD expects.
 * Example: [1, 0, 0, 0, 0, 1, 0, 0, ...] -> '( (1, 0, 0, 0), (0, 1, 0, 0), ... )'
 */
export function formatMatrix(matrix: number[] | Float32Array | ArrayLike<number>): string {
  if (!matrix || matrix.length < 16) {
    return IDENTITY_MATRIX;
  }

  // Convert to array if needed (handles Float32Array, etc.)
  const m = Array.from(matrix);

  // Format as USD matrix (row-major)
  return `( (${m[0]}, ${m[1]}, ${m[2]}, ${m[3]}), (${m[4]}, ${m[5]}, ${m[6]}, ${m[7]}), (${m[8]}, ${m[9]}, ${m[10]}, ${m[11]}), (${m[12]}, ${m[13]}, ${m[14]}, ${m[15]}) )`;
}

/**
 * Formats a matrix from individual components.
 * Use this when building matrices manually - pass all 16 components.
 */
export function formatMatrixFromComponents(
  m00: number, m01: number, m02: number, m03: number,
  m10: number, m11: number, m12: number, m13: number,
  m20: number, m21: number, m22: number, m23: number,
  m30: number, m31: number, m32: number, m33: number
): string {
  return `( (${m00}, ${m01}, ${m02}, ${m03}), (${m10}, ${m11}, ${m12}, ${m13}), (${m20}, ${m21}, ${m22}, ${m23}), (${m30}, ${m31}, ${m32}, ${m33}) )`;
}

/**
 * Returns the identity matrix in USD format.
 * Just returns the constant for consistency.
 */
export function getIdentityMatrix(): string {
  return IDENTITY_MATRIX;
}

