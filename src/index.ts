/**
 * WebUSD Framework
 * 
 * Converts GLB/GLTF files to USDZ format.
 * 
 * @example
 * ```typescript
 * import { defineConfig } from 'webusd-framework';
 * 
 * const usd = defineConfig({
 *   debug: true,
 *   debugOutputDir: './output'
 * });
 * 
 * const glbBuffer = await fetch('model.glb').then(r => r.arrayBuffer());
 * const usdzBlob = await usd.convert('model.glb');
 * ```
 */

import { convertGlbToUsdz } from './converters/gltf-transform-converter';
import { UsdErrorFactory } from './errors';
import { WebUsdConfigSchema, type WebUsdConfig } from './schemas';
import { ZodError } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Main framework class
 */
export class WebUsdFramework {
  private config: WebUsdConfig;

  constructor(config: Partial<WebUsdConfig> = {}) {
    try {
      this.config = WebUsdConfigSchema.parse(config);
    } catch (error) {
      if (error instanceof ZodError) {
        throw UsdErrorFactory.configError(
          'Invalid configuration',
          'WebUsdConfig',
          { zodError: error }
        );
      }
      throw error;
    }
  }

  /**
   * Convert GLB file to USDZ
   * 
   * @param input - Path to GLB file or ArrayBuffer
   * @returns USDZ blob
   * 
   * @example
   * ```typescript
   * // From file path
   * const usdzBlob = await usd.convert('./model.glb');
   * 
   * // From buffer
   * const buffer = await fetch('model.glb').then(r => r.arrayBuffer());
   * const usdzBlob = await usd.convert(buffer);
   * ```
   */
  async convert(input: string | ArrayBuffer): Promise<Blob> {
    if (this.config.debug) {
      console.log('Debug mode enabled');
      console.log(`Debug output: ${this.config.debugOutputDir}`);
    }

    if (typeof input === 'string') {
      // Handle file path input
      const filePath = path.resolve(input);

      if (!fs.existsSync(filePath)) {
        throw UsdErrorFactory.conversionError(
          `File not found: ${filePath}`,
          'file_not_found'
        );
      }

      const fileExtension = path.extname(filePath).toLowerCase();

      // For GLTF files, pass the file path directly to handle external resources
      if (fileExtension === '.gltf') {
        return await convertGlbToUsdz(filePath, this.config);
      }

      // For GLB files, read as buffer
      const fileBuffer = fs.readFileSync(filePath);
      const glbBuffer = fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength
      );
      return await convertGlbToUsdz(glbBuffer, this.config);
    }

    // Handle ArrayBuffer input (GLB only)
    return await convertGlbToUsdz(input, this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): WebUsdConfig {
    return { ...this.config };
  }
}

/**
 * Create framework instance with configuration
 * 
 * @param config - Configuration options
 * @returns Framework instance
 * 
 * @example
 * ```typescript
 * import { defineConfig } from 'webusd-framework';
 * 
 * const usd = defineConfig({
 *   debug: true,
 *   debugOutputDir: './debug-output'
 * });
 * 
 * const usdzBlob = await usd.convert('./model.glb');
 * ```
 */
export function defineConfig(config: Partial<WebUsdConfig> = {}): WebUsdFramework {
  return new WebUsdFramework(config);
}

/**
 * TypeScript type exports
 */
export type { WebUsdConfig } from './schemas';