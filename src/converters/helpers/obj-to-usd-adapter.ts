/**
 * OBJ to USD Adapter
 * 
 * Converts OBJ mesh data to USD format.
 * Handles geometry embedding and transformations.
 */

import { ParsedGeometry } from '../parsers/obj-mesh-parser';
import { UsdNode } from '../../core/usd-node';
import { USD_NODE_TYPES } from '../../constants/usd';

/**
 * OBJ Mesh Adapter Interface
 */
export interface ObjMeshAdapter {
  mesh: ParsedGeometry;
  geometryId: string;
  geometryName: string;
}

/**
 * Converts OBJ meshes to USD format
 */
export function adaptObjMeshesToUsd(meshes: ParsedGeometry[]): ObjMeshAdapter[] {
  return meshes.map((mesh, index) => ({
    mesh,
    geometryId: `Geometry_${index}`,
    geometryName: `Geometry_${index}`
  }));
}

/**
 * Creates USD mesh nodes from OBJ mesh data
 */
export function createUsdMeshFromObj(
  adapter: ObjMeshAdapter,
  parentNode: UsdNode
): UsdNode {
  const { mesh, geometryName } = adapter;

  const meshNode = new UsdNode(
    `${parentNode.getPath()}/${geometryName}`,
    USD_NODE_TYPES.MESH
  );

  addObjGeometryToMesh(mesh, meshNode);
  applyObjTransform(mesh, meshNode);

  parentNode.addChild(meshNode);
  return meshNode;
}

/**
 * Adds OBJ geometry data to USD mesh node
 */
function addObjGeometryToMesh(mesh: ParsedGeometry, meshNode: UsdNode): void {
  const { vertexArray, normalArray, uvArray, indexArray } = mesh;

  if (indexArray && indexArray.length > 0) {
    const faceCounts = new Array(indexArray.length / 3).fill(3);
    meshNode.setProperty('int[] faceVertexCounts', `[${faceCounts.join(', ')}]`, 'raw');

    const indicesList = Array.from(indexArray).map(i => i.toString()).join(', ');
    meshNode.setProperty('int[] faceVertexIndices', `[${indicesList}]`, 'raw');
  }

  if (vertexArray && vertexArray.length > 0) {
    const points = [];
    for (let i = 0; i < vertexArray.length; i += 3) {
      points.push(`(${vertexArray[i]}, ${vertexArray[i + 1]}, ${vertexArray[i + 2]})`);
    }
    meshNode.setProperty('point3f[] points', `[${points.join(', ')}]`, 'raw');
  }

  if (normalArray && normalArray.length > 0) {
    const normals = [];
    for (let i = 0; i < normalArray.length; i += 3) {
      normals.push(`(${normalArray[i]}, ${normalArray[i + 1]}, ${normalArray[i + 2]})`);
    }
    meshNode.setProperty('float3[] normals', `[${normals.join(', ')}]`, 'raw');
  }

  if (uvArray && uvArray.length > 0) {
    const uvs = [];
    for (let i = 0; i < uvArray.length; i += 2) {
      uvs.push(`(${uvArray[i]}, ${uvArray[i + 1]})`);
    }
    meshNode.setProperty('texCoord2f[] primvars:st', `[${uvs.join(', ')}]`, 'texcoord');
    meshNode.setProperty('primvars:st:interpolation', 'vertex', 'interpolation');
  }
}

/**
 * Apply transform to OBJ mesh
 */
function applyObjTransform(mesh: ParsedGeometry, usdNode: UsdNode): void {
  if (!mesh.vertexArray || mesh.vertexArray.length === 0) {
    return;
  }

  const bounds = calculateBoundingBox(mesh.vertexArray);

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  const maxDimension = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    bounds.maxZ - bounds.minZ
  );

  const targetSize = 2.0;
  const scale = maxDimension > 0 ? targetSize / maxDimension : 1.0;

  const m = [
    scale, 0, 0, 0,
    0, scale, 0, 0,
    0, 0, scale, 0,
    -centerX * scale, -centerY * scale, -centerZ * scale, 1
  ];

  const matrixString = `( (${m[0]}, ${m[1]}, ${m[2]}, ${m[3]}), (${m[4]}, ${m[5]}, ${m[6]}, ${m[7]}), (${m[8]}, ${m[9]}, ${m[10]}, ${m[11]}), (${m[12]}, ${m[13]}, ${m[14]}, ${m[15]}) )`;

  usdNode.setProperty('xformOp:transform', matrixString);
  usdNode.setProperty('xformOpOrder', ['xformOp:transform'], 'token[]');
}

/**
 * Calculate bounding box from vertex data
 */
function calculateBoundingBox(vertices: Float32Array): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i + 1];
    const z = vertices[i + 2];

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
}
