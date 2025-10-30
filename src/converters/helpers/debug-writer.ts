/**
 * Debug Output Writer
 * 
 * Writes debug output files for development and testing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger, LoggerFactory } from '../../utils';
import { DIRECTORY_NAMES } from '../../constants/config';
import { USD_FILE_NAMES, USD_DEFAULT_NAMES } from '../../constants/usd';
import { getTextureExtensionFromData } from './usd-packaging';

/**
 * Debug Output Content
 */
export interface DebugOutputContent {
  usdContent: string;
  geometryFiles: Map<string, ArrayBuffer>;
  textureFiles: Map<string, ArrayBuffer>;
  usdzBlob: Blob;
}

/**
 * Writes debug output to the specified directory
 */
export async function writeDebugOutput(
  debugDir: string,
  content: DebugOutputContent
): Promise<void> {
  const logger = LoggerFactory.forDebug();

  ensureDirectoryExists(debugDir);

  await writeUsdFile(debugDir, content.usdContent, logger);

  await writeTextureFiles(debugDir, content.textureFiles, logger);
  await writeUsdzFile(debugDir, content.usdzBlob, logger);
}

/**
 * Ensures a directory exists, creating it if necessary
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Writes the main USD file
 */
async function writeUsdFile(
  debugDir: string,
  usdContent: string,
  logger: Logger
): Promise<void> {
  const usdPath = path.join(debugDir, USD_FILE_NAMES.MODEL);
  fs.writeFileSync(usdPath, usdContent);
  logger.info(`Written ${usdPath}`, { fileSize: usdContent.length });
}

/**
 * Writes all texture files
 */
async function writeTextureFiles(
  debugDir: string,
  textureFiles: Map<string, ArrayBuffer>,
  logger: Logger
): Promise<void> {
  const texturesDir = path.join(debugDir, DIRECTORY_NAMES.TEXTURES);
  ensureDirectoryExists(texturesDir);

  for (const [textureId, textureData] of textureFiles) {
    // Determine the correct file extension based on texture data
    const textureExtension = getTextureExtensionFromData(textureData);
    const fileName = `${USD_DEFAULT_NAMES.TEXTURE_PREFIX}${textureId}.${textureExtension}`;
    const texturePath = path.join(texturesDir, fileName);
    fs.writeFileSync(texturePath, Buffer.from(textureData));
    logger.info(`Written ${texturePath}`, { fileSize: textureData.byteLength });
  }
}

/**
 * Writes the USDZ file
 */
async function writeUsdzFile(
  debugDir: string,
  usdzBlob: Blob,
  logger: Logger
): Promise<void> {
  const usdzPath = path.join(debugDir, USD_FILE_NAMES.CONVERTED);
  const usdzBuffer = await usdzBlob.arrayBuffer();
  fs.writeFileSync(usdzPath, Buffer.from(usdzBuffer));
  logger.info(`Written ${usdzPath}`, { fileSize: usdzBuffer.byteLength });
}

