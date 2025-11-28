/**
 * USD Hierarchy Builder
 * 
 * Builds USD node hierarchy from GLTF nodes.
 */

import { Document, Node, Mesh, Primitive, Material, Skin } from '@gltf-transform/core';
import { MappingList } from '@gltf-transform/extensions';
import { UsdNode } from '../../../core/usd-node';
import { USD_NODE_TYPES, USD_PROPERTIES, USD_PROPERTY_TYPES } from '../../../constants/usd';
import { buildUsdMaterial, extractTextureData } from '../../shared/usd-material-builder';
import { sanitizeName, formatUsdNumberArray, setTransformMatrix, buildMatrixFromTRS } from '../../../utils';
import { formatUsdTuple3, formatUsdTuple2 } from '../../../utils/usd-formatter';
import { SkeletonData } from './skeleton-processor';
import { ApiSchemaBuilder, API_SCHEMAS } from '../../../utils/api-schema-builder';
import { processLightExtension, applyLightToUsdNode } from '../extensions/light-processor';
import { processInstancingExtension, applyInstancingToUsdNode } from '../extensions/instancing-processor';

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
  nodeMap: Map<Node, UsdNode>;
  skeletonMap?: Map<Skin, SkeletonData>;
}

/**
 * Calculate scene extent from all mesh nodes
 * Returns [minX, minY, minZ, maxX, maxY, maxZ] or null if no extents found
 */
export function calculateSceneExtent(sceneNode: UsdNode): [number, number, number, number, number, number] | null {
  const extents: Array<{ min: [number, number, number]; max: [number, number, number] }> = [];

  // Recursively collect extents from all mesh nodes
  function collectExtents(node: UsdNode): void {
    // Get extent property if present
    const extentProp = node.getProperty('float3[] extent');
    if (extentProp && typeof extentProp === 'string') {
      // Parse extent string: [(minX, minY, minZ), (maxX, maxY, maxZ)]
      const extentMatch = extentProp.match(/\[\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\),\s*\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)\]/);
      if (extentMatch) {
        const min: [number, number, number] = [
          parseFloat(extentMatch[1]),
          parseFloat(extentMatch[2]),
          parseFloat(extentMatch[3])
        ];
        const max: [number, number, number] = [
          parseFloat(extentMatch[4]),
          parseFloat(extentMatch[5]),
          parseFloat(extentMatch[6])
        ];
        extents.push({ min, max });
      }
    }

    // Recursively process children
    for (const child of node.getChildren()) {
      collectExtents(child);
    }
  }

  collectExtents(sceneNode);

  if (extents.length === 0) {
    return null;
  }

  // Calculate combined extent
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const extent of extents) {
    minX = Math.min(minX, extent.min[0]);
    minY = Math.min(minY, extent.min[1]);
    minZ = Math.min(minZ, extent.min[2]);
    maxX = Math.max(maxX, extent.max[0]);
    maxY = Math.max(maxY, extent.max[1]);
    maxZ = Math.max(maxZ, extent.max[2]);
  }

  return [minX, minY, minZ, maxX, maxY, maxZ];
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

  // Add to node map for animation processing
  context.nodeMap.set(gltfNode, currentNode);

  const mesh = gltfNode.getMesh();
  if (mesh) {
    context.materialCounter = await processMesh(
      mesh,
      currentNode,
      nodeName,
      context
    );

  }

  // Process light extension if present
  const lightProps = processLightExtension(gltfNode);
  if (lightProps) {
    applyLightToUsdNode(currentNode, lightProps);
  }

  // Process GPU instancing extension if present
  const instancingProps = processInstancingExtension(gltfNode);
  if (instancingProps && mesh) {
    // For instancing, we need to reference the prototype mesh
    // The prototype path would be the mesh node path
    const prototypePath = currentNode.getPath();
    applyInstancingToUsdNode(currentNode, instancingProps, prototypePath);
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
 * Use Xform for nodes with transforms, Mesh prims will be created as children
 */
function determineNodeType(_gltfNode: Node): string {
  // Always use Xform - Mesh prims will be created as children
  // This ensures transforms are on Xform nodes, not Mesh prims
  return USD_NODE_TYPES.XFORM;
}

/**
 * Applies transformation matrix to USD node
 * Computes matrix from TRS components if getMatrix() returns null
 */
function applyTransform(gltfNode: Node, usdNode: UsdNode): void {
  let transform = gltfNode.getMatrix();

  // If getMatrix() returns null, compute matrix from TRS components
  // This ensures we always have a valid transform matrix
  if (!transform) {
    const translation = gltfNode.getTranslation();
    const rotation = gltfNode.getRotation();
    const scale = gltfNode.getScale();

    // Only compute if at least one component is non-default
    const hasTranslation = translation && (translation[0] !== 0 || translation[1] !== 0 || translation[2] !== 0);
    const hasRotation = rotation && (rotation[0] !== 0 || rotation[1] !== 0 || rotation[2] !== 0 || rotation[3] !== 1);
    const hasScale = scale && (scale[0] !== 1 || scale[1] !== 1 || scale[2] !== 1);

    if (hasTranslation || hasRotation || hasScale) {
      // GLTF uses quaternion format (x, y, z, w), but buildMatrixFromTRS expects (w, x, y, z)
      // Convert rotation format if present
      let rotationForMatrix: [number, number, number, number] = [0, 0, 0, 1];
      if (rotation) {
        rotationForMatrix = [rotation[3], rotation[0], rotation[1], rotation[2]]; // Convert (x,y,z,w) to (w,x,y,z)
      }

      // Build matrix from TRS using utility function
      const matrixString = buildMatrixFromTRS(
        translation || [0, 0, 0],
        rotationForMatrix,
        scale || [1, 1, 1]
      );

      // Convert matrix string to array for setTransformMatrix
      // Matrix string format: "((m00, m01, m02, m03), (m10, m11, m12, m13), (m20, m21, m22, m23), (m30, m31, m32, m33))"
      const matrixMatch = matrixString.match(/\(\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\),\s*\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\),\s*\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\),\s*\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)\)/);
      if (matrixMatch) {
        transform = [
          parseFloat(matrixMatch[1]), parseFloat(matrixMatch[2]), parseFloat(matrixMatch[3]), parseFloat(matrixMatch[4]),
          parseFloat(matrixMatch[5]), parseFloat(matrixMatch[6]), parseFloat(matrixMatch[7]), parseFloat(matrixMatch[8]),
          parseFloat(matrixMatch[9]), parseFloat(matrixMatch[10]), parseFloat(matrixMatch[11]), parseFloat(matrixMatch[12]),
          parseFloat(matrixMatch[13]), parseFloat(matrixMatch[14]), parseFloat(matrixMatch[15]), parseFloat(matrixMatch[16])
        ];
      }
    } else {
      // Identity transform - no need to set
      return;
    }
  }

  if (!transform) return;

  // Use utility function for consistent matrix formatting and transform setting
  setTransformMatrix(usdNode, transform);
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

  // Check for morph targets - need SkelRoot wrapper if found
  let hasMorphTargets = false;
  for (let i = 0; i < primitives.length; i++) {
    const primitive = primitives[i];
    const targets = primitive.listTargets();
    if (targets.length > 0) {
      hasMorphTargets = true;
      break;
    }
  }

  // Wrap mesh in SkelRoot when morph targets are present
  let meshContainer: UsdNode = parentNode;
  if (hasMorphTargets) {
    const skelRootName = sanitizeName(`${nodeName}_SkelRoot`);
    const skelRootPath = `${parentNode.getPath()}/${skelRootName}`;
    const skelRootNode = new UsdNode(skelRootPath, 'SkelRoot');

    skelRootNode.setMetadata('kind', 'component');

    // Apply SkelBindingAPI to SkelRoot for morph targets
    // This helps viewers recognize the SkelRoot as an animation container
    ApiSchemaBuilder.addApiSchema(skelRootNode, API_SCHEMAS.SKEL_BINDING);

    parentNode.addChild(skelRootNode);
    meshContainer = skelRootNode;
  }

  for (let i = 0; i < primitives.length; i++) {
    const primitive = primitives[i];
    const metadata = context.primitiveMetadata.find(
      p => p.mesh === mesh && p.primitiveIndex === i
    );

    if (!metadata) continue;

    const targetNode = createPrimitiveNode(
      meshContainer,
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
 * Creates Mesh prims directly under parent (no nesting)
 * If single primitive, use simple name; if multiple, add index
 */
function createPrimitiveNode(
  parentNode: UsdNode,
  nodeName: string,
  primitiveIndex: number,
  totalPrimitives: number
): UsdNode {
  // Create Mesh prim directly under parent (no nesting)
  // Parent is already an Xform node with the transform
  const meshNodeName = totalPrimitives === 1 ? `${nodeName}_Mesh` : `${nodeName}_prim${primitiveIndex}`;
  const targetNode = new UsdNode(
    `${parentNode.getPath()}/${meshNodeName}`,
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
  const indices = primitive.getIndices();

  if (!position) {
    return;
  }

  // Extract vertex positions and calculate bounding box
  const positionArray = position.getArray();
  let extentMin: [number, number, number] | null = null;
  let extentMax: [number, number, number] | null = null;

  if (positionArray) {
    const points: string[] = [];
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < positionArray.length; i += 3) {
      const x = positionArray[i];
      const y = positionArray[i + 1];
      const z = positionArray[i + 2];

      points.push(formatUsdTuple3(x, y, z));

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }

    node.setProperty('point3f[] points', `[${points.join(', ')}]`, 'raw');

    extentMin = [minX, minY, minZ];
    extentMax = [maxX, maxY, maxZ];
  }

  // Face vertex counts (how many vertices per face)
  if (indices) {
    const faceCounts = new Array(indices.getCount() / 3).fill(3);
    node.setProperty('int[] faceVertexCounts', `[${faceCounts.join(', ')}]`, 'raw');

    // Face vertex indices (which vertices make up each face)
    const indexArray = indices.getArray();
    if (indexArray) {
      const indicesList = formatUsdNumberArray(Array.from(indexArray));
      node.setProperty('int[] faceVertexIndices', indicesList, 'raw');
    }
  }

  // Normals (if available) - add with interpolation property
  if (normal) {
    const normalArray = normal.getArray();
    if (normalArray) {
      const normals: string[] = [];
      for (let i = 0; i < normalArray.length; i += 3) {
        normals.push(formatUsdTuple3(normalArray[i], normalArray[i + 1], normalArray[i + 2]));
      }
      node.setProperty('float3[] normals', `[${normals.join(', ')}]`, 'raw');
      node.setProperty('token normals:interpolation', 'vertex', 'interpolation');
    }
  }

  // UV coordinates for texture mapping - extract ALL TEXCOORD sets
  // GLTF supports TEXCOORD_0, TEXCOORD_1, etc., which map to USD primvars:st, primvars:st1, etc.
  for (let uvSetIndex = 0; uvSetIndex < 8; uvSetIndex++) { // GLTF spec allows up to 8 UV sets
    const texcoord = primitive.getAttribute(`TEXCOORD_${uvSetIndex}`);
    if (!texcoord) {
      continue; // Skip if this UV set doesn't exist
    }

    const texcoordArray = texcoord.getArray();
    if (!texcoordArray || texcoordArray.length === 0) {
      continue;
    }

    // Extract UVs directly from GLTF (no normalization)
    // USD requires V-axis flip: GLTF uses top-left origin, USD uses bottom-left origin
    const uvs: string[] = [];
    for (let i = 0; i < texcoordArray.length; i += 2) {
      const u = texcoordArray[i];
      const v = texcoordArray[i + 1];

      // Flip V-axis for USD coordinate system
      // GLTF: (0,0) at top-left, USD: (0,0) at bottom-left
      const flippedV = 1.0 - v;
      uvs.push(formatUsdTuple2(u, flippedV));
    }

    // Map TEXCOORD_0 -> primvars:st, TEXCOORD_1 -> primvars:st1, etc.
    const primvarName = uvSetIndex === 0 ? 'st' : `st${uvSetIndex}`;
    node.setProperty(`texCoord2f[] primvars:${primvarName}`, `[${uvs.join(', ')}]`, 'texcoord');
    node.setProperty(`uniform token primvars:${primvarName}:interpolation`, 'vertex', 'interpolation');
  }

  // Convert vertex colors to USD primvars:displayColor
  const colorAttr = primitive.getAttribute('COLOR_0');
  if (colorAttr) {
    const colorArray = colorAttr.getArray();
    if (colorArray && colorArray.length > 0) {
      const vertexCount = positionArray ? positionArray.length / 3 : 0;
      const componentCount = vertexCount > 0 ? colorArray.length / vertexCount : 3;

      const colors: string[] = [];
      for (let i = 0; i < colorArray.length; i += componentCount) {
        const r = colorArray[i];
        const g = colorArray[i + 1];
        const b = colorArray[i + 2];
        colors.push(formatUsdTuple3(r, g, b));
      }

      node.setProperty('color3f[] primvars:displayColor', `[${colors.join(', ')}]`, 'raw');
      node.setProperty('uniform token primvars:displayColor:interpolation', 'vertex', 'interpolation');
    }
  }

  // Set bounding box extent
  if (extentMin && extentMax) {
    const extentMinStr = formatUsdTuple3(extentMin[0], extentMin[1], extentMin[2]);
    const extentMaxStr = formatUsdTuple3(extentMax[0], extentMax[1], extentMax[2]);
    node.setProperty('float3[] extent', `[${extentMinStr}, ${extentMaxStr}]`, 'raw');
  }

  // Extract morph targets and create USD blend shapes
  if (positionArray) {
    extractMorphTargets(primitive, mesh, node, positionArray);
  }

  // Add standard mesh properties
  node.setProperty('token subdivisionScheme', 'none', 'token');
  node.setProperty('token visibility', 'inherited', 'token');

  // Set purpose to "guide" for control bones/helpers (hide from rendering)
  // These are typically named with "Bone" in the name and are helper geometry
  const nodePath = node.getPath();
  const isControlBone = nodePath.includes('Bone') || nodePath.includes('_Bone_') || nodePath.includes('Armature');

  if (isControlBone) {
    node.setProperty('token purpose', 'guide', 'token');
  } else {
    node.setProperty('token purpose', 'default', 'token');
  }
}

/**
 * Extracts morph targets and creates USD BlendShape prims.
 * Each target's POSITION offsets are calculated and stored as separate BlendShape prims.
 * The mesh references them via skel:blendShapes relationship.
 */
function extractMorphTargets(
  primitive: Primitive,
  mesh: Mesh,
  node: UsdNode,
  basePositionArray: ArrayLike<number>
): number {
  const targets = primitive.listTargets();

  if (targets.length === 0) {
    return 0;
  }

  const blendShapePaths: string[] = [];

  // Try to extract morph target names from extras (not always present in GLB)
  const primitiveExtras: Record<string, unknown> = primitive.getExtras();
  const meshExtras: Record<string, unknown> = mesh.getExtras();

  const getStringArrayFromExtras = (extras: Record<string, unknown>, ...keys: string[]): string[] => {
    for (const key of keys) {
      const value = extras[key];
      if (Array.isArray(value) && value.every((item): item is string => typeof item === 'string')) {
        return value;
      }
    }
    return [];
  };

  const getNamesFromTargets = (extras: Record<string, unknown>): string[] => {
    const targets = extras.targets;
    if (Array.isArray(targets)) {
      return targets
        .map((target): string | null => {
          if (target && typeof target === 'object' && 'name' in target && typeof target.name === 'string') {
            return target.name;
          }
          return null;
        })
        .filter((name): name is string => name !== null);
    }
    return [];
  };

  // Look for names in primitive extras first, then mesh extras
  let morphTargetNames: string[] = getStringArrayFromExtras(primitiveExtras, 'targetNames', 'morphTargetNames');
  if (morphTargetNames.length === 0) {
    morphTargetNames = getStringArrayFromExtras(meshExtras, 'targetNames', 'morphTargetNames');
  }
  if (morphTargetNames.length === 0) {
    morphTargetNames = getNamesFromTargets(primitiveExtras);
  }

  for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
    const target = targets[targetIndex];
    const positionAttr = target.getAttribute('POSITION');

    if (!positionAttr) {
      continue;
    }

    const morphPositionArray = positionAttr.getArray();
    if (!morphPositionArray || morphPositionArray.length !== basePositionArray.length) {
      continue;
    }

    // Use name from extras if available, otherwise generate generic name
    let blendShapeName: string;
    if (targetIndex < morphTargetNames.length && morphTargetNames[targetIndex]) {
      blendShapeName = sanitizeName(morphTargetNames[targetIndex]);
    } else {
      blendShapeName = `BlendShape_${targetIndex}`;
    }

    const blendShapePath = `${node.getPath()}/${blendShapeName}`;
    const blendShapeNode = new UsdNode(blendShapePath, 'BlendShape');

    // Calculate vertex offsets (morph position - base position)
    const offsets: string[] = [];
    for (let i = 0; i < basePositionArray.length; i += 3) {
      const baseX = basePositionArray[i];
      const baseY = basePositionArray[i + 1];
      const baseZ = basePositionArray[i + 2];
      const morphX = morphPositionArray[i];
      const morphY = morphPositionArray[i + 1];
      const morphZ = morphPositionArray[i + 2];

      const offsetX = morphX - baseX;
      const offsetY = morphY - baseY;
      const offsetZ = morphZ - baseZ;

      offsets.push(formatUsdTuple3(offsetX, offsetY, offsetZ));
    }

    blendShapeNode.setProperty('point3f[] offsets', `[${offsets.join(', ')}]`, 'raw');
    node.addChild(blendShapeNode);
    blendShapePaths.push(blendShapePath);
  }

  // Bind blend shapes to mesh via skel:blendShapes relationship
  if (blendShapePaths.length > 0) {
    ApiSchemaBuilder.addApiSchema(node, API_SCHEMAS.SKEL_BINDING);
    const blendShapeRels = blendShapePaths.map(path => `<${path}>`);
    node.setProperty('rel skel:blendShapes', blendShapeRels, 'rel[]');
  }

  return targets.length;
}

/**
 * Processes material for a primitive
 * Handles both standard materials and material variants (KHR_materials_variants)
 */
async function processMaterial(
  primitive: Primitive,
  targetNode: UsdNode,
  context: HierarchyBuilderContext
): Promise<number> {
  // Check for material variants extension
  const mappingList = primitive.getExtension<MappingList>('KHR_materials_variants');

  if (mappingList) {
    // Process material variants
    return await processMaterialVariants(primitive, targetNode, context, mappingList);
  }

  // Process standard material
  const material = primitive.getMaterial();
  if (!material) {
    return context.materialCounter;
  }

  let materialInfo = context.materialMap.get(material);

  if (!materialInfo) {
    materialInfo = await createMaterial(
      material,
      context.materialCounter,
      context,
      primitive
    );

    context.materialMap.set(material, materialInfo);
    context.materialCounter++;
  }

  bindMaterial(targetNode, materialInfo);

  return context.materialCounter;
}

/**
 * Processes material variants (KHR_materials_variants)
 * Creates USD variantSets with variants for each material mapping
 */
async function processMaterialVariants(
  primitive: Primitive,
  targetNode: UsdNode,
  context: HierarchyBuilderContext,
  mappingList: MappingList
): Promise<number> {
  const mappings = mappingList.listMappings();
  if (mappings.length === 0) {
    // Fallback to default material if no mappings
    return await processMaterial(primitive, targetNode, context);
  }

  // Get default material (if any)
  const defaultMaterial = primitive.getMaterial();
  let defaultMaterialInfo: MaterialInfo | null = null;

  if (defaultMaterial) {
    const existingMaterialInfo = context.materialMap.get(defaultMaterial);
    if (existingMaterialInfo) {
      defaultMaterialInfo = existingMaterialInfo;
    } else {
      defaultMaterialInfo = await createMaterial(
        defaultMaterial,
        context.materialCounter,
        context,
        primitive
      );
      context.materialMap.set(defaultMaterial, defaultMaterialInfo);
      context.materialCounter++;
    }
  }

  // Collect all unique variants and their materials
  const variantMaterials = new Map<string, MaterialInfo>();
  const variantSetName = 'materialVariant';

  for (const mapping of mappings) {
    const material = mapping.getMaterial();
    if (!material) continue;

    const variants = mapping.listVariants();
    if (variants.length === 0) continue;

    // Get or create material info
    let materialInfo = context.materialMap.get(material);
    if (!materialInfo) {
      materialInfo = await createMaterial(
        material,
        context.materialCounter,
        context,
        primitive
      );
      context.materialMap.set(material, materialInfo);
      context.materialCounter++;
    }

    // Map each variant to this material
    for (const variant of variants) {
      const variantName = variant.getName() || `variant_${variantMaterials.size}`;
      const sanitizedVariantName = sanitizeName(variantName);
      variantMaterials.set(sanitizedVariantName, materialInfo);
    }
  }

  // Create USD variant set
  if (variantMaterials.size > 0) {
    targetNode.setProperty(`variantSetNames`, `["${variantSetName}"]`, 'token[]');
    targetNode.setProperty(`variantSet.variantSetNames`, `["${variantSetName}"]`, 'token[]');

    // Create variants
    for (const [variantName, materialInfo] of variantMaterials.entries()) {
      // Set material binding for this variant
      ApiSchemaBuilder.addApiSchema(targetNode, API_SCHEMAS.MATERIAL_BINDING);
      const materialPath = materialInfo.node.getPath();

      // Note: USD variant syntax requires setting properties within variant scope
      // This is a simplified approach - full variant implementation would require
      // more complex USD structure
      targetNode.setProperty(
        `${variantSetName}.${variantName}.${USD_PROPERTIES.MATERIAL_BINDING}`,
        `<${materialPath}>`,
        USD_PROPERTY_TYPES.REL
      );
    }

    // Set default variant (use first variant or default material)
    if (defaultMaterialInfo) {
      bindMaterial(targetNode, defaultMaterialInfo);
    } else if (variantMaterials.size > 0) {
      const firstVariant = Array.from(variantMaterials.values())[0];
      bindMaterial(targetNode, firstVariant);
    }
  } else if (defaultMaterialInfo) {
    // Fallback to default material if no variants
    bindMaterial(targetNode, defaultMaterialInfo);
  }

  return context.materialCounter;
}

/**
 * Creates a new USD material.
 * Primitive is optional - used to check for vertex colors that need texture baking.
 */
async function createMaterial(
  material: Material,
  materialCounter: number,
  context: HierarchyBuilderContext,
  primitive?: Primitive
): Promise<MaterialInfo> {
  const materialResult = await buildUsdMaterial(
    material,
    materialCounter,
    context.materialsNode.getPath(),
    context.document,
    primitive
  );

  context.materialsNode.addChild(materialResult.materialNode);

  // Attach UV readers and Transform2d nodes to material
  for (const uvReader of materialResult.uvReaders) {
    materialResult.materialNode.addChild(uvReader);
  }
  for (const transform2d of materialResult.transform2dNodes) {
    materialResult.materialNode.addChild(transform2d);
  }

  // Process textures - handle both baked vertex color textures and regular GLTF textures
  for (const texRef of materialResult.textures) {
    if ('textureData' in texRef && texRef.textureData) {
      context.textureFiles.set(texRef.id, texRef.textureData);
    } else if (texRef.texture) {
      const textureData = await extractTextureData(texRef.texture);
      context.textureFiles.set(texRef.id, textureData);
    }
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
  // Add MaterialBindingAPI without overwriting existing schemas (e.g., SkelBindingAPI)
  ApiSchemaBuilder.addApiSchema(node, API_SCHEMAS.MATERIAL_BINDING);

  const materialPath = materialInfo.node.getPath();

  node.setProperty(
    USD_PROPERTIES.MATERIAL_BINDING,
    `<${materialPath}>`,
    USD_PROPERTY_TYPES.REL
  );
}


