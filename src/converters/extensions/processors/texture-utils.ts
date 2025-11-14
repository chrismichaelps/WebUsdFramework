/**
 * Shared utility functions for extension processors
 */

import { Texture, TextureInfo } from '@gltf-transform/core';
import { Transform } from '@gltf-transform/extensions';

/**
 * Generate a unique texture ID based on texture data hash and type
 * Used by all extension processors to create consistent texture identifiers
 */
export async function generateTextureId(texture: Texture, type: string): Promise<string> {
  const image = texture.getImage();
  if (!image) {
    throw new Error(`Texture has no image data`);
  }

  const buffer = image.buffer as ArrayBuffer;
  const uint8Array = new Uint8Array(buffer);
  let hash = 0;
  const step = Math.max(1, Math.floor(uint8Array.length / 1000)); // Sample every nth byte for performance

  for (let i = 0; i < uint8Array.length; i += step) {
    hash = ((hash << 5) - hash + uint8Array[i]) & 0xffffffff;
  }

  // Convert to positive hex string and take first 8 characters
  const hashStr = Math.abs(hash).toString(16).substring(0, 8);

  return `${hashStr}_${type}`;
}

/**
 * Extract texture transform from TextureInfo using KHR_texture_transform extension
 * Returns transform data (offset, scale, rotation) if present, undefined otherwise
 */
export function extractTextureTransform(textureInfo: TextureInfo | null): {
  offset: [number, number];
  scale: [number, number];
  rotation: number;
} | undefined {
  if (!textureInfo) {
    return undefined;
  }

  const transform = textureInfo.getExtension<Transform>('KHR_texture_transform');
  if (!transform) {
    return undefined;
  }

  const offset = transform.getOffset();
  const scale = transform.getScale();
  const rotation = transform.getRotation();

  return {
    offset: [offset[0], offset[1]],
    scale: [scale[0], scale[1]],
    rotation
  };
}

