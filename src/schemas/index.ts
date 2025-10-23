/**
 * Zod Schemas for WebUSD Framework
 * 
 * All validation schemas using Zod for type safety and validation.
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

/**
 * WebUSD Configuration Schema
 */
export const WebUsdConfigSchema = z.object({
  debug: z.boolean().optional().default(false),
  debugOutputDir: z.string().optional().default('./debug-output'),
  upAxis: UpAxisSchema.optional().default('Y'),
  metersPerUnit: z.number().positive().optional().default(1),
});

/**
 * GLTF-Transform Converter Configuration Schema
 */
export const GltfTransformConfigSchema = z.object({
  debug: z.boolean().optional().default(false),
  debugOutputDir: z.string().optional().default('./debug-output'),
  upAxis: UpAxisSchema.optional().default('Y'),
  metersPerUnit: z.number().positive().optional().default(1),
});

/**
 * USDZ Generation Options Schema
 */
export const UsdzGenerationOptionsSchema = z.object({
  compression: CompressionSchema.optional().default('STORE'),
  mimeType: z.string().optional().default('model/vnd.usdz+zip'),
  alignment: z.number().positive().optional().default(64),
});

/**
 * Debug Output Schema
 */
export const DebugOutputSchema = z.object({
  enabled: z.boolean(),
  outputDir: z.string().min(1, 'Output directory cannot be empty'),
  includeTextures: z.boolean().default(true),
  includeMaterials: z.boolean().default(true),
  includeGeometries: z.boolean().default(true),
  includeScene: z.boolean().default(true),
});

/**
 * File Path Schema
 */
export const FilePathSchema = z.string()
  .min(1, 'File path cannot be empty')
  .regex(/^[a-zA-Z0-9_\/\-\.]+$/, 'File path contains invalid characters');

/**
 * Directory Path Schema
 */
export const DirectoryPathSchema = z.string()
  .min(1, 'Directory path cannot be empty')
  .regex(/^[a-zA-Z0-9_\/\-\.]+$/, 'Directory path contains invalid characters');

/**
 * USD Path Schema (re-exported from validation.ts)
 */
export const UsdPathSchema = z.string()
  .min(1, 'USD path cannot be empty')
  .regex(/^\/[a-zA-Z0-9_\/]*$/, 'USD path must start with / and contain only alphanumeric characters, underscores, and forward slashes');

/**
 * USD Attribute Value Schema
 */
export const UsdAttributeValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.number()),
  z.array(z.string()),
  z.record(z.string(), z.unknown())
]);

/**
 * Type exports for TypeScript inference
 */
export type WebUsdConfig = z.infer<typeof WebUsdConfigSchema>;
export type GltfTransformConfig = z.infer<typeof GltfTransformConfigSchema>;
export type UsdzGenerationOptions = z.infer<typeof UsdzGenerationOptionsSchema>;
export type DebugOutput = z.infer<typeof DebugOutputSchema>;
export type FilePath = z.infer<typeof FilePathSchema>;
export type DirectoryPath = z.infer<typeof DirectoryPathSchema>;
export type UsdPath = z.infer<typeof UsdPathSchema>;
export type UsdAttributeValue = z.infer<typeof UsdAttributeValueSchema>;
