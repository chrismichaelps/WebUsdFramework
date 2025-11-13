/**
 * Skeleton Processor
 * 
 * Converts GLTF skins to USD Skeleton nodes.
 * Handles joint hierarchies, bind transforms, and rest transforms.
 */

import { Document, Node, Skin } from '@gltf-transform/core';
import { UsdNode } from '../../core/usd-node';
import { Logger, sanitizeName, formatUsdQuotedArray, formatUsdArray, formatUsdNumberArray, formatUsdNumberArrayFixed, formatMatrix, IDENTITY_MATRIX } from '../../utils';
import { ApiSchemaBuilder, API_SCHEMAS } from '../../utils/api-schema-builder';
import { SKELETON } from '../../constants/skeleton';

/**
 * Skeleton data structure
 */
export interface SkeletonData {
  skin: Skin;
  skelRootNode: UsdNode;
  skeletonPrimNode: UsdNode;
  jointNodes: Map<Node, UsdNode>;
  jointPaths: string[]; // Absolute paths (for internal use)
  jointRelativePaths: string[]; // Relative paths (for USD joints array)
  restTransforms?: string[]; // Store rest transforms for animation comparison
  restPoseTranslations?: string[]; // Store rest pose translations (extracted from rest transforms) for default animation values
  rootJointOmitted?: boolean; // Whether the root joint was omitted from the skeleton
}

/**
 * Check if a joint node has animation channels in any animation
 */
function hasJointAnimation(jointNode: Node, document: Document): boolean {
  const root = document.getRoot();
  const animations = root.listAnimations();

  for (const animation of animations) {
    const channels = animation.listChannels();
    for (const channel of channels) {
      const targetNode = channel.getTargetNode();
      if (targetNode === jointNode) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Process skeletons from GLTF document
 * Returns map of skin to skeleton data
 */
export function processSkeletons(
  document: Document,
  nodeMap: Map<Node, UsdNode>,
  rootPath: string,
  logger: Logger
): Map<Skin, SkeletonData> {
  const root = document.getRoot();
  const skins = root.listSkins();
  const skeletonMap = new Map<Skin, SkeletonData>();

  if (skins.length === 0) {
    logger.info('No skins found in GLTF document');
    return skeletonMap;
  }

  logger.info(`Processing ${skins.length} skeletons`, {
    skeletonCount: skins.length
  });

  for (const skin of skins) {
    // Check if root joint has animation before creating skeleton
    const joints = skin.listJoints();
    let shouldOmitRootJoint = false;

    if (joints.length > 0) {
      const rootJoint = joints[0];
      const hasAnimation = hasJointAnimation(rootJoint, document);
      shouldOmitRootJoint = !hasAnimation;

      if (shouldOmitRootJoint) {
        logger.info('Root joint has no animation, will be omitted from skeleton', {
          rootJointName: rootJoint.getName(),
          totalJoints: joints.length,
          skeletonJoints: joints.length - 1
        });
      } else {
        logger.info('Root joint has animation, will be included in skeleton', {
          rootJointName: rootJoint.getName(),
          totalJoints: joints.length
        });
      }
    }

    const skeletonData = createSkeleton(skin, nodeMap, rootPath, logger, shouldOmitRootJoint);
    if (skeletonData) {
      skeletonMap.set(skin, skeletonData);
    }
  }

  logger.info(`Created ${skeletonMap.size} skeleton(s)`);

  return skeletonMap;
}

/**
 * Invert a 4x4 matrix using cofactor method
 */
function invertMatrix4x4(m: number[]): number[] {
  const det = m[0] * (m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[6] * m[9] * m[15] + m[6] * m[11] * m[13] + m[7] * m[9] * m[14] - m[7] * m[10] * m[13])
    - m[1] * (m[4] * m[10] * m[15] - m[4] * m[11] * m[14] - m[6] * m[8] * m[15] + m[6] * m[11] * m[12] + m[7] * m[8] * m[14] - m[7] * m[10] * m[12])
    + m[2] * (m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[5] * m[8] * m[15] + m[5] * m[11] * m[12] + m[7] * m[8] * m[13] - m[7] * m[9] * m[12])
    - m[3] * (m[4] * m[9] * m[14] - m[4] * m[10] * m[13] - m[5] * m[8] * m[14] + m[5] * m[10] * m[12] + m[6] * m[8] * m[13] - m[6] * m[9] * m[12]);

  if (Math.abs(det) < 1e-10) {
    // Singular matrix, return identity
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  const invDet = 1.0 / det;
  return [
    (m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[6] * m[9] * m[15] + m[6] * m[11] * m[13] + m[7] * m[9] * m[14] - m[7] * m[10] * m[13]) * invDet,
    -(m[1] * m[10] * m[15] - m[1] * m[11] * m[14] - m[2] * m[9] * m[15] + m[2] * m[11] * m[13] + m[3] * m[9] * m[14] - m[3] * m[10] * m[13]) * invDet,
    (m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[2] * m[5] * m[15] + m[2] * m[7] * m[13] + m[3] * m[5] * m[14] - m[3] * m[6] * m[13]) * invDet,
    -(m[1] * m[6] * m[11] - m[1] * m[7] * m[10] - m[2] * m[5] * m[11] + m[2] * m[7] * m[9] + m[3] * m[5] * m[10] - m[3] * m[6] * m[9]) * invDet,
    -(m[4] * m[10] * m[15] - m[4] * m[11] * m[14] - m[6] * m[8] * m[15] + m[6] * m[11] * m[12] + m[7] * m[8] * m[14] - m[7] * m[10] * m[12]) * invDet,
    (m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[2] * m[8] * m[15] + m[2] * m[11] * m[12] + m[3] * m[8] * m[14] - m[3] * m[10] * m[12]) * invDet,
    -(m[0] * m[6] * m[15] - m[0] * m[7] * m[14] - m[2] * m[4] * m[15] + m[2] * m[7] * m[12] + m[3] * m[4] * m[14] - m[3] * m[6] * m[12]) * invDet,
    (m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[2] * m[4] * m[11] + m[2] * m[7] * m[8] + m[3] * m[4] * m[10] - m[3] * m[6] * m[8]) * invDet,
    (m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[5] * m[8] * m[15] + m[5] * m[11] * m[12] + m[7] * m[8] * m[13] - m[7] * m[9] * m[12]) * invDet,
    -(m[0] * m[9] * m[15] - m[0] * m[11] * m[13] - m[1] * m[8] * m[15] + m[1] * m[11] * m[12] + m[3] * m[8] * m[13] - m[3] * m[9] * m[12]) * invDet,
    (m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[1] * m[4] * m[15] + m[1] * m[7] * m[12] + m[3] * m[4] * m[13] - m[3] * m[5] * m[12]) * invDet,
    -(m[0] * m[5] * m[11] - m[0] * m[7] * m[9] - m[1] * m[4] * m[11] + m[1] * m[7] * m[8] + m[3] * m[4] * m[9] - m[3] * m[5] * m[8]) * invDet,
    -(m[4] * m[9] * m[14] - m[4] * m[10] * m[13] - m[5] * m[8] * m[14] + m[5] * m[10] * m[12] + m[6] * m[8] * m[13] - m[6] * m[9] * m[12]) * invDet,
    (m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[1] * m[8] * m[14] + m[1] * m[10] * m[12] + m[2] * m[8] * m[13] - m[2] * m[9] * m[12]) * invDet,
    -(m[0] * m[5] * m[14] - m[0] * m[6] * m[13] - m[1] * m[4] * m[14] + m[1] * m[6] * m[12] + m[2] * m[4] * m[13] - m[2] * m[5] * m[12]) * invDet,
    (m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[1] * m[4] * m[10] + m[1] * m[6] * m[8] + m[2] * m[4] * m[9] - m[2] * m[5] * m[8]) * invDet
  ];
}

/**
 * Create USD Skeleton from GLTF Skin
 */
function createSkeleton(
  skin: Skin,
  nodeMap: Map<Node, UsdNode>,
  rootPath: string,
  logger: Logger,
  omitRootJoint: boolean = false
): SkeletonData | null {
  let joints = skin.listJoints();

  if (joints.length === 0) {
    logger.warn('Skin has no joints, skipping');
    return null;
  }

  // If root joint should be omitted, remove it from the joints array
  // This ensures the skeleton matches the USDZ format that omits non-animated root joints
  if (omitRootJoint && joints.length > 1) {
    const rootJoint = joints[0];
    joints = joints.slice(1); // Remove root joint
    logger.info('Omitted root joint from skeleton', {
      omittedJointName: rootJoint.getName(),
      remainingJoints: joints.length,
      originalJointCount: joints.length + 1
    });
  }

  const skeletonName = sanitizeName(skin.getName() || 'Skeleton');
  const skelRootPath = `${rootPath}/${skeletonName}`;
  // Create SkelRoot as container
  const skelRootNode = new UsdNode(skelRootPath, 'SkelRoot');

  // Set kind = "component" metadata
  skelRootNode.setMetadata('kind', 'component');

  // Create Skeleton prim inside SkelRoot
  const skeletonPrimPath = `${skelRootPath}/${skeletonName}`;
  const skeletonPrimNode = new UsdNode(skeletonPrimPath, 'Skeleton');
  // Hide skeleton - it's only needed for animation data, not visual rendering
  // The mesh will still be visible and animated correctly
  skeletonPrimNode.setProperty('token visibility', 'invisible', 'token');

  // Note: Some USDZ files include customData with source application metadata
  // We omit it since we're converting from GLTF

  skelRootNode.addChild(skeletonPrimNode);

  // Build joint paths array using relative paths (e.g., "root", "root/body_joint")
  const jointPaths: string[] = []; // Absolute paths (for internal use)
  const jointRelativePaths: string[] = []; // Relative paths (for USD joints array)
  const jointNodes = new Map<Node, UsdNode>();
  const jointToParent = new Map<Node, Node | null>(); // Map joint to its parent joint

  logger.info(`Creating skeleton with ${joints.length} joints`, {
    skeletonName,
    skelRootPath
  });

  // First pass: collect all joints and find parent relationships
  for (let i = 0; i < joints.length; i++) {
    const joint = joints[i];
    const jointUsdNode = nodeMap.get(joint);
    if (!jointUsdNode) {
      logger.warn(`USD node not found for joint: ${joint.getName()}`, {
        jointIndex: i,
        jointName: joint.getName()
      });
      continue;
    }

    const jointPath = jointUsdNode.getPath();
    jointPaths.push(jointPath);
    jointNodes.set(joint, jointUsdNode);

    // Find parent joint (if any) - parent must also be in the joints list
    // GLTF-Transform doesn't have getParent(), so we find parent by checking which joint has this as a child
    let parentJoint: Node | null = null;
    for (const potentialParent of joints) {
      if (potentialParent === joint) continue;
      const children = potentialParent.listChildren();
      if (children.includes(joint)) {
        parentJoint = potentialParent;
        break;
      }
    }
    jointToParent.set(joint, parentJoint);

    logger.info(`Mapped GLTF joint ${i} to USD joint path`, {
      jointIndex: i,
      jointName: joint.getName(),
      jointPath,
      usdJointPath: jointPath
    });
  }

  if (jointPaths.length === 0) {
    logger.warn('No valid joints found for skeleton');
    return null;
  }

  // Second pass: build relative paths by traversing from root to each joint
  const buildRelativePath = (joint: Node): string => {
    const parentJoint = jointToParent.get(joint);
    if (!parentJoint) {
      // Root joint - use sanitized name
      return sanitizeName(joint.getName() || 'root');
    }
    // Recursive: build parent path, then append this joint's name
    const parentPath = buildRelativePath(parentJoint);
    const jointName = sanitizeName(joint.getName() || 'joint');
    return `${parentPath}/${jointName}`;
  };

  for (let i = 0; i < joints.length; i++) {
    const joint = joints[i];
    const relativePath = buildRelativePath(joint);
    jointRelativePaths.push(relativePath);
  }

  // Log joint order for debugging skeleton mapping issues
  logger.info(`Skeleton joint paths (GLTF order preserved):`, {
    jointCount: jointPaths.length,
    jointPaths: jointPaths.slice(0, 10).concat(jointPaths.length > 10 ? ['...'] : []),
    relativePaths: jointRelativePaths.slice(0, 10).concat(jointRelativePaths.length > 10 ? ['...'] : []),
    firstJointName: joints[0]?.getName(),
    lastJointName: joints[joints.length - 1]?.getName(),
    jointNames: joints.slice(0, 10).map(j => j.getName()).concat(joints.length > 10 ? ['...'] : [])
  });

  // Set joints array on Skeleton prim using relative paths
  const jointsArray = formatUsdQuotedArray(jointRelativePaths);
  skeletonPrimNode.setProperty(
    'uniform token[] joints',
    jointsArray,
    'raw'
  );

  // Get bind matrices (inverse bind matrices from GLTF)
  // GLTF stores inverse bind matrices, USD needs bind transforms
  // USD bindTransforms = inverse of GLTF inverseBindMatrices
  // Rest transforms are computed from joint node transforms in GLTF (rest pose)
  const bindMatricesAccessor = skin.getInverseBindMatrices();
  let bindTransforms: string[] = [];
  let restTransforms: string[] = [];

  logger.info('Processing bind transforms', {
    hasBindMatrices: !!bindMatricesAccessor,
    expectedMatrixCount: joints.length,
    expectedArrayLength: joints.length * 16
  });

  if (bindMatricesAccessor) {
    const bindMatricesArray = bindMatricesAccessor.getArray();
    const originalJointCount = skin.listJoints().length;
    const expectedArrayLength = originalJointCount * 16; // GLTF has bind matrices for all joints

    logger.info('Bind matrices array details', {
      hasArray: !!bindMatricesArray,
      arrayLength: bindMatricesArray?.length,
      expectedLength: expectedArrayLength,
      originalJointCount,
      skeletonJointCount: joints.length,
      matches: bindMatricesArray?.length === expectedArrayLength
    });

    if (bindMatricesArray && bindMatricesArray.length === expectedArrayLength) {
      // Compute bind transforms by inverting the inverse bind matrices
      // Compute rest transforms from joint hierarchy's rest pose transforms
      // If root joint was omitted, skip the first bind matrix (index 0)
      for (let i = 0; i < joints.length; i++) {
        const joint = joints[i];
        // Map skeleton joint index to GLTF bind matrix index
        // If root joint was omitted, skeleton joint 0 maps to GLTF bind matrix 1
        const gltfJointIndex = omitRootJoint ? i + 1 : i;
        const startIdx = gltfJointIndex * 16;
        const invMatrix = Array.from(bindMatricesArray).slice(startIdx, startIdx + 16);

        // Invert the inverse bind matrix to get the bind transform
        // GLTF stores inverse bind matrices, USD needs bind transforms (inverse of inverse bind matrices)
        const inv = invertMatrix4x4(invMatrix);

        // Convert to USD matrix format (row-major)
        const matrixStr = formatMatrix(inv);
        bindTransforms.push(matrixStr);

        // Compute rest transforms from the actual joint node transform in GLTF
        // This gives us the rest pose where the joint is when not animated
        // The joint node's transform represents its rest pose position
        const jointTransform = joint.getMatrix();
        if (jointTransform) {
          // Use the joint's actual transform from the GLTF hierarchy as the rest transform
          // This represents where the joint is in its rest pose
          const restMatrixStr = formatMatrix(jointTransform);
          restTransforms.push(restMatrixStr);
        } else {
          // If joint has no transform, use the bind transform (identity)
          restTransforms.push(matrixStr);
        }

        // Log first few matrices for debugging
        if (i < 3) {
          logger.info(`Bind and rest transform ${i}`, {
            jointIndex: i,
            jointName: joints[i].getName(),
            bindMatrix: matrixStr.substring(0, 80) + '...',
            restMatrix: restTransforms[i].substring(0, 80) + '...',
            hasJointTransform: !!jointTransform,
            originalInvMatrix: `[${invMatrix.slice(0, 4).map(v => v.toFixed(4)).join(', ')}, ...]`
          });
        }
      }

      logger.info(`Processed ${bindTransforms.length} bind transforms`, {
        bindTransformCount: bindTransforms.length,
        restTransformCount: restTransforms.length
      });
    } else {
      logger.warn('Bind matrices array length mismatch', {
        expected: joints.length * 16,
        actual: bindMatricesArray?.length
      });
    }
  }

  // If no bind matrices, use identity for bind transforms, identity for rest transforms
  if (bindTransforms.length === 0) {
    logger.warn('No bind matrices found, using identity transforms', {
      jointCount: joints.length
    });
    for (let i = 0; i < joints.length; i++) {
      bindTransforms.push(IDENTITY_MATRIX);
      restTransforms.push(IDENTITY_MATRIX);
    }
  }

  skeletonPrimNode.setProperty(
    'uniform matrix4d[] bindTransforms',
    formatUsdArray(bindTransforms),
    'raw'
  );

  skeletonPrimNode.setProperty(
    'uniform matrix4d[] restTransforms',
    formatUsdArray(restTransforms),
    'raw'
  );

  // Extract rest pose translations from rest transforms for use as default animation values
  // When a joint doesn't have translation animation data, we use its rest pose translation instead of (0, 0, 0)
  // Extract translations directly from joint transforms before converting to string format
  const restPoseTranslations: string[] = [];
  for (let i = 0; i < joints.length; i++) {
    const joint = joints[i];
    const jointTransform = joint.getMatrix();
    if (jointTransform) {
      // GLTF matrices are column-major: [m00, m10, m20, m30, m01, m11, m21, m31, m02, m12, m22, m32, m03, m13, m23, m33]
      // Translation is at indices 12, 13, 14 (m03, m13, m23)
      const tx = jointTransform[12];
      const ty = jointTransform[13];
      const tz = jointTransform[14];
      restPoseTranslations.push(`(${tx}, ${ty}, ${tz})`);
    } else {
      // If joint has no transform, use (0, 0, 0)
      restPoseTranslations.push('(0, 0, 0)');
    }
  }

  logger.info('Skeleton created successfully', {
    skeletonName,
    jointCount: jointPaths.length,
    bindTransformCount: bindTransforms.length,
    restTransformCount: restTransforms.length,
    restPoseTranslationCount: restPoseTranslations.length,
    firstRestPoseTranslation: restPoseTranslations[0],
    secondRestPoseTranslation: restPoseTranslations[1],
    thirdRestPoseTranslation: restPoseTranslations[2],
    skelRootPath,
    skeletonPrimPath
  });

  return {
    skin,
    skelRootNode,
    skeletonPrimNode,
    jointNodes,
    jointPaths, // Absolute paths (for internal use)
    jointRelativePaths, // Relative paths (for USD joints array)
    restTransforms, // Store rest transforms for animation comparison
    restPoseTranslations, // Store rest pose translations for default animation values
    rootJointOmitted: omitRootJoint // Track if root joint was omitted
  };
}

/**
 * Find the parent of a node in the tree
 */
function findParentInTree(root: UsdNode, target: UsdNode): UsdNode | null {
  for (const child of root.getChildren()) {
    if (child === target) {
      return root;
    }
    const found = findParentInTree(child, target);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Bind skeleton to mesh node
 * Mesh must have SkelBindingAPI when it has skeleton primvars
 * Mesh must be under a SkelRoot to have SkelBindingAPI
 */
export function bindSkeletonToMesh(
  meshNode: UsdNode,
  skelRootPath: string,
  jointIndices: number[],
  jointWeights: number[],
  skelRootNode: UsdNode,
  skeletonPrimNode: UsdNode,
  logger: Logger,
  originalParent?: UsdNode,
  sceneRoot?: UsdNode,
  skeletonJointCount?: number
): void {
  const meshName = meshNode.getName();
  const skeletonPrimPath = skeletonPrimNode.getPath();

  logger.info('Binding skeleton to mesh', {
    meshName,
    meshPath: meshNode.getPath(),
    skeletonPrimPath,
    skelRootPath,
    jointIndexCount: jointIndices.length,
    jointWeightCount: jointWeights.length
  });

  // Log joint indices statistics
  if (jointIndices.length > 0) {
    const minIndex = Math.min(...jointIndices);
    const maxIndex = Math.max(...jointIndices);
    const uniqueIndices = new Set(jointIndices).size;

    // Get skeleton joint count (from parameter or skeleton prim)
    let skeletonJointCountValue = skeletonJointCount || 0;
    if (!skeletonJointCountValue) {
      // Try to get from skeleton prim property
      const skeletonJoints = skeletonPrimNode.getProperty('uniform token[] joints');
      if (Array.isArray(skeletonJoints)) {
        skeletonJointCountValue = skeletonJoints.length;
      } else {
        // Try to parse from raw string format
        const jointsStr = skeletonPrimNode.getProperty('uniform token[] joints') as string | undefined;
        if (typeof jointsStr === 'string') {
          // Count joints by counting "..." patterns in the string
          const matches = jointsStr.match(/"/g);
          skeletonJointCountValue = matches ? matches.length / 2 : 0;
        }
      }
    }

    logger.info('Joint indices statistics', {
      minIndex,
      maxIndex,
      uniqueIndices,
      totalIndices: jointIndices.length,
      skeletonJointCount: skeletonJointCountValue,
      indicesValid: minIndex >= 0 && maxIndex < skeletonJointCountValue,
      first10Indices: jointIndices.slice(0, 10)
    });

    // Validate indices are within skeleton bounds
    if (skeletonJointCountValue > 0 && maxIndex >= skeletonJointCountValue) {
      logger.error('Joint indices out of bounds!', {
        maxIndex,
        skeletonJointCount: skeletonJointCountValue,
        invalidIndices: jointIndices.filter(idx => idx >= skeletonJointCountValue).slice(0, 10)
      });
    }
  }

  // Log joint weights statistics
  if (jointWeights.length > 0) {
    const minWeight = Math.min(...jointWeights);
    const maxWeight = Math.max(...jointWeights);
    const sumWeights = jointWeights.reduce((a, b) => a + b, 0);
    logger.info('Joint weights statistics', {
      minWeight,
      maxWeight,
      averageWeight: sumWeights / jointWeights.length,
      totalWeights: jointWeights.length,
      first10Weights: jointWeights.slice(0, 10).map(w => w.toFixed(4))
    });
  }

  // Add SkelBindingAPI to mesh (required when it has skeleton primvars)
  const wasAdded = ApiSchemaBuilder.addApiSchema(meshNode, API_SCHEMAS.SKEL_BINDING);
  if (wasAdded) {
    logger.info('Added SkelBindingAPI to mesh', { meshName });
  }

  // Set skeleton relationship - point to Skeleton prim inside SkelRoot, not the SkelRoot itself
  meshNode.setProperty('rel skel:skeleton', `<${skeletonPrimPath}>`, 'rel');
  logger.info('Set skel:skeleton relationship', {
    meshName,
    skeletonPrimPath
  });

  // Set geomBindTransform - this is where the mesh was positioned when we bound it to the skeleton
  // For meshes that sit directly under SkelRoot, we usually use identity
  // If the mesh already has a transform, we use that instead
  // USD Skel needs this to know how to properly deform the mesh when joints move
  const meshTransform = meshNode.getProperty('xformOp:transform');
  let geomBindTransform: string;
  if (meshTransform && typeof meshTransform === 'string') {
    // Use mesh's existing transform as bind transform
    geomBindTransform = meshTransform;
    logger.info('Using mesh transform as geomBindTransform', {
      meshName,
      meshTransform
    });
  } else {
    // Default to identity for meshes directly under SkelRoot
    geomBindTransform = IDENTITY_MATRIX;
    logger.info('Using identity as geomBindTransform (mesh has no transform)', {
      meshName
    });
  }
  meshNode.setProperty('skel:geomBindTransform', geomBindTransform, 'raw');
  logger.info('Set skel:geomBindTransform', {
    meshName,
    geomBindTransform
  });

  // Set joint indices (which joints influence each vertex)
  if (jointIndices.length > 0) {
    const indicesStr = formatUsdNumberArray(jointIndices);
    meshNode.setProperty('int[] primvars:skel:jointIndices', indicesStr, 'raw');

    // Set interpolation to "vertex" so USD knows these values apply per vertex
    // Without this, USD won't know how to apply the joint indices
    meshNode.setProperty('uniform token primvars:skel:jointIndices:interpolation', 'vertex', 'interpolation');
    // Set elementSize so USD knows how many joint index values each vertex has
    // USD needs this to correctly parse the joint indices array
    meshNode.setProperty('int primvars:skel:jointIndices:elementSize', SKELETON.ELEMENT_SIZE, 'elementSize');

    logger.info('Set joint indices', {
      meshName,
      indexCount: jointIndices.length,
      sampleIndices: jointIndices.slice(0, 20)
    });
  } else {
    logger.warn('No joint indices provided', { meshName });
  }

  // Set joint weights - these control how much each joint affects each vertex
  // We normalize weights so each vertex's weights add up to 1.0
  // USD Skel needs normalized weights to deform the mesh properly
  if (jointWeights.length > 0) {
    // Normalize weights per vertex
    // This ensures each vertex's weights sum to 1.0 for proper skinning
    const normalizedWeights: number[] = [];
    const weightsPerVertex = SKELETON.JOINTS_PER_VERTEX;

    for (let i = 0; i < jointWeights.length; i += weightsPerVertex) {
      const vertexWeights = jointWeights.slice(i, i + weightsPerVertex);
      const weightSum = vertexWeights.reduce((sum, w) => sum + w, 0);

      // Normalize weights to sum to 1.0
      // If sum is 0 or very small, use equal weights to avoid division by zero
      if (weightSum > 1e-6) {
        for (let j = 0; j < vertexWeights.length; j++) {
          normalizedWeights.push(vertexWeights[j] / weightSum);
        }
      } else {
        // If weights are all zero or very small, use equal weights
        const equalWeight = 1.0 / vertexWeights.length;
        for (let j = 0; j < vertexWeights.length; j++) {
          normalizedWeights.push(equalWeight);
        }
      }
    }

    const weightsStr = formatUsdNumberArrayFixed(normalizedWeights, 6);
    meshNode.setProperty('float[] primvars:skel:jointWeights', weightsStr, 'raw');

    // Set interpolation to "vertex" so USD knows these values apply per vertex
    // Without this, USD won't know how to apply the joint weights
    meshNode.setProperty('uniform token primvars:skel:jointWeights:interpolation', 'vertex', 'interpolation');
    // Set elementSize so USD knows how many joint weight values each vertex has
    // USD needs this to correctly parse the joint weights array
    meshNode.setProperty('int primvars:skel:jointWeights:elementSize', SKELETON.ELEMENT_SIZE, 'elementSize');

    logger.info('Set joint weights with normalization', {
      meshName,
      originalWeightCount: jointWeights.length,
      normalizedWeightCount: normalizedWeights.length,
      weightsPerVertex,
      sampleOriginalWeights: jointWeights.slice(0, 8).map(w => w.toFixed(4)),
      sampleNormalizedWeights: normalizedWeights.slice(0, 8).map(w => w.toFixed(4)),
      firstVertexWeightSum: jointWeights.slice(0, 4).reduce((sum, w) => sum + w, 0).toFixed(4),
      firstVertexNormalizedSum: normalizedWeights.slice(0, 4).reduce((sum, w) => sum + w, 0).toFixed(4)
    });
  } else {
    logger.warn('No joint weights provided', { meshName });
  }

  // Find the actual parent of the mesh node
  let actualParent: UsdNode | null = null;

  // First, check if originalParent actually contains this mesh
  if (originalParent) {
    let found = false;
    for (const child of originalParent.getChildren()) {
      if (child === meshNode) {
        found = true;
        break;
      }
    }
    if (found) {
      actualParent = originalParent;
    }
  }

  // If we couldn't find it in originalParent, search from scene root
  if (!actualParent && sceneRoot) {
    actualParent = findParentInTree(sceneRoot, meshNode);
  }

  // Remove mesh from its actual parent
  if (actualParent) {
    actualParent.removeChild(meshNode);
    logger.info(`Removed mesh ${meshNode.getName()} from parent ${actualParent.getName()}`);
  } else if (originalParent) {
    // Try to remove even if we're not sure it's the right parent
    originalParent.removeChild(meshNode);
    logger.info(`Attempted to remove mesh ${meshNode.getName()} from parent ${originalParent.getName()}`);
  }

  // Update mesh path to be under SkelRoot (required for SkelBindingAPI to be valid)
  const newMeshPath = `${skelRootPath}/${meshName}`;
  meshNode.updatePath(newMeshPath);

  // Move mesh under SkelRoot
  skelRootNode.addChild(meshNode);

  // Log final mesh binding state for verification
  const finalMeshPath = meshNode.getPath();
  const finalSkeletonRel = meshNode.getProperty('rel skel:skeleton');
  const finalGeomBindTransform = meshNode.getProperty('skel:geomBindTransform');
  const finalJointIndices = meshNode.getProperty('int[] primvars:skel:jointIndices');
  const finalJointWeights = meshNode.getProperty('float[] primvars:skel:jointWeights');

  // Get skeleton animation source to verify sync
  const skeletonAnimSource = skeletonPrimNode.getProperty('rel skel:animationSource');
  const skelRootAnimSource = skelRootNode.getProperty('rel skel:animationSource');

  logger.info(`Mesh binding complete: ${finalMeshPath}`, {
    meshName,
    meshPath: finalMeshPath,
    skelRootPath,
    skeletonPrimPath,
    hasSkelBindingAPI: ApiSchemaBuilder.hasApiSchema(meshNode, API_SCHEMAS.SKEL_BINDING),
    skelSkeletonRelationship: finalSkeletonRel,
    hasGeomBindTransform: !!finalGeomBindTransform,
    geomBindTransform: finalGeomBindTransform,
    hasJointIndices: !!finalJointIndices,
    jointIndicesCount: typeof finalJointIndices === 'string' ? (finalJointIndices.match(/\d+/g) || []).length : 0,
    hasJointWeights: !!finalJointWeights,
    jointWeightsCount: typeof finalJointWeights === 'string' ? (finalJointWeights.match(/[\d.]+/g) || []).length : 0,
    meshParent: skelRootNode.getName(),
    meshParentPath: skelRootNode.getPath(),
    // Verify skeleton and mesh are using the same animation source
    skeletonAnimationSource: skeletonAnimSource,
    skelRootAnimationSource: skelRootAnimSource,
    animationSyncVerified: skeletonAnimSource === skelRootAnimSource ||
      (Array.isArray(skelRootAnimSource) && skelRootAnimSource.length > 0 && skelRootAnimSource[0] === skeletonAnimSource)
  });

  logger.info(`Bound skeleton to mesh: ${newMeshPath}`);
}
