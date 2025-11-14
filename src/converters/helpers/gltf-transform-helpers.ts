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
  getBounds,
  weld,
  center,
  resample,
  unlit,
  flatten,
  metalRough,
  vertexColorSpace,
  join
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
  /** Weld vertices (merge identical vertices for optimization) */
  weld?: boolean;
  /** Center model at origin */
  center?: boolean | 'center' | 'above' | 'below';
  /** Resample animations (optimize keyframes) */
  resample?: boolean;
  /** Convert unlit materials to standard PBR */
  unlit?: boolean;
  /** Flatten scene graph (may break animations) */
  flatten?: boolean;
  /** Convert spec/gloss materials to metal/rough PBR */
  metalRough?: boolean;
  /** Convert vertex colors from sRGB to linear */
  vertexColorSpace?: 'srgb' | 'srgb-linear' | undefined;
  /** Join compatible primitives to reduce draw calls */
  join?: boolean;
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
    logBounds: shouldLogBounds = false,
    weld: shouldWeld = false,
    center: shouldCenter = false,
    resample: shouldResample = false,
    unlit: shouldUnlit = false,
    flatten: shouldFlatten = false,
    metalRough: shouldMetalRough = false,
    vertexColorSpace: vertexColorSpaceInput,
    join: shouldJoin = false
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

  // Weld vertices (merge identical vertices for optimization)
  if (shouldWeld) {
    logger.info('Welding vertices', {
      stage: 'preprocessing',
      operation: 'weld'
    });
    await document.transform(weld());
  }

  // Center model at origin
  if (shouldCenter) {
    const pivot = typeof shouldCenter === 'string' ? shouldCenter : 'center';
    logger.info('Centering model', {
      stage: 'preprocessing',
      operation: 'center',
      pivot
    });
    await document.transform(center({ pivot: pivot as 'center' | 'above' | 'below' }));
  }

  // Resample animations (optimize keyframes)
  if (shouldResample) {
    logger.info('Resampling animations', {
      stage: 'preprocessing',
      operation: 'resample'
    });
    await document.transform(resample());
  }

  // Convert unlit materials to standard PBR
  if (shouldUnlit) {
    logger.info('Converting unlit materials', {
      stage: 'preprocessing',
      operation: 'unlit'
    });
    await document.transform(unlit());
  }

  // Flatten scene graph (may break animations, use with caution)
  if (shouldFlatten) {
    logger.info('Flattening scene graph', {
      stage: 'preprocessing',
      operation: 'flatten',
      warning: 'This may break animations'
    });
    await document.transform(flatten());
  }

  // Convert spec/gloss materials to metal/rough PBR
  if (shouldMetalRough) {
    logger.info('Converting spec/gloss to metal/rough PBR', {
      stage: 'preprocessing',
      operation: 'metalRough'
    });
    await document.transform(metalRough());
  }

  // Convert vertex colors color space
  if (vertexColorSpaceInput) {
    logger.info('Converting vertex color space', {
      stage: 'preprocessing',
      operation: 'vertexColorSpace',
      inputColorSpace: vertexColorSpaceInput
    });
    await document.transform(vertexColorSpace({ inputColorSpace: vertexColorSpaceInput }));
  }

  // Join compatible primitives to reduce draw calls
  if (shouldJoin) {
    logger.info('Joining compatible primitives', {
      stage: 'preprocessing',
      operation: 'join'
    });
    await document.transform(join());
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

