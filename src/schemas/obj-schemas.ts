/**
 * OBJ Converter Schemas
 * 
 * Validation schemas for OBJ file conversion configuration.
 */

import { z } from 'zod';
import { UpAxisSchema } from './base-schemas';

/**
 * OBJ Converter Configuration Schema
 */
export const ObjConverterConfigSchema = z.object({
  debug: z.boolean().optional().default(false),
  debugOutputDir: z.string().optional().default('./debug-output'),
  upAxis: UpAxisSchema.optional().default('Y'),
  metersPerUnit: z.number().positive().optional().default(1),
  materialPerSmoothingGroup: z.boolean().optional().default(true),
  useOAsMesh: z.boolean().optional().default(true),
  useIndices: z.boolean().optional().default(true),
  disregardNormals: z.boolean().optional().default(false),
});

/**
 * Type export for TypeScript inference
 */
export type ObjConverterConfig = z.infer<typeof ObjConverterConfigSchema>;
