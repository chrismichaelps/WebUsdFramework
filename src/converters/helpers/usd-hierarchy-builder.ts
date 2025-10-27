/**
 * USD Hierarchy Builder
 * 
 * Builds USD node hierarchy from GLTF nodes.
 */

import { Document, Node, Mesh, Primitive, Material } from '@gltf-transform/core';
import { UsdNode } from '../../core/usd-node';
import { USD_NODE_TYPES, USD_PROPERTIES, USD_PROPERTY_TYPES } from '../../constants/usd';
import { buildUsdMaterial, extractTextureData } from '../usd-material-builder';
import { sanitizeName } from '../../utils';

/**
 * Primitive Metadata Interface
 */
export interface PrimitiveMetadata {
  mesh: Mesh;
  primitiveIndex: number;
  geometryId: string;
  geometryName: string;
}

/**
 * Material Info Interface
 */
export interface MaterialInfo {
  index: number;
  node: UsdNode;
}

/**
 * Hierarchy Builder Context
 */
export interface HierarchyBuilderContext {
  primitiveMetadata: PrimitiveMetadata[];
  materialMap: Map<Material, MaterialInfo>;
  textureFiles: Map<string, ArrayBuffer>;
  materialsNode: UsdNode;
  materialCounter: number;
  document: Document;
}

/**
 * Builds USD node hierarchy recursively
 */
export async function buildNodeHierarchy(
  gltfNode: Node,
  parentUsdNode: UsdNode,
  context: HierarchyBuilderContext
): Promise<number> {
  const nodeName = generateNodeName(gltfNode);
  const nodeType = determineNodeType(gltfNode);

  const currentNode = new UsdNode(
    `${parentUsdNode.getPath()}/${nodeName}`,
    nodeType
  );

  applyTransform(gltfNode, currentNode);
  parentUsdNode.addChild(currentNode);

  const mesh = gltfNode.getMesh();
  if (mesh) {
    context.materialCounter = await processMesh(
      mesh,
      currentNode,
      nodeName,
      context
    );
  }

  // Process children recursively
  for (const childNode of gltfNode.listChildren()) {
    context.materialCounter = await buildNodeHierarchy(
      childNode,
      currentNode,
      context
    );
  }

  return context.materialCounter;
}

/**
 * Generates a node name from GLTF node
 */
function generateNodeName(gltfNode: Node): string {
  const name = gltfNode.getName();
  if (name) {
    return sanitizeName(name);
  }

  // Generate random name if not provided
  const randomId = Math.random().toString(36).substr(2, 9);
  return `Node_${randomId}`;
}

/**
 * Determines USD node type based on GLTF node
 */
function determineNodeType(gltfNode: Node): string {
  const mesh = gltfNode.getMesh();
  const hasSinglePrimitive = mesh && mesh.listPrimitives().length === 1;

  return hasSinglePrimitive ? USD_NODE_TYPES.MESH : USD_NODE_TYPES.XFORM;
}

/**
 * Applies transformation matrix to USD node
 */
function applyTransform(gltfNode: Node, usdNode: UsdNode): void {
  const transform = gltfNode.getMatrix();
  if (!transform) return;

  const m = Array.from(transform);
  const matrixString = `( (${m[0]}, ${m[1]}, ${m[2]}, ${m[3]}), (${m[4]}, ${m[5]}, ${m[6]}, ${m[7]}), (${m[8]}, ${m[9]}, ${m[10]}, ${m[11]}), (${m[12]}, ${m[13]}, ${m[14]}, ${m[15]}) )`;

  usdNode.setProperty(
    USD_PROPERTIES.XFORM_OP_TRANSFORM,
    matrixString
  );

  usdNode.setProperty(
    USD_PROPERTIES.XFORM_OP_ORDER,
    [USD_PROPERTIES.XFORM_OP_TRANSFORM],
    USD_PROPERTY_TYPES.TOKEN_ARRAY
  );
}

/**
 * Processes mesh and its primitives
 */
async function processMesh(
  mesh: Mesh,
  parentNode: UsdNode,
  nodeName: string,
  context: HierarchyBuilderContext
): Promise<number> {
  const primitives = mesh.listPrimitives();

  for (let i = 0; i < primitives.length; i++) {
    const primitive = primitives[i];
    const metadata = context.primitiveMetadata.find(
      p => p.mesh === mesh && p.primitiveIndex === i
    );

    if (!metadata) continue;

    const targetNode = createPrimitiveNode(
      parentNode,
      nodeName,
      i,
      primitives.length
    );

    attachGeometryReference(targetNode, metadata);

    context.materialCounter = await processMaterial(
      primitive,
      targetNode,
      context
    );
  }

  return context.materialCounter;
}

/**
 * Creates a node for a primitive
 */
function createPrimitiveNode(
  parentNode: UsdNode,
  nodeName: string,
  primitiveIndex: number,
  totalPrimitives: number
): UsdNode {
  if (totalPrimitives === 1) {
    return parentNode;
  }

  const primNodeName = `${nodeName}_prim${primitiveIndex}`;
  const targetNode = new UsdNode(
    `${parentNode.getPath()}/${primNodeName}`,
    USD_NODE_TYPES.MESH
  );

  parentNode.addChild(targetNode);
  return targetNode;
}

/**
 * Embeds geometry directly in the mesh node for optimal USDZ compatibility
 * Instead of referencing separate geometry files, all geometry data is embedded inline
 * This approach ensures proper rendering across different USD viewers and platforms
 */
function attachGeometryReference(
  node: UsdNode,
  metadata: PrimitiveMetadata
): void {
  // Get the mesh and primitive data
  const mesh = metadata.mesh;
  const primitiveIndex = metadata.primitiveIndex;
  const primitive = mesh.listPrimitives()[primitiveIndex];

  if (!primitive) {
    return;
  }

  // Get the geometry data from the primitive
  const position = primitive.getAttribute('POSITION');
  const normal = primitive.getAttribute('NORMAL');
  const texcoord = primitive.getAttribute('TEXCOORD_0');
  const indices = primitive.getIndices();

  if (!position) {
    return;
  }

  // Add the geometry data directly to the mesh node
  // This approach embeds all geometry data inline for optimal USDZ compatibility

  // Face vertex counts (how many vertices per face)
  if (indices) {
    const faceCounts = new Array(indices.getCount() / 3).fill(3);
    node.setProperty('int[] faceVertexCounts', `[${faceCounts.join(', ')}]`, 'raw');

    // Face vertex indices (which vertices make up each face)
    const indexArray = indices.getArray();
    if (indexArray) {
      const indicesList = Array.from(indexArray).map(i => i.toString()).join(', ');
      node.setProperty('int[] faceVertexIndices', `[${indicesList}]`, 'raw');
    }
  }

  // Points (vertex positions)
  const positionArray = position.getArray();
  if (positionArray) {
    const points = [];
    for (let i = 0; i < positionArray.length; i += 3) {
      points.push(`(${positionArray[i]}, ${positionArray[i + 1]}, ${positionArray[i + 2]})`);
    }
    node.setProperty('point3f[] points', `[${points.join(', ')}]`, 'raw');
  }

  // Normals (if available)
  if (normal) {
    const normalArray = normal.getArray();
    if (normalArray) {
      const normals = [];
      for (let i = 0; i < normalArray.length; i += 3) {
        normals.push(`(${normalArray[i]}, ${normalArray[i + 1]}, ${normalArray[i + 2]})`);
      }
      node.setProperty('float3[] normals', `[${normals.join(', ')}]`, 'raw');
    }
  }

  // UV coordinates for texture mapping
  if (texcoord) {
    const texcoordArray = texcoord.getArray();
    if (texcoordArray) {
      // Find min/max values for normalization
      let minU = Infinity, maxU = -Infinity;
      let minV = Infinity, maxV = -Infinity;

      for (let i = 0; i < texcoordArray.length; i += 2) {
        const u = texcoordArray[i];
        const v = texcoordArray[i + 1];
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
        minV = Math.min(minV, v);
        maxV = Math.max(maxV, v);
      }

      // Normalize UV coordinates to [0,1] range for proper texture mapping

      // Calculate normalization factors
      const uRange = maxU - minU;
      const vRange = maxV - minV;

      const uvs = [];
      for (let i = 0; i < texcoordArray.length; i += 2) {
        const u = texcoordArray[i];
        const v = texcoordArray[i + 1];

        // Normalize UV coordinates to [0,1] range and flip V-axis for proper texture mapping
        const normalizedU = uRange > 0 ? (u - minU) / uRange : 0;
        const normalizedV = vRange > 0 ? (v - minV) / vRange : 0;

        // Flip V-axis to match USD texture coordinate convention
        const flippedV = 1.0 - normalizedV;

        uvs.push(`(${normalizedU}, ${flippedV})`);
      }

      node.setProperty('texCoord2f[] primvars:st', `[${uvs.join(', ')}]`, 'texcoord');
      node.setProperty('primvars:st:interpolation', 'vertex', 'interpolation');
    }
  }

}

/**
 * Processes material for a primitive
 */
async function processMaterial(
  primitive: Primitive,
  targetNode: UsdNode,
  context: HierarchyBuilderContext
): Promise<number> {
  const material = primitive.getMaterial();
  if (!material) {
    return context.materialCounter;
  }

  let materialInfo = context.materialMap.get(material);

  if (!materialInfo) {
    materialInfo = await createMaterial(
      material,
      context.materialCounter,
      context
    );

    context.materialMap.set(material, materialInfo);
    context.materialCounter++;
  }

  bindMaterial(targetNode, materialInfo);

  return context.materialCounter;
}

/**
 * Creates a new USD material
 */
async function createMaterial(
  material: Material,
  materialCounter: number,
  context: HierarchyBuilderContext
): Promise<MaterialInfo> {
  const materialResult = await buildUsdMaterial(
    material,
    materialCounter,
    context.materialsNode.getPath()
  );

  context.materialsNode.addChild(materialResult.materialNode);

  // Add UV readers and Transform2d nodes to the material node
  for (const uvReader of materialResult.uvReaders) {
    materialResult.materialNode.addChild(uvReader);
  }
  for (const transform2d of materialResult.transform2dNodes) {
    materialResult.materialNode.addChild(transform2d);
  }

  // Process textures
  for (const texRef of materialResult.textures) {
    const textureData = await extractTextureData(texRef.texture);
    context.textureFiles.set(texRef.id, textureData);
  }

  return {
    index: materialCounter,
    node: materialResult.materialNode
  };
}

/**
 * Binds material to node
 */
function bindMaterial(node: UsdNode, materialInfo: MaterialInfo): void {
  node.setProperty(
    USD_PROPERTIES.PREPEND_API_SCHEMAS,
    [USD_PROPERTIES.MATERIAL_BINDING_API],
    USD_PROPERTY_TYPES.STRING_ARRAY
  );

  // Use the material path as-is (materials are now under /Root)
  const materialPath = materialInfo.node.getPath();

  node.setProperty(
    USD_PROPERTIES.MATERIAL_BINDING,
    `<${materialPath}>`,
    USD_PROPERTY_TYPES.REL
  );
}

