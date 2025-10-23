/**
 * Geometry Processor
 * 
 * Processes GLTF meshes and creates USD geometry files.
 */

import { buildUsdGeometry, wrapGeometryInUsdFile } from '../usd-geometry-builder';
import { buildGeometryPath, buildGeometryName } from './usd-packaging';
import { PrimitiveMetadata } from './usd-hierarchy-builder';

/**
 * Geometry Processing Result
 */
export interface GeometryProcessingResult {
  primitiveMetadata: PrimitiveMetadata[];
  geometryFiles: Map<string, ArrayBuffer>;
  geometryCounter: number;
}

/**
 * Processes all meshes and creates geometry files
 */
export function processGeometries(meshes: any[]): GeometryProcessingResult {
  const geometryFiles = new Map<string, ArrayBuffer>();
  const primitiveMetadata: PrimitiveMetadata[] = [];
  let geometryCounter = 0;

  for (const mesh of meshes) {
    const primitives = mesh.listPrimitives();

    for (let i = 0; i < primitives.length; i++) {
      const result = processPrimitive(mesh, i, geometryCounter);

      geometryFiles.set(result.filePath, result.buffer);
      primitiveMetadata.push(result.metadata);

      geometryCounter++;
    }
  }

  return {
    primitiveMetadata,
    geometryFiles,
    geometryCounter
  };
}

/**
 * Process a single primitive
 */
interface PrimitiveProcessingResult {
  filePath: string;
  buffer: ArrayBuffer;
  metadata: PrimitiveMetadata;
}

function processPrimitive(
  mesh: any,
  primitiveIndex: number,
  geometryCounter: number
): PrimitiveProcessingResult {
  const geometryName = buildGeometryName(geometryCounter);
  const geometryId = geometryName;

  // Generate geometry USD content
  const geometryResult = buildUsdGeometry(mesh, primitiveIndex);
  const geometryUsdContent = wrapGeometryInUsdFile(
    geometryResult.content,
    geometryName
  );

  // Encode to buffer
  const geometryBuffer = new TextEncoder().encode(geometryUsdContent).buffer;

  // Build file path
  const filePath = buildGeometryPath(geometryName);

  // Build metadata
  const metadata: PrimitiveMetadata = {
    mesh,
    primitiveIndex,
    geometryId,
    geometryName
  };

  return {
    filePath,
    buffer: geometryBuffer,
    metadata
  };
}

