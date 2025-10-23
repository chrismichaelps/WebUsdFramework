/**
 * Error Constants for WebUSD Framework
 */

/**
 * Error Codes
 */
export const ERROR_CODES = {
  SCHEMA_VALIDATION_ERROR: 'USD_SCHEMA_VALIDATION_ERROR',
  CONFIG_VALIDATION_ERROR: 'USD_CONFIG_VALIDATION_ERROR',
  CONVERSION_ERROR: 'USD_CONVERSION_ERROR',
  FILE_SYSTEM_ERROR: 'USD_FILE_SYSTEM_ERROR',
  VALIDATION_ERROR: 'USD_VALIDATION_ERROR',
} as const;

/**
 * Error Messages
 */
export const ERROR_MESSAGES = {
  SCHEMA_VALIDATION_ERROR: 'USD schema validation failed',
  CONFIG_VALIDATION_ERROR: 'Configuration validation failed',
  CONVERSION_ERROR: 'GLB to USDZ conversion failed',
  FILE_SYSTEM_ERROR: 'File system operation failed',
  VALIDATION_ERROR: 'General validation failed',
  INVALID_PATH: 'Invalid USD path format',
  INVALID_CONFIG: 'Invalid configuration provided',
  CONVERSION_STAGE_FAILED: 'Conversion stage failed',
  FILE_OPERATION_FAILED: 'File operation failed',
  VALIDATION_FAILED: 'Validation failed',
} as const;

