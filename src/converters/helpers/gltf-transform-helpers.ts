/**
 * GLTF Transform Helpers
 * 
 * Utility functions from @gltf-transform/functions for preprocessing GLTF documents
 * before conversion to USDZ.
 */

import { Document } from '@gltf-transform/core';
import {
  dequantize,
  normals,
  prune,
  dedup,
  getBounds
} from '@gltf-transform/functions';
import { Logger } from '../../utils';

/**
 * Options for GLTF preprocessing transforms
 */
export interface GltfPreprocessOptions {
  /** Dequantize mesh attributes (remove KHR_mesh_quantization) */
  dequantize?: boolean;
  /** Generate normals if missing */
  generateNormals?: boolean;
  /** Remove unused resources */
  prune?: boolean;
  /** Remove duplicate resources */
  dedup?: boolean;
  /** Calculate and log bounds */
  logBounds?: boolean;
}

/**
 * Apply preprocessing transforms to GLTF document
 */
export async function preprocessGltfDocument(
  document: Document,
  options: GltfPreprocessOptions = {},
  logger: Logger
): Promise<Document> {
  const {
    dequantize: shouldDequantize = true,
    generateNormals: shouldGenerateNormals = true,
    prune: shouldPrune = false,
    dedup: shouldDedup = false,
    logBounds: shouldLogBounds = false
  } = options;

  // Dequantize mesh attributes (important for USDZ compatibility)
  if (shouldDequantize) {
    logger.info('Dequantizing mesh attributes', {
      stage: 'preprocessing',
      operation: 'dequantize'
    });
    await document.transform(dequantize());
  }

  // Generate normals if missing (USD requires normals for proper lighting)
  if (shouldGenerateNormals) {
    logger.info('Generating normals for meshes', {
      stage: 'preprocessing',
      operation: 'normals'
    });
    await document.transform(normals({ overwrite: false }));
  }

  // Remove duplicate resources (optimization)
  if (shouldDedup) {
    logger.info('Removing duplicate resources', {
      stage: 'preprocessing',
      operation: 'dedup'
    });
    await document.transform(dedup());
  }

  // Remove unused resources (cleanup)
  if (shouldPrune) {
    logger.info('Pruning unused resources', {
      stage: 'preprocessing',
      operation: 'prune'
    });
    await document.transform(prune());
  }

  // Calculate and log bounds if requested
  if (shouldLogBounds) {
    const root = document.getRoot();
    const scenes = root.listScenes();
    for (const scene of scenes) {
      const bounds = getBounds(scene);
      logger.info('Scene bounds calculated', {
        stage: 'preprocessing',
        operation: 'getBounds',
        sceneName: scene.getName(),
        min: bounds.min,
        max: bounds.max
      });
    }
  }

  return document;
}

