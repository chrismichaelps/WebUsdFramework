/**
 * GLTF Parser Factory
 * 
 * Factory pattern for selecting appropriate parser based on input type.
 */

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

/**
 * Parser interface
 */
export interface IGltfParser {
  parse(input: ArrayBuffer | string): Promise<Document>;
  getType(): string;
}

/**
 * GLB Parser - handles binary GLB files from ArrayBuffer
 */
class GlbParser implements IGltfParser {
  private io: NodeIO;

  constructor() {
    this.io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  }

  async parse(input: ArrayBuffer | string): Promise<Document> {
    if (typeof input === 'string') {
      throw new Error('GlbParser expects ArrayBuffer, received string path');
    }
    return await this.io.readBinary(new Uint8Array(input));
  }

  getType(): string {
    return 'GLB';
  }
}

/**
 * GLTF Parser - handles JSON GLTF files with external resources
 */
class GltfParser implements IGltfParser {
  private io: NodeIO;

  constructor() {
    this.io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  }

  async parse(input: ArrayBuffer | string): Promise<Document> {
    if (typeof input !== 'string') {
      throw new Error('GltfParser expects file path string, received ArrayBuffer');
    }

    // Use NodeIO.read() which handles external .bin and texture files
    return await this.io.read(input);
  }

  getType(): string {
    return 'GLTF';
  }
}

/**
 * GLTF Parser with fallback for missing resources
 */
class GltfParserWithFallback implements IGltfParser {
  private io: NodeIO;
  private filePath: string;

  constructor(filePath: string) {
    this.io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    this.filePath = filePath;
  }

  async parse(input: ArrayBuffer | string): Promise<Document> {
    if (typeof input !== 'string') {
      throw new Error('GltfParserWithFallback expects file path string');
    }

    try {
      // Try to load with all resources
      return await this.io.read(input);
    } catch (error: any) {
      // Handle missing external resources (textures)
      if (error?.message && error.message.includes('ENOENT')) {
        return await this.parseWithPartialResources(input, error);
      }
      throw error;
    }
  }

  private async parseWithPartialResources(
    filePath: string,
    originalError: Error
  ): Promise<Document> {
    const fs = require('fs');
    const path = require('path');

    const gltfDir = path.dirname(filePath);
    const gltfContent = fs.readFileSync(filePath, 'utf8');
    const gltfJson = JSON.parse(gltfContent);

    // Load buffer files (.bin) manually
    const resources: Record<string, Uint8Array> = {};
    if (gltfJson.buffers) {
      for (const buffer of gltfJson.buffers) {
        if (buffer.uri && !buffer.uri.startsWith('data:')) {
          const bufferPath = path.join(gltfDir, buffer.uri);
          try {
            const bufferData = fs.readFileSync(bufferPath);
            resources[buffer.uri] = new Uint8Array(bufferData);
          } catch (bufferError: any) {
            console.warn(`Failed to load buffer: ${buffer.uri}`, bufferError?.message);
          }
        }
      }
    }

    // Parse GLTF JSON with available resources (skip missing textures)
    return await this.io.readJSON({ json: gltfJson, resources });
  }

  getType(): string {
    return 'GLTF (with fallback)';
  }
}

/**
 * Parser Factory
 */
export class GltfParserFactory {
  /**
   * Creates appropriate parser based on input type
   */
  static createParser(input: ArrayBuffer | string): IGltfParser {
    if (typeof input === 'string') {
      // File path - determine type by extension
      const extension = input.toLowerCase().split('.').pop();

      if (extension === 'gltf') {
        return new GltfParserWithFallback(input);
      } else if (extension === 'glb') {
        // For GLB file paths, we could read and pass to GlbParser
        // but for now, use GLTF parser which handles both
        return new GltfParser();
      }

      // Default to GLTF parser for unknown extensions
      return new GltfParser();
    }

    // ArrayBuffer - assume GLB
    return new GlbParser();
  }

  /**
   * Parse input using appropriate parser
   */
  static async parse(input: ArrayBuffer | string): Promise<Document> {
    const parser = this.createParser(input);
    return await parser.parse(input);
  }
}

