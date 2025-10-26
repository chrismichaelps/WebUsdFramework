/**
 * GLTF-Transform Converter
 * 
 * Converts GLB/GLTF to USDZ format.
 * Uses external geometry files and handles materials/textures.
 */

import { Document } from '@gltf-transform/core';
import { GltfTransformConfig } from '../schemas';
import { LoggerFactory } from '../utils';
import { GltfParserFactory } from './parsers/gltf-parser-factory';
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
 * Conversion Constants
 */
const CONVERSION_CONSTANTS = {
  FIRST_SCENE_INDEX: 0,
  INITIAL_COUNTER: 0,
  MAIN_USD_FILE_COUNT: 1,
  EMPTY_COUNT: 0
} as const;

/**
 * String Constants
 */
const STRING_CONSTANTS = {
  INPUT_TYPES: {
    GLTF_FILE: 'gltf_file',
    GLB_BUFFER: 'glb_buffer',
    FILE: 'file',
    BUFFER: 'buffer'
  },
  FILE_EXTENSIONS: {
    GLTF: '.gltf'
  },
  FILE_TYPES: {
    GLTF: 'GLTF',
    GLB: 'GLB'
  },
  PLACEHOLDERS: {
    NOT_APPLICABLE: 'N/A'
  }
} as const;

/**
 * Convert GLB buffer or GLTF file to USDZ blob
 */
export async function convertGlbToUsdz(
  input: ArrayBuffer | string,
  config?: GltfTransformConfig
): Promise<Blob> {
  const logger = LoggerFactory.forConversion();

  try {
    const inputType = typeof input === 'string' ? STRING_CONSTANTS.INPUT_TYPES.GLTF_FILE : STRING_CONSTANTS.INPUT_TYPES.GLB_BUFFER;

    // Get file size for logging
    let fileSize: number | string = STRING_CONSTANTS.PLACEHOLDERS.NOT_APPLICABLE;
    if (typeof input === 'string') {
      try {
        const fs = require('fs');
        const stats = fs.statSync(input);
        fileSize = stats.size;
      } catch {
        fileSize = STRING_CONSTANTS.PLACEHOLDERS.NOT_APPLICABLE;
      }
    } else {
      fileSize = input.byteLength;
    }

    logger.info('Starting GLB/GLTF to USDZ conversion', {
      stage: CONVERSION_STAGES.START,
      inputType,
      bufferSize: fileSize
    });

    // Parse GLB/GLTF document using factory pattern
    const document = await parseGltfOrGlbDocument(input, logger);

    // Create USD root structure
    const root = document.getRoot();
    const scene = root.listScenes()[CONVERSION_CONSTANTS.FIRST_SCENE_INDEX];
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
      materialCounter: CONVERSION_CONSTANTS.INITIAL_COUNTER,
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
      fileCount: CONVERSION_CONSTANTS.MAIN_USD_FILE_COUNT + packageContent.geometryFiles.size + packageContent.textureFiles.size
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
 * Parse GLB buffer or GLTF file into document using Factory Pattern
 */
async function parseGltfOrGlbDocument(
  input: ArrayBuffer | string,
  logger: any
): Promise<Document> {
  const inputType = typeof input === 'string' ? STRING_CONSTANTS.INPUT_TYPES.FILE : STRING_CONSTANTS.INPUT_TYPES.BUFFER;
  const fileType = typeof input === 'string'
    ? (input.endsWith(STRING_CONSTANTS.FILE_EXTENSIONS.GLTF) ? STRING_CONSTANTS.FILE_TYPES.GLTF : STRING_CONSTANTS.FILE_TYPES.GLB)
    : STRING_CONSTANTS.FILE_TYPES.GLB;

  logger.info(`Parsing ${fileType} ${inputType}`, {
    stage: CONVERSION_STAGES.PARSING,
    inputType
  });

  try {
    const document = await GltfParserFactory.parse(input);

    const root = document.getRoot();
    const scenes = root.listScenes();

    if (scenes.length === CONVERSION_CONSTANTS.EMPTY_COUNT) {
      throw new Error(ERROR_MESSAGES.NO_SCENES);
    }

    logger.info(`${fileType} parsed successfully`, {
      stage: CONVERSION_STAGES.PARSING,
      sceneCount: scenes.length,
      meshCount: root.listMeshes().length,
      materialCount: root.listMaterials().length,
      textureCount: root.listTextures().length
    });

    return document;
  } catch (error: any) {
    logger.error(`Failed to parse ${fileType}`, {
      stage: CONVERSION_STAGES.ERROR,
      error: error?.message || String(error)
    });
    throw error;
  }
}
