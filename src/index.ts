/**
 * WebUSD Framework
 * 
 * Converts GLB/GLTF/OBJ/FBX/STL files to USDZ format.
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
 * const usdzBlob = await usd.convert('model.glb');
 * const usdzBlob2 = await usd.convert('model.obj');
 * const usdzBlob3 = await usd.convert('model.fbx');
 * const usdzBlob4 = await usd.convert('model.stl');
 * ```
 */

import { convertGlbToUsdz } from './converters/gltf';
import { convertObjToUsdz } from './converters/obj';
import { convertFbxToGltfViaTool } from './converters/fbx';
import { convertStlToUsdz } from './converters/stl';
import { UsdErrorFactory } from './errors';
import { WebUsdConfigSchema, type WebUsdConfig } from './schemas';
import { ZodError } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

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
  async convert(input: string | ArrayBuffer, options?: { mtlPath?: string; mtlSearchPaths?: string[]; textureSearchPaths?: string[]; allowAutoTextureFallback?: boolean }): Promise<Blob> {
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

      // Handle ZIP files (extract and find FBX inside)
      if (fileExtension === '.zip') {
        const extractedFbxPath = await this.extractAndFindFbx(filePath);
        if (extractedFbxPath) {
          return await this.convert(extractedFbxPath, options);
        } else {
          throw UsdErrorFactory.conversionError(
            'No FBX file found in ZIP archive',
            'fbx_not_found_in_zip'
          );
        }
      }

      // Handle different file types
      if (fileExtension === '.gltf') {
        return await convertGlbToUsdz(filePath, this.config);
      } else if (fileExtension === '.obj' || fileExtension === '.OBJ') {
        // Convert WebUsdConfig to ObjConverterConfig
        const objConfig = {
          debug: this.config.debug,
          debugOutputDir: this.config.debugOutputDir,
          upAxis: this.config.upAxis,
          metersPerUnit: this.config.metersPerUnit,
          allowAutoTextureFallback: options?.allowAutoTextureFallback ?? false,
          mtlPath: options?.mtlPath,
          mtlSearchPaths: options?.mtlSearchPaths ?? [],
          textureSearchPaths: options?.textureSearchPaths ?? [],
          materialPerSmoothingGroup: true,
          useOAsMesh: true,
          useIndices: true,
          disregardNormals: false
        };
        return await convertObjToUsdz(filePath, objConfig);
      } else if (fileExtension === '.glb') {
        // For GLB files, read as buffer
        const fileBuffer = fs.readFileSync(filePath);
        const glbBuffer = fileBuffer.buffer.slice(
          fileBuffer.byteOffset,
          fileBuffer.byteOffset + fileBuffer.byteLength
        );
        return await convertGlbToUsdz(glbBuffer, this.config);
      } else if (fileExtension === '.fbx') {
        // Use FBX2glTF tool to convert FBX to GLB first
        const glbBuffer = await convertFbxToGltfViaTool(filePath, {
          binary: true,
          verbose: this.config.debug
        });

        // Then convert GLB to USDZ
        return await convertGlbToUsdz(glbBuffer, this.config);
      } else if (fileExtension === '.stl') {
        // Convert STL to USDZ
        const stlConfig = {
          debug: this.config.debug,
          debugOutputDir: this.config.debugOutputDir,
          upAxis: this.config.upAxis,
          metersPerUnit: this.config.metersPerUnit,
          optimizeMesh: false,
          defaultColor: [0.7, 0.7, 0.7] as [number, number, number],
          autoComputeNormals: true
        };
        return await convertStlToUsdz(filePath, stlConfig);
      } else {
        throw UsdErrorFactory.conversionError(
          `Unsupported file format: ${fileExtension}`,
          'unsupported_format'
        );
      }
    }

    // Handle ArrayBuffer input (GLB only)
    return await convertGlbToUsdz(input, this.config);
  }

  // Extract ZIP file and find FBX inside
  private async extractAndFindFbx(zipPath: string): Promise<string | null> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-zip-'));

    try {
      // Extract ZIP using unzip command
      execSync(`unzip -q "${zipPath}" -d "${tmpDir}"`);

      // Find FBX file recursively
      const findFbx = (dir: string): string | null => {
        const files = fs.readdirSync(dir);

        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            const found = findFbx(fullPath);
            if (found) return found;
          } else if (file.toLowerCase().endsWith('.fbx')) {
            return fullPath;
          }
        }
        return null;
      };

      const fbxPath = findFbx(tmpDir);
      if (this.config.debug && fbxPath) {
        console.log(`Found FBX in ZIP: ${fbxPath}`);
      }

      return fbxPath;
    } catch (error) {
      console.error('Error extracting ZIP:', error);
      // Clean up on error
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch { }
      return null;
    }
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

/**
 * Direct converter exports
 */
export { convertGlbToUsdz } from './converters/gltf';
export { convertObjToUsdz } from './converters/obj';
export { convertStlToUsdz } from './converters/stl';