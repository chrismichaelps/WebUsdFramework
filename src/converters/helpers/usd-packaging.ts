/**
 * USD Packaging Helper
 * 
 * Handles USDZ package creation and ZIP file management.
 */

import JSZip from 'jszip';
import {
  DEFAULT_CONFIG,
  DIRECTORY_NAMES,
  FILE_EXTENSIONS
} from '../../constants/config';
import { ZIP_VERSION, USD_FILE_NAMES, USD_DEFAULT_NAMES } from '../../constants/usd';

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
 * Creates a USDZ package from USD content and assets
 */
export async function createUsdzPackage(
  content: PackageContent,
  config?: PackageConfig
): Promise<Blob> {
  const zip = new JSZip();
  const compression = config?.compression || DEFAULT_CONFIG.COMPRESSION;

  // Add main USD file first (required to be first in USDZ)
  addMainUsdFile(zip, content.usdContent, compression);

  // Add geometry files
  addGeometryFiles(zip, content.geometryFiles, compression);

  // Add texture files
  addTextureFiles(zip, content.textureFiles, compression);

  // Generate ZIP buffer
  const zipBuffer = await generateZipBuffer(zip, compression);

  // Fix ZIP version for USDZ compatibility
  fixZipVersion(zipBuffer);

  // Create and return USDZ blob
  return createUsdzBlob(zipBuffer, config?.mimeType);
}

/**
 * Adds main USD file to ZIP
 */
function addMainUsdFile(
  zip: JSZip,
  usdContent: string,
  compression: 'STORE' | 'DEFLATE'
): void {
  zip.file(USD_FILE_NAMES.MODEL, usdContent, {
    compression,
    createFolders: false
  });
}

/**
 * Adds geometry files to ZIP
 */
function addGeometryFiles(
  zip: JSZip,
  geometryFiles: Map<string, ArrayBuffer>,
  compression: 'STORE' | 'DEFLATE'
): void {
  for (const [filePath, fileData] of geometryFiles) {
    zip.file(filePath, fileData, {
      compression,
      createFolders: false
    });
  }
}

/**
 * Adds texture files to ZIP
 */
function addTextureFiles(
  zip: JSZip,
  textureFiles: Map<string, ArrayBuffer>,
  compression: 'STORE' | 'DEFLATE'
): void {
  for (const [textureId, textureData] of textureFiles) {
    const texturePath = buildTexturePath(textureId);
    zip.file(texturePath, textureData, {
      compression,
      createFolders: false
    });
  }
}

/**
 * Builds texture file path
 */
function buildTexturePath(textureId: string): string {
  return `${DIRECTORY_NAMES.TEXTURES}/${USD_DEFAULT_NAMES.TEXTURE_PREFIX}${textureId}${FILE_EXTENSIONS.PNG}`;
}

/**
 * Generates ZIP buffer with 64-byte alignment for USDZ compatibility
 */
async function generateZipBuffer(
  zip: JSZip,
  _compression: 'STORE' | 'DEFLATE'
): Promise<Uint8Array> {
  // Generate ZIP with streamFiles to control alignment
  const buffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'STORE', // Always use STORE for USDZ
    streamFiles: false, // CRITICAL: Must be false to avoid Data Descriptor flag
    platform: 'UNIX' // Consistent platform for better compatibility
  });

  return new Uint8Array(buffer);
}

/**
 * Fixes ZIP version to 2.0 for USDZ compatibility
 * 
 * USDZ requires ZIP version 2.0, but JSZip may create higher versions.
 * This function modifies the ZIP header to set version to 2.0.
 */
function fixZipVersion(uint8Array: Uint8Array): void {
  uint8Array[ZIP_VERSION.MAJOR_OFFSET] = ZIP_VERSION.MAJOR;
  uint8Array[ZIP_VERSION.MINOR_OFFSET] = ZIP_VERSION.MINOR;
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

