/**
 * Base Schemas
 * 
 * Common validation schemas used across different converters.
 */

import { z } from 'zod';

/**
 * Supported Up Axes Schema
 */
export const UpAxisSchema = z.enum(['Y', 'Z']);

/**
 * Supported Compression Types Schema
 */
export const CompressionSchema = z.enum(['STORE', 'DEFLATE']);
