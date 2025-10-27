/**
 * USD Packaging Helper
 * 
 * Handles USDZ package creation and ZIP file management with proper alignment.
 */

import {
  DEFAULT_CONFIG,
  DIRECTORY_NAMES,
  FILE_EXTENSIONS
} from '../../constants/config';
import { USD_FILE_NAMES, USD_DEFAULT_NAMES } from '../../constants/usd';
import { UsdzZipWriter } from './usdz-zip-writer';

/**
 * Package Configuration
 */
export interface PackageConfig {
  compression?: 'STORE' | 'DEFLATE';
  mimeType?: string;
}

/**
 * Package Content
 */
export interface PackageContent {
  usdContent: string;
  geometryFiles: Map<string, ArrayBuffer>;
  textureFiles: Map<string, ArrayBuffer>;
}

/**
 * Creates a USDZ package using custom ZIP writer for proper file alignment
 */
export async function createUsdzPackage(
  content: PackageContent,
  config?: PackageConfig
): Promise<Blob> {
  console.log('[Packaging] Creating USDZ with custom ZIP writer...');

  // Create ZIP writer with proper alignment for optimal performance
  const zipWriter = new UsdzZipWriter({
    alignTo64Bytes: true,
    compressionLevel: 0 // Store files without compression
  });

  // Add main USD file
  const usdContentBytes = new TextEncoder().encode(content.usdContent);
  zipWriter.addFile(USD_FILE_NAMES.MODEL, usdContentBytes);

  // Add texture files
  for (const [textureId, textureData] of content.textureFiles) {
    const textureName = `${USD_DEFAULT_NAMES.TEXTURE_PREFIX}${textureId}${FILE_EXTENSIONS.PNG}`;
    const texturePath = `${DIRECTORY_NAMES.TEXTURES}/${textureName}`;
    zipWriter.addFile(texturePath, new Uint8Array(textureData));
  }

  // Generate the USDZ package
  const usdzBuffer = zipWriter.generate();

  console.log(`[Packaging] USDZ created successfully: ${usdzBuffer.length} bytes`);

  // Create and return USDZ blob
  return createUsdzBlob(usdzBuffer, config?.mimeType);
}

/**
 * Creates USDZ blob from ZIP buffer
 */
function createUsdzBlob(
  uint8Array: Uint8Array,
  mimeType?: string
): Blob {
  return new Blob([uint8Array.buffer as ArrayBuffer], {
    type: mimeType || DEFAULT_CONFIG.MIME_TYPE
  });
}

/**
 * Builds geometry file path
 */
export function buildGeometryPath(geometryName: string): string {
  return `${DIRECTORY_NAMES.GEOMETRIES}/${geometryName}${FILE_EXTENSIONS.USDA}`;
}

/**
 * Builds geometry file name
 */
export function buildGeometryName(counter: number): string {
  return `${USD_DEFAULT_NAMES.GEOMETRY_PREFIX}${counter}`;
}

