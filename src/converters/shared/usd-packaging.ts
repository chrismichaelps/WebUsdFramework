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
  usdContent: string | Generator<string>;
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

  // Create ZIP writer with proper alignment for optimal performance
  const zipWriter = new UsdzZipWriter({
    alignTo64Bytes: true,
    compressionLevel: 0 // Store files without compression
  });

  // Add main USD file
  let usdContentChunks: Uint8Array[] = [];
  if (typeof content.usdContent === 'string') {
    usdContentChunks = [new TextEncoder().encode(content.usdContent)];
  } else {
    // Generator - encode chunks
    const encoder = new TextEncoder();
    for (const chunk of content.usdContent) {
      usdContentChunks.push(encoder.encode(chunk));
    }
  }
  zipWriter.addFile(USD_FILE_NAMES.MODEL, usdContentChunks);

  // Add geometry files
  for (const [geometryPath, geometryData] of content.geometryFiles) {
    zipWriter.addFile(geometryPath, new Uint8Array(geometryData));
  }

  // Add texture files
  for (const [textureId, textureData] of content.textureFiles) {
    // Determine the correct file extension based on texture data
    const textureExtension = getTextureExtensionFromData(textureData);
    const textureName = `${USD_DEFAULT_NAMES.TEXTURE_PREFIX}${textureId}.${textureExtension}`;
    const texturePath = `${DIRECTORY_NAMES.TEXTURES}/${textureName}`;
    zipWriter.addFile(texturePath, new Uint8Array(textureData));
  }

  // Generate the USDZ package
  const usdzBuffer = zipWriter.generate();

  // Create and return USDZ blob
  return createUsdzBlob(usdzBuffer, config?.mimeType);
}

/**
 * Get the correct file extension for a texture based on its data
 */
export function getTextureExtensionFromData(textureData: ArrayBuffer): string {
  const uint8Array = new Uint8Array(textureData);

  // Check for JPEG magic bytes (FF D8 FF)
  if (uint8Array.length >= 3 &&
    uint8Array[0] === 0xFF &&
    uint8Array[1] === 0xD8 &&
    uint8Array[2] === 0xFF) {
    return 'jpg';
  }

  // Check for PNG magic bytes (89 50 4E 47)
  if (uint8Array.length >= 8 &&
    uint8Array[0] === 0x89 &&
    uint8Array[1] === 0x50 &&
    uint8Array[2] === 0x4E &&
    uint8Array[3] === 0x47) {
    return 'png';
  }

  // Default to PNG if format cannot be determined
  return 'png';
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

