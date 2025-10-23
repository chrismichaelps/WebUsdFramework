/**
 * USD Hierarchy Builder
 * 
 * Builds USD node hierarchy from GLTF nodes.
 */

import { Document } from '@gltf-transform/core';
import { UsdNode } from '../../core/usd-node';
import { USD_NODE_TYPES, USD_PROPERTIES, USD_PROPERTY_TYPES } from '../../constants/usd';
import { buildUsdMaterial, extractTextureData } from '../usd-material-builder';
import { sanitizeName } from '../../utils';

/**
 * Primitive Metadata Interface
 */
export interface PrimitiveMetadata {
  mesh: any;
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
  materialMap: Map<any, MaterialInfo>;
  textureFiles: Map<string, ArrayBuffer>;
  materialsNode: UsdNode;
  materialCounter: number;
  document: Document;
}

/**
 * Builds USD node hierarchy recursively
 */
export async function buildNodeHierarchy(
  gltfNode: any,
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
function generateNodeName(gltfNode: any): string {
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
function determineNodeType(gltfNode: any): string {
  const mesh = gltfNode.getMesh();
  const hasSinglePrimitive = mesh && mesh.listPrimitives().length === 1;

  return hasSinglePrimitive ? USD_NODE_TYPES.MESH : USD_NODE_TYPES.XFORM;
}

/**
 * Applies transformation matrix to USD node
 */
function applyTransform(gltfNode: any, usdNode: UsdNode): void {
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
  mesh: any,
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
 * Attaches geometry reference to node
 */
function attachGeometryReference(
  node: UsdNode,
  metadata: PrimitiveMetadata
): void {
  const geometryRef = `@./geometries/${metadata.geometryName}.usda@</${metadata.geometryName}>`;
  node.setProperty(USD_PROPERTIES.PREPEND_REFERENCES, geometryRef);
}

/**
 * Processes material for a primitive
 */
async function processMaterial(
  primitive: any,
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
  material: any,
  materialCounter: number,
  context: HierarchyBuilderContext
): Promise<MaterialInfo> {
  const materialResult = buildUsdMaterial(
    material,
    materialCounter,
    context.materialsNode.getPath()
  );

  context.materialsNode.addChild(materialResult.materialNode);

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

  node.setProperty(
    USD_PROPERTIES.MATERIAL_BINDING,
    `<${materialInfo.node.getPath()}>`,
    USD_PROPERTY_TYPES.REL
  );
}

