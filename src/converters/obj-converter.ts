import { ObjConverterConfig } from '../schemas';
import { LoggerFactory } from '../utils';
import { ObjParserFactory } from './parsers/obj-parser-factory';
import { ParsedGeometry } from './parsers/obj-mesh-parser';
import { createRootStructure } from './helpers/usd-root-builder';
import { adaptObjMeshesToUsd, createUsdMeshFromObj } from './helpers/obj-to-usd-adapter';
import {
  createUsdzPackage,
  PackageContent
} from './helpers/usd-packaging';
import {
  writeDebugOutput,
  DebugOutputContent
} from './helpers/debug-writer';
import { UsdNode } from '../core/usd-node';
import { USD_PROPERTIES, USD_PROPERTY_TYPES } from '../constants/usd';

// Constants
const DEFAULT_CONFIG: ObjConverterConfig = {
  debug: false,
  debugOutputDir: './debug-output',
  upAxis: 'Y',
  metersPerUnit: 1,
  materialPerSmoothingGroup: true,
  useOAsMesh: true,
  useIndices: true,
  disregardNormals: false
};

export async function convertObjToUsdz(
  input: ArrayBuffer | string,
  config?: ObjConverterConfig
): Promise<Blob> {
  const logger = LoggerFactory.forConversion();

  try {
    // Merge config with defaults
    const finalConfig = { ...DEFAULT_CONFIG, ...config };

    logger.info('Starting OBJ to USDZ conversion', {
      stage: 'conversion_start',
      inputType: typeof input === 'string' ? 'obj_file' : 'obj_buffer',
      bufferSize: typeof input === 'string' ? 'N/A' : input.byteLength
    });

    // Parse OBJ file
    logger.info('Parsing OBJ file', {
      stage: 'obj_parsing',
      inputType: typeof input === 'string' ? 'file' : 'buffer'
    });

    const meshes: ParsedGeometry[] = await ObjParserFactory.parse(input);

    logger.info('OBJ parsed successfully', {
      stage: 'obj_parsing',
      meshCount: meshes.length
    });

    // Create root structure using existing USD infrastructure
    const rootStructure = createRootStructure('obj_scene');
    const { rootNode, sceneNode, materialsNode } = rootStructure;

    // Adapt OBJ meshes to USD-compatible format
    logger.info('Processing geometries', {
      stage: 'geometry_processing',
      meshCount: meshes.length
    });

    const meshAdapters = adaptObjMeshesToUsd(meshes);

    logger.info('Building node hierarchy', {
      stage: 'hierarchy_building',
      primitiveCount: meshAdapters.length
    });

    // Create materials and bind them to meshes (like GLB converter)
    let materialCounter = 0;
    const textureFiles = new Map<string, ArrayBuffer>();

    // Create default material for OBJ meshes (simple approach)
    const materialName = 'defaultMaterial';
    const materialPath = `${materialsNode.getPath()}/${materialName}`;

    const materialNode = new UsdNode(materialPath, 'Material');

    // Create PreviewSurface shader (like GLB converter)
    const surfaceShader = new UsdNode(`${materialPath}/PreviewSurface`, 'Shader');
    surfaceShader.setProperty('uniform token info:id', 'UsdPreviewSurface');
    surfaceShader.setProperty('color3f inputs:diffuseColor', '(0.8, 0.8, 0.8)', 'color3f');
    surfaceShader.setProperty('float inputs:roughness', '0.5', 'float');
    surfaceShader.setProperty('float inputs:metallic', '0.0', 'float');
    surfaceShader.setProperty('float inputs:opacity', '1', 'float');
    surfaceShader.setProperty('token outputs:surface', '');

    // Add surface shader to material
    materialNode.addChild(surfaceShader);

    // Connect material output to surface shader
    materialNode.setProperty(
      'token outputs:surface.connect',
      `<${materialPath}/PreviewSurface.outputs:surface>`,
      'connection'
    );

    materialsNode.addChild(materialNode);
    materialCounter++;

    // Create mesh nodes and bind materials
    for (const meshAdapter of meshAdapters) {
      const meshNode = createUsdMeshFromObj(meshAdapter, sceneNode);

      // Bind material using the same approach as GLB converter
      meshNode.setProperty(
        USD_PROPERTIES.PREPEND_API_SCHEMAS,
        [USD_PROPERTIES.MATERIAL_BINDING_API],
        USD_PROPERTY_TYPES.STRING_ARRAY
      );

      meshNode.setProperty(
        USD_PROPERTIES.MATERIAL_BINDING,
        `<${materialPath}>`,
        USD_PROPERTY_TYPES.REL
      );
    }

    // Add materials to root level for proper USDZ structure (like GLB converter)
    rootNode.addChild(materialsNode);

    logger.info('Generated materials', {
      stage: 'material_generation',
      materialCount: materialCounter,
      textureCount: textureFiles.size
    });

    // Create USDZ package
    logger.info('Generating USDZ package', {
      stage: 'usdz_packaging',
      fileCount: 1 + textureFiles.size // +1 for main USD file
    });

    const packageContent: PackageContent = {
      usdContent: rootNode.serializeToUsda(),
      geometryFiles: new Map(), // No separate geometry files - embedded in main USD
      textureFiles
    };

    const usdzBlob = await createUsdzPackage(packageContent);

    logger.info('USDZ conversion completed', {
      stage: 'conversion_complete',
      usdzSize: usdzBlob.size
    });

    // Write debug output if enabled
    if (finalConfig.debug) {
      const debugContent: DebugOutputContent = {
        usdContent: rootNode.serializeToUsda(),
        geometryFiles: new Map(), // No separate geometry files - embedded in main USD
        textureFiles,
        usdzBlob
      };

      await writeDebugOutput(finalConfig.debugOutputDir, debugContent);
    }

    return usdzBlob;

  } catch (error) {
    logger.error('OBJ to USDZ conversion failed', {
      stage: 'conversion_error',
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
