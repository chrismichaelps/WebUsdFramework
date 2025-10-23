/**
 * GLTF-Transform Converter
 * 
 * Converts GLB/GLTF to USDZ format.
 * Uses external geometry files and handles materials/textures.
 */

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { GltfTransformConfig } from '../schemas';
import { LoggerFactory } from '../utils';
import { createRootStructure } from './helpers/usd-root-builder';
import { processGeometries } from './helpers/geometry-processor';
import {
  buildNodeHierarchy,
  HierarchyBuilderContext
} from './helpers/usd-hierarchy-builder';
import {
  createUsdzPackage,
  PackageContent
} from './helpers/usd-packaging';
import {
  writeDebugOutput,
  DebugOutputContent
} from './helpers/debug-writer';

/**
 * Conversion Stage Names
 */
const CONVERSION_STAGES = {
  START: 'conversion_start',
  PARSING: 'glb_parsing',
  GEOMETRY: 'geometry_generation',
  MATERIALS: 'material_generation',
  PACKAGING: 'usdz_packaging',
  COMPLETE: 'conversion_complete',
  ERROR: 'conversion_error'
} as const;

/**
 * Error Messages
 */
const ERROR_MESSAGES = {
  NO_SCENES: 'GLTF document has no scenes'
} as const;

/**
 * Convert GLB buffer to USDZ blob
 */
export async function convertGlbToUsdz(
  glbBuffer: ArrayBuffer,
  config?: GltfTransformConfig
): Promise<Blob> {
  const logger = LoggerFactory.forConversion();

  try {
    logger.info('Starting GLB to USDZ conversion', {
      stage: CONVERSION_STAGES.START,
      bufferSize: glbBuffer.byteLength
    });

    // Parse GLB document
    const document = await parseGlbDocument(glbBuffer, logger);

    // Create USD root structure
    const root = document.getRoot();
    const scene = root.listScenes()[0];
    const sceneName = scene.getName();
    const rootStructure = createRootStructure(sceneName);

    // Process geometries
    const geometryResult = processGeometries(root.listMeshes());

    logger.info(`Generated ${geometryResult.geometryCounter} geometry files`, {
      stage: CONVERSION_STAGES.GEOMETRY
    });

    // Build scene hierarchy and materials
    const hierarchyContext: HierarchyBuilderContext = {
      primitiveMetadata: geometryResult.primitiveMetadata,
      materialMap: new Map(),
      textureFiles: new Map(),
      materialsNode: rootStructure.materialsNode,
      materialCounter: 0,
      document
    };

    for (const childNode of scene.listChildren()) {
      hierarchyContext.materialCounter = await buildNodeHierarchy(
        childNode,
        rootStructure.sceneNode,
        hierarchyContext
      );
    }

    logger.info(
      `Generated ${hierarchyContext.materialCounter} materials with ${hierarchyContext.textureFiles.size} textures`,
      { stage: CONVERSION_STAGES.MATERIALS }
    );

    // Serialize USD content
    const usdContent = rootStructure.rootNode.serializeToUsda();

    // Create package content
    const packageContent: PackageContent = {
      usdContent,
      geometryFiles: geometryResult.geometryFiles,
      textureFiles: hierarchyContext.textureFiles
    };

    // Package as USDZ
    logger.info('Generating USDZ package', {
      stage: CONVERSION_STAGES.PACKAGING,
      fileCount: 1 + packageContent.geometryFiles.size + packageContent.textureFiles.size
    });

    const usdzBlob = await createUsdzPackage(packageContent);

    logger.info('USDZ conversion completed', {
      stage: CONVERSION_STAGES.COMPLETE,
      usdzSize: usdzBlob.size
    });

    // Write debug output if requested
    if (config?.debug && config?.debugOutputDir) {
      const debugContent: DebugOutputContent = {
        ...packageContent,
        usdzBlob
      };

      await writeDebugOutput(config.debugOutputDir, debugContent);
    }

    return usdzBlob;

  } catch (error) {
    logger.error('Conversion failed', {
      stage: CONVERSION_STAGES.ERROR,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Parse GLB buffer into document
 */
async function parseGlbDocument(
  glbBuffer: ArrayBuffer,
  logger: any
): Promise<Document> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = await io.readBinary(new Uint8Array(glbBuffer));

  const root = document.getRoot();
  const scenes = root.listScenes();

  if (scenes.length === 0) {
    throw new Error(ERROR_MESSAGES.NO_SCENES);
  }

  logger.info('GLB parsed successfully', {
    stage: CONVERSION_STAGES.PARSING,
    sceneCount: scenes.length,
    meshCount: root.listMeshes().length,
    materialCount: root.listMaterials().length
  });

  return document;
}
