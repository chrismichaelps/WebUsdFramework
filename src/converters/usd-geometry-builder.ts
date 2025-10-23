/**
 * USD Geometry Builder
 * 
 * Extracts geometry from GLTF and formats for USD.
 */

import { Mesh, Primitive } from '@gltf-transform/core';

/**
 * Geometry build result
 */
export interface GeometryBuildResult {
  /** USD-formatted geometry content */
  content: string;
  /** Bounding box minimum coordinates */
  boundsMin: [number, number, number];
  /** Bounding box maximum coordinates */
  boundsMax: [number, number, number];
  /** Total vertex count */
  vertexCount: number;
  /** Total face count */
  faceCount: number;
}

/**
 * Raw geometry data
 */
export interface RawGeometryData {
  points: string;
  faceVertexCounts: string;
  faceVertexIndices: string;
  normals?: string;
  uvs?: string;
  extent: string;
}

/**
 * Extract raw geometry data from GLTF primitive
 */
export function extractRawGeometryData(primitive: Primitive): RawGeometryData {
  const positions = primitive.getAttribute('POSITION');
  const normals = primitive.getAttribute('NORMAL');
  const uvs = primitive.getAttribute('TEXCOORD_0');
  const indices = primitive.getIndices();

  if (!positions) {
    throw new Error('Primitive missing POSITION attribute');
  }

  const positionArray = positions.getArray();
  if (!positionArray || positionArray.length === 0) {
    throw new Error('Primitive has empty position data');
  }

  // Calculate bounds
  const bounds = calculateBounds(positionArray);

  // Extract points as tuples
  const points: string[] = [];
  for (let i = 0; i < positionArray.length; i += 3) {
    points.push(`(${positionArray[i]}, ${positionArray[i + 1]}, ${positionArray[i + 2]})`);
  }

  // Extract face data
  let faceVertexCounts: string;
  let faceVertexIndices: string;

  if (indices) {
    const indexArray = indices.getArray();
    if (indexArray && indexArray.length > 0) {
      const faceCount = indexArray.length / 3;
      faceVertexCounts = Array(faceCount).fill(3).join(', ');
      faceVertexIndices = Array.from(indexArray).join(', ');
    } else {
      // Fallback
      const vertexCount = positionArray.length / 3;
      const faceCount = vertexCount / 3;
      faceVertexCounts = Array(faceCount).fill(3).join(', ');
      faceVertexIndices = Array.from({ length: vertexCount }, (_, i) => i).join(', ');
    }
  } else {
    // Non-indexed geometry
    const vertexCount = positionArray.length / 3;
    const faceCount = vertexCount / 3;
    faceVertexCounts = Array(faceCount).fill(3).join(', ');
    faceVertexIndices = Array.from({ length: vertexCount }, (_, i) => i).join(', ');
  }

  const result: RawGeometryData = {
    points: `[${points.join(', ')}]`,
    faceVertexCounts: `[${faceVertexCounts}]`,
    faceVertexIndices: `[${faceVertexIndices}]`,
    extent: `[(${bounds.min[0]}, ${bounds.min[1]}, ${bounds.min[2]}), (${bounds.max[0]}, ${bounds.max[1]}, ${bounds.max[2]})]`
  };

  // Extract normals if available
  if (normals) {
    const normalArray = normals.getArray();
    if (normalArray && normalArray.length > 0) {
      const normalTuples: string[] = [];
      for (let i = 0; i < normalArray.length; i += 3) {
        normalTuples.push(`(${normalArray[i]}, ${normalArray[i + 1]}, ${normalArray[i + 2]})`);
      }
      result.normals = `[${normalTuples.join(', ')}]`;
    }
  }

  // Extract UVs if available
  if (uvs) {
    const uvArray = uvs.getArray();
    if (uvArray && uvArray.length > 0) {
      const uvTuples: string[] = [];
      for (let i = 0; i < uvArray.length; i += 2) {
        uvTuples.push(`(${uvArray[i]}, ${uvArray[i + 1]})`);
      }
      result.uvs = `[${uvTuples.join(', ')}]`;
    }
  }

  return result;
}

/**
 * Build USD geometry from GLTF primitive
 */
export function buildUsdGeometry(mesh: Mesh, primitiveIndex: number): GeometryBuildResult {
  const primitive = mesh.listPrimitives()[primitiveIndex];

  if (!primitive) {
    throw new Error(`Primitive ${primitiveIndex} not found in mesh`);
  }

  const positions = primitive.getAttribute('POSITION');
  const normals = primitive.getAttribute('NORMAL');
  const uvs = primitive.getAttribute('TEXCOORD_0');
  const indices = primitive.getIndices();

  if (!positions) {
    throw new Error(`Primitive ${primitiveIndex} missing POSITION attribute`);
  }

  let usdContent = '';

  // Extract and validate position data
  const positionArray = positions.getArray();
  if (!positionArray || positionArray.length === 0) {
    throw new Error(`Primitive ${primitiveIndex} has empty position data`);
  }

  const vertexCount = positionArray.length / 3;

  // Calculate bounding box
  const bounds = calculateBounds(positionArray);

  // Generate vertex positions
  usdContent += generatePositions(positionArray);

  // Generate face topology
  if (indices) {
    const indexArray = indices.getArray();
    if (indexArray && indexArray.length > 0) {
      const faceCount = indexArray.length / 3;
      usdContent += generateFaceData(indexArray as Uint32Array | Uint16Array | Uint8Array | Int8Array | Int16Array);

      // Add normals if available
      if (normals) {
        const normalArray = normals.getArray();
        if (normalArray && normalArray.length > 0) {
          usdContent += generateNormals(normalArray);
        }
      }

      // Add UVs if available
      if (uvs) {
        const uvArray = uvs.getArray();
        if (uvArray && uvArray.length > 0) {
          usdContent += generateUVs(uvArray);
        }
      }

      // Add extent (bounding box)
      usdContent += generateExtent(bounds.min, bounds.max);

      return {
        content: usdContent,
        boundsMin: bounds.min,
        boundsMax: bounds.max,
        vertexCount,
        faceCount
      };
    }
  }

  // Fallback for non-indexed geometry
  const faceCount = vertexCount / 3;
  usdContent += `    int[] faceVertexCounts = [${Array(faceCount).fill(3).join(', ')}]\n`;

  const faceIndices = Array.from({ length: vertexCount }, (_, i) => i);
  usdContent += `    int[] faceVertexIndices = [${faceIndices.join(', ')}]\n`;

  usdContent += generateExtent(bounds.min, bounds.max);

  return {
    content: usdContent,
    boundsMin: bounds.min,
    boundsMax: bounds.max,
    vertexCount,
    faceCount
  };
}

/**
 * Calculate bounding box from positions
 */
function calculateBounds(positions: Float32Array | Int8Array | Int16Array | Uint8Array | Uint16Array | Uint32Array): {
  min: [number, number, number];
  max: [number, number, number];
} {
  if (positions.length < 3) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0]
    };
  }

  let minX = positions[0], maxX = positions[0];
  let minY = positions[1], maxY = positions[1];
  let minZ = positions[2], maxZ = positions[2];

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ]
  };
}

/**
 * Generate USD points array
 */
function generatePositions(positions: Float32Array | Int8Array | Int16Array | Uint8Array | Uint16Array | Uint32Array): string {
  const pointCount = positions.length / 3;
  let content = `    point3f[] points = [`;

  for (let i = 0; i < pointCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    content += `(${x}, ${y}, ${z})`;
    if (i < pointCount - 1) content += `, `;
  }

  content += `]\n`;
  return content;
}

/**
 * Generate USD face data
 */
function generateFaceData(indices: Uint32Array | Uint16Array | Uint8Array | Int8Array | Int16Array): string {
  const faceCount = indices.length / 3;
  let content = `    int[] faceVertexCounts = [${Array(faceCount).fill(3).join(', ')}]\n`;

  content += `    int[] faceVertexIndices = [`;
  for (let i = 0; i < indices.length; i++) {
    content += `${indices[i]}`;
    if (i < indices.length - 1) content += `, `;
  }
  content += `]\n`;

  return content;
}

/**
 * Generate USD normals array
 */
function generateNormals(normals: Float32Array | Int8Array | Int16Array | Uint8Array | Uint16Array | Uint32Array): string {
  const normalCount = normals.length / 3;
  let content = `    normal3f[] normals = [`;

  for (let i = 0; i < normalCount; i++) {
    const x = normals[i * 3];
    const y = normals[i * 3 + 1];
    const z = normals[i * 3 + 2];
    content += `(${x}, ${y}, ${z})`;
    if (i < normalCount - 1) content += `, `;
  }

  content += `]\n`;
  content += `    uniform token primvars:normals:interpolation = "vertex"\n`;

  return content;
}

/**
 * Generate USD UV array
 */
function generateUVs(uvs: Float32Array | Int8Array | Int16Array | Uint8Array | Uint16Array | Uint32Array): string {
  const uvCount = uvs.length / 2;
  let content = `    float2[] primvars:st = [`;

  for (let i = 0; i < uvCount; i++) {
    const u = uvs[i * 2];
    const v = 1.0 - uvs[i * 2 + 1]; // Flip V for USD
    content += `(${u}, ${v})`;
    if (i < uvCount - 1) content += `, `;
  }

  content += `]\n`;
  content += `    uniform token primvars:st:interpolation = "vertex"\n`;

  return content;
}

/**
 * Generate USD extent property
 */
function generateExtent(min: [number, number, number], max: [number, number, number]): string {
  return `    float3[] extent = [(${min[0]}, ${min[1]}, ${min[2]}), (${max[0]}, ${max[1]}, ${max[2]})]\n`;
}

/**
 * Wrap geometry in USD mesh file
 */
export function wrapGeometryInUsdFile(geometryContent: string, meshName: string = "Geometry"): string {
  return `#usda 1.0
(
    defaultPrim = "${meshName}"
    metersPerUnit = 1
    upAxis = "Y"
)

def Mesh "${meshName}"
{
${geometryContent}    uniform token subdivisionScheme = "none"
}
`;
}

