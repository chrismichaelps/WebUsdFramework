/**
 * GLTF-Transform Converter
 * 
 * Converts GLB/GLTF to USDZ format.
 * Uses external geometry files and handles materials/textures.
 */

import { Document, Node } from '@gltf-transform/core';
import { GltfTransformConfig } from '../schemas';
import { Logger, LoggerFactory, ApiSchemaBuilder, API_SCHEMAS, normalizePropertyToArray, getFirstPropertyValue, sanitizeName } from '../utils';
import { UsdNode } from '../core/usd-node';
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
import { processAnimations, setAnimatedExtentOnSkelRoots, setAnimatedExtentOnAllSkelRoots } from './helpers/animation-processor';
import {
  writeDebugOutput,
  DebugOutputContent
} from './helpers/debug-writer';
import { calculateSceneExtent } from './helpers/usd-hierarchy-builder';
import { processSkeletons, bindSkeletonToMesh } from './helpers/skeleton-processor';
import { formatUsdTuple3 } from '../utils/usd-formatter';
import { processXMPExtension, formatXMPForUSD } from './extensions/xmp-processor';
import { preprocessGltfDocument } from './helpers/gltf-transform-helpers';

/**
 * Conversion Stage Names
 */
const CONVERSION_STAGES = {
  START: 'conversion_start',
  PARSING: 'glb_parsing',
  GEOMETRY: 'geometry_generation',
  MATERIALS: 'material_generation',
  ANIMATIONS: 'animation_generation',
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
    let document = await parseGltfOrGlbDocument(input, logger);

    // Apply preprocessing transforms if configured
    if (config?.preprocess) {
      logger.info('Applying GLTF preprocessing transforms', {
        stage: CONVERSION_STAGES.PARSING,
        options: config.preprocess
      });
      document = await preprocessGltfDocument(document, config.preprocess, logger);
    }

    // Process XMP metadata from document root
    const xmpMetadata = processXMPExtension(document);
    if (xmpMetadata) {
      logger.info('Detected XMP metadata in GLTF document', {
        contextCount: Object.keys(xmpMetadata.context).length,
        propertyCount: Object.keys(xmpMetadata.properties).length
      });
    }

    // Create USD root structure
    const root = document.getRoot();
    const scene = root.listScenes()[CONVERSION_CONSTANTS.FIRST_SCENE_INDEX];
    const sceneName = scene.getName();
    const rootStructure = createRootStructure(sceneName);

    // Add XMP metadata to root node customLayerData if present
    if (xmpMetadata) {
      const xmpUsdData = formatXMPForUSD(xmpMetadata);
      const existingCustomData = rootStructure.rootNode.getProperty('customLayerData') as Record<string, unknown> | undefined;
      const customLayerData = existingCustomData || {};
      Object.assign(customLayerData, xmpUsdData);
      // Note: customLayerData is set in serializeToUsda, so we'll store it as metadata
      rootStructure.rootNode.setMetadata('xmpMetadata', xmpUsdData);
    }

    // Process geometries using embedded approach for optimal USDZ compatibility
    // Geometry data is embedded directly in the main USD file instead of separate files
    // This ensures proper rendering across different USD viewers and platforms
    const geometryResult = processGeometries(root.listMeshes());

    logger.info(`Processed ${geometryResult.geometryCounter} geometries (embedded approach)`, {
      stage: CONVERSION_STAGES.GEOMETRY
    });

    // Build scene hierarchy and materials
    const hierarchyContext: HierarchyBuilderContext = {
      primitiveMetadata: geometryResult.primitiveMetadata,
      materialMap: new Map(),
      textureFiles: new Map(),
      materialsNode: rootStructure.materialsNode,
      materialCounter: CONVERSION_CONSTANTS.INITIAL_COUNTER,
      document,
      nodeMap: new Map<Node, UsdNode>()
    };

    for (const childNode of scene.listChildren()) {
      hierarchyContext.materialCounter = await buildNodeHierarchy(
        childNode,
        rootStructure.sceneNode,
        hierarchyContext
      );
    }

    // Add materials to root level for proper USDZ structure
    rootStructure.rootNode.addChild(rootStructure.materialsNode);

    logger.info(
      `Generated ${hierarchyContext.materialCounter} materials with ${hierarchyContext.textureFiles.size} textures`,
      { stage: CONVERSION_STAGES.MATERIALS }
    );

    // Process skeletons (after node map is populated)
    logger.info('Processing skeletons', {
      stage: CONVERSION_STAGES.ANIMATIONS
    });
    const skeletonMap = processSkeletons(
      document,
      hierarchyContext.nodeMap,
      rootStructure.sceneNode.getPath(),
      logger
    );

    // Bind meshes to skeletons
    if (skeletonMap.size > 0) {
      const root = document.getRoot();
      const allNodes = new Set<Node>();
      // Collect all nodes with meshes
      for (const node of root.listNodes()) {
        if (node.getMesh() && node.getSkin()) {
          allNodes.add(node);
        }
      }

      // Bind each mesh to its skeleton
      for (const node of allNodes) {
        const skin = node.getSkin();
        const skeletonData = skin ? skeletonMap.get(skin) : null;
        if (skeletonData) {
          const usdNode = hierarchyContext.nodeMap.get(node);
          if (usdNode) {
            const mesh = node.getMesh();
            if (mesh) {
              const primitives = mesh.listPrimitives();
              if (primitives.length > 0) {
                const primitive = primitives[0];
                const jointIndices = primitive.getAttribute('JOINTS_0')?.getArray();
                const jointWeights = primitive.getAttribute('WEIGHTS_0')?.getArray();

                logger.info('Extracting joint data from mesh primitive', {
                  nodeName: node.getName(),
                  meshName: mesh.getName(),
                  primitiveCount: primitives.length,
                  hasJOINTS_0: !!jointIndices,
                  hasWEIGHTS_0: !!jointWeights,
                  jointIndicesType: jointIndices?.constructor?.name,
                  jointWeightsType: jointWeights?.constructor?.name
                });

                let indicesArray: number[] = [];
                let weightsArray: number[] = [];

                if (jointIndices) {
                  if (jointIndices instanceof Uint8Array || jointIndices instanceof Uint16Array) {
                    indicesArray = Array.from(jointIndices);
                    logger.info('Converted joint indices from typed array', {
                      originalType: jointIndices.constructor.name,
                      length: indicesArray.length,
                      sampleIndices: indicesArray.slice(0, 20)
                    });
                  } else if (Array.isArray(jointIndices)) {
                    indicesArray = jointIndices;
                    logger.info('Using joint indices as array', {
                      length: indicesArray.length,
                      sampleIndices: indicesArray.slice(0, 20)
                    });
                  }
                } else {
                  logger.warn('No JOINTS_0 attribute found on primitive', {
                    nodeName: node.getName(),
                    meshName: mesh.getName()
                  });
                }

                if (jointWeights) {
                  if (jointWeights instanceof Float32Array) {
                    weightsArray = Array.from(jointWeights);
                    logger.info('Converted joint weights from Float32Array', {
                      length: weightsArray.length,
                      sampleWeights: weightsArray.slice(0, 20).map(w => w.toFixed(4))
                    });
                  } else if (Array.isArray(jointWeights)) {
                    weightsArray = jointWeights;
                    logger.info('Using joint weights as array', {
                      length: weightsArray.length,
                      sampleWeights: weightsArray.slice(0, 20).map(w => w.toFixed(4))
                    });
                  }
                } else {
                  logger.warn('No WEIGHTS_0 attribute found on primitive', {
                    nodeName: node.getName(),
                    meshName: mesh.getName()
                  });
                }

                // Verify indices match weights (should be same length)
                if (indicesArray.length !== weightsArray.length) {
                  logger.warn('Joint indices and weights length mismatch', {
                    indicesLength: indicesArray.length,
                    weightsLength: weightsArray.length,
                    nodeName: node.getName()
                  });
                }

                // In GLTF, JOINTS_0 contains indices into skin.joints array (skeleton joint indices)
                // These should already be 0-based indices into the skeleton joints array
                // Our USD skeleton joints array is in the same order as skin.joints, so indices should match
                // However, we verify and ensure they're within valid range
                if (!skin) {
                  logger.error('Skin is null, cannot remap joint indices', {
                    nodeName: node.getName()
                  });
                  continue;
                }

                const skeletonJointCount = skeletonData.jointPaths.length; // Use actual USD skeleton joint count
                const rootJointOmitted = skeletonData.rootJointOmitted || false;

                // If root joint was omitted from skeleton, adjust joint indices
                // GLTF joint indices are 0-based into skin.joints array
                // If root joint (index 0) was omitted, we need to subtract 1 from all indices >= 1
                // Index 0 in GLTF should be mapped to -1 (invalid) or clamped to 0, but since root joint
                // is omitted, vertices using root joint (index 0) should be remapped to use the next joint
                let rootJointRemappingLogged = false;
                const remappedIndices = indicesArray.map((jointIndex: number) => {
                  let adjustedIndex = jointIndex;

                  // If root joint was omitted, adjust indices
                  if (rootJointOmitted) {
                    if (jointIndex === 0) {
                      // Root joint (index 0) was omitted, map to first available joint (index 0 in USD skeleton)
                      // This is the second joint in GLTF (hips_JNT_01)
                      adjustedIndex = 0;
                      // Log only once per mesh to avoid spam
                      if (!rootJointRemappingLogged) {
                        logger.info('Root joint omitted from skeleton, remapping joint index 0 to first skeleton joint', {
                          nodeName: node.getName(),
                          meshName: mesh.getName(),
                          skeletonJointCount,
                          affectedVertices: indicesArray.filter(idx => idx === 0).length
                        });
                        rootJointRemappingLogged = true;
                      }
                    } else if (jointIndex > 0) {
                      // All other joints need to be shifted down by 1
                      adjustedIndex = jointIndex - 1;
                    }
                  }

                  // Clamp to valid range [0, skeletonJointCount - 1]
                  if (adjustedIndex < 0 || adjustedIndex >= skeletonJointCount) {
                    logger.warn('Joint index out of range, clamping', {
                      originalIndex: jointIndex,
                      adjustedIndex,
                      skeletonJointCount,
                      clampedIndex: Math.max(0, Math.min(adjustedIndex, skeletonJointCount - 1))
                    });
                    return Math.max(0, Math.min(adjustedIndex, skeletonJointCount - 1));
                  }
                  return adjustedIndex;
                });

                logger.info('Validated joint indices for USD skeleton', {
                  originalIndicesSample: indicesArray.slice(0, 10),
                  validatedIndicesSample: remappedIndices.slice(0, 10),
                  minOriginal: Math.min(...indicesArray),
                  maxOriginal: Math.max(...indicesArray),
                  minValidated: Math.min(...remappedIndices),
                  maxValidated: Math.max(...remappedIndices),
                  skeletonJointCount
                });

                // Get the mesh node (first child or the node itself)
                const meshNode = usdNode.getChildren().next().value || usdNode;
                const originalParent = meshNode !== usdNode ? usdNode : undefined;

                logger.info('Binding mesh to skeleton', {
                  meshNodeName: meshNode.getName(),
                  meshNodePath: meshNode.getPath(),
                  originalParent: originalParent?.getName(),
                  skeletonPath: skeletonData.skelRootNode.getPath(),
                  indicesCount: remappedIndices.length,
                  weightsCount: weightsArray.length
                });

                bindSkeletonToMesh(
                  meshNode,
                  skeletonData.skelRootNode.getPath(),
                  remappedIndices,
                  weightsArray,
                  skeletonData.skelRootNode,
                  skeletonData.skeletonPrimNode,
                  logger,
                  originalParent,
                  rootStructure.sceneNode,
                  skeletonData.jointPaths.length // Pass joint count for validation
                );
              } else {
                logger.warn('Mesh has no primitives', {
                  nodeName: node.getName(),
                  meshName: mesh.getName()
                });
              }
            }
          }
        }
      }
    }

    // Process animations to determine if SkelRoot should be top-level
    logger.info('Processing animations', {
      stage: CONVERSION_STAGES.ANIMATIONS
    });
    const animationTimeCode = processAnimations(
      document,
      hierarchyContext.nodeMap,
      logger,
      skeletonMap.size > 0 ? skeletonMap : undefined
    );

    // Move animated SkelRoots to top-level for defaultPrim compatibility
    if (skeletonMap.size > 0) {
      const hasSkeletonAnimations = animationTimeCode !== null && skeletonMap.size > 0;

      // Track used top-level prim names to avoid duplicates
      const usedTopLevelNames = new Set<string>();
      usedTopLevelNames.add('Root'); // Root is always at top level

      for (const [, skeletonData] of skeletonMap) {
        if (hasSkeletonAnimations) {
          // Move SkelRoot to top-level (sibling of Root) for defaultPrim compatibility
          let skelRootName = skeletonData.skelRootNode.getName();
          const oldSkelRootPath = skeletonData.skelRootNode.getPath();

          skelRootName = sanitizeName(skelRootName);

          // Ensure unique name for top-level prim
          let uniqueName = skelRootName;
          let suffix = 1;
          while (usedTopLevelNames.has(uniqueName)) {
            uniqueName = sanitizeName(`${skelRootName}_${suffix}`);
            suffix++;
          }
          usedTopLevelNames.add(uniqueName);

          if (uniqueName !== skelRootName) {
            const oldName = skelRootName;
            skelRootName = uniqueName;
            logger.info(`Renamed SkelRoot to ensure unique top-level prim name`, {
              oldName,
              newName: uniqueName
            });
          }

          const newSkelRootPath = `/${skelRootName}`;

          // Update all children paths before updating SkelRoot
          const updateChildPaths = (node: UsdNode, oldParentPath: string, newParentPath: string) => {
            const oldPath = node.getPath();
            if (oldPath.startsWith(oldParentPath + '/')) {
              const relativePath = oldPath.substring(oldParentPath.length);
              const newPath = newParentPath + relativePath;
              node.updatePath(newPath);

              // Recursively update children
              for (const child of node.getChildren()) {
                updateChildPaths(child, oldPath, newPath);
              }
            }
          };

          const oldSkeletonPrimPath = skeletonData.skeletonPrimNode.getPath();

          for (const child of skeletonData.skelRootNode.getChildren()) {
            updateChildPaths(child, oldSkelRootPath, newSkelRootPath);
          }

          const newSkeletonPrimPath = skeletonData.skeletonPrimNode.getPath();
          skeletonData.skelRootNode.updatePath(newSkelRootPath);

          // Update mesh bindings to reference new Skeleton prim path
          const meshChildren = Array.from(skeletonData.skelRootNode.getChildren()).filter(
            child => child.getTypeName() === 'Mesh'
          );
          for (const mesh of meshChildren) {
            const skelSkeleton = mesh.getProperty('rel skel:skeleton');
            if (skelSkeleton) {
              const newSkeletonRel = `<${newSkeletonPrimPath}>`;
              mesh.setProperty('rel skel:skeleton', newSkeletonRel, 'rel');
              logger.info('Updated mesh skeleton binding after SkelRoot move', {
                meshName: mesh.getName(),
                oldSkeletonPath: oldSkeletonPrimPath,
                newSkeletonPath: newSkeletonPrimPath
              });
            }
          }

          // Update animation source relationships to new paths
          const skelRootAnimationSource = skeletonData.skelRootNode.getProperty('rel skel:animationSource');
          if (skelRootAnimationSource) {
            const oldAnimPath = typeof skelRootAnimationSource === 'string'
              ? skelRootAnimationSource.replace(/[<>]/g, '')
              : Array.isArray(skelRootAnimationSource)
                ? skelRootAnimationSource[0]?.replace(/[<>]/g, '') || ''
                : '';

            if (oldAnimPath) {
              let newAnimPath = oldAnimPath;
              if (oldSkeletonPrimPath && oldAnimPath.startsWith(oldSkeletonPrimPath)) {
                const relativePath = oldAnimPath.substring(oldSkeletonPrimPath.length);
                newAnimPath = newSkeletonPrimPath + relativePath;
              } else if (oldAnimPath.startsWith(oldSkelRootPath)) {
                const relativePath = oldAnimPath.substring(oldSkelRootPath.length);
                newAnimPath = newSkelRootPath + relativePath;
              }

              skeletonData.skelRootNode.setProperty('rel skel:animationSource', `<${newAnimPath}>`, 'rel');
              logger.info('Updated SkelRoot animation source after move', {
                oldPath: oldAnimPath,
                newPath: newAnimPath
              });
            }
          }

          // Update rel skel:animationSource on Skeleton prim
          if (skeletonData.skeletonPrimNode) {
            const skeletonPrimAnimationSource = skeletonData.skeletonPrimNode.getProperty('rel skel:animationSource');
            if (skeletonPrimAnimationSource) {
              const oldAnimPath = typeof skeletonPrimAnimationSource === 'string'
                ? skeletonPrimAnimationSource.replace(/[<>]/g, '')
                : Array.isArray(skeletonPrimAnimationSource)
                  ? skeletonPrimAnimationSource[0]?.replace(/[<>]/g, '') || ''
                  : '';

              if (oldAnimPath) {
                let newAnimPath = oldAnimPath;
                if (oldSkeletonPrimPath && oldAnimPath.startsWith(oldSkeletonPrimPath)) {
                  const relativePath = oldAnimPath.substring(oldSkeletonPrimPath.length);
                  newAnimPath = newSkeletonPrimPath + relativePath;
                } else if (oldAnimPath.startsWith(oldSkelRootPath)) {
                  const relativePath = oldAnimPath.substring(oldSkelRootPath.length);
                  newAnimPath = newSkelRootPath + relativePath;
                }

                skeletonData.skeletonPrimNode.setProperty('rel skel:animationSource', `<${newAnimPath}>`, 'rel');
                logger.info('Updated Skeleton prim animation source after move', {
                  oldPath: oldAnimPath,
                  newPath: newAnimPath
                });
              }
            }
          }

          // Store as top-level prim (sibling of Root)
          if (!rootStructure.topLevelPrims) {
            rootStructure.topLevelPrims = [];
          }
          rootStructure.topLevelPrims.push(skeletonData.skelRootNode);
          logger.info(`Added animated skeleton ${skelRootName} as top-level prim`, {
            oldPath: oldSkelRootPath,
            newPath: newSkelRootPath,
            oldSkeletonPrimPath,
            newSkeletonPrimPath
          });
        } else {
          // For non-animated skeletons, keep nested under scene
          rootStructure.sceneNode.addChild(skeletonData.skelRootNode);
          logger.info(`Added skeleton ${skeletonData.skelRootNode.getName()} to scene`);
        }
      }
    }

    // Verify mesh-skeleton synchronization after animations are processed
    if (skeletonMap.size > 0) {
      // Verify each mesh is properly bound to its animated skeleton
      for (const [, skeletonData] of skeletonMap) {
        const skelRootNode = skeletonData.skelRootNode;
        const skelRootChildren = Array.from(skelRootNode.getChildren());
        const meshChildren = skelRootChildren.filter(child => {
          const childType = child.getTypeName();
          return childType === 'Mesh';
        });

        // Get animation source from skeleton
        const skelRootAnimationSource = skelRootNode.getProperty('rel skel:animationSource');
        const skeletonPrimAnimationSource = skeletonData.skeletonPrimNode?.getProperty('rel skel:animationSource');
        const primaryAnimationSource = getFirstPropertyValue(skeletonPrimAnimationSource) || getFirstPropertyValue(skelRootAnimationSource);

        // Verify each mesh is bound and synchronized
        for (const mesh of meshChildren) {
          const meshPath = mesh.getPath();
          const skelSkeleton = mesh.getProperty('rel skel:skeleton');
          const skeletonPrimPath = skeletonData.skeletonPrimNode?.getPath();

          // Verify mesh is bound to the same skeleton that has animation
          const meshSkeletonPath = typeof skelSkeleton === 'string' ? skelSkeleton : (Array.isArray(skelSkeleton) ? skelSkeleton[0] : undefined);
          const isBoundToAnimatedSkeleton = meshSkeletonPath && skeletonPrimPath &&
            (meshSkeletonPath === skeletonPrimPath || meshSkeletonPath.includes(skeletonPrimPath));

          // Check if skeleton has animation
          const hasAnimationOnSkeleton = !!primaryAnimationSource;

          // Verify mesh binding status
          const isMeshBound = !!skelSkeleton && isBoundToAnimatedSkeleton;

          if (!isMeshBound) {
            // Mesh is not properly bound to skeleton - this is a real issue
            logger.warn(`Mesh not bound to skeleton: ${meshPath}`, {
              meshName: mesh.getName(),
              meshPath,
              skeletonPrimPath,
              skelSkeleton,
              isBound: false,
              warning: 'Mesh must be bound to skeleton for proper deformation'
            });
          } else if (hasAnimationOnSkeleton) {
            // Mesh is bound and skeleton has animation - verify synchronization
            logger.info(`Mesh-skeleton synchronization verified: ${meshPath}`, {
              meshName: mesh.getName(),
              meshPath,
              skeletonPrimPath,
              animationSource: primaryAnimationSource,
              isBound: true,
              hasAnimation: true,
              syncVerified: true
            });
          } else {
            // Mesh is bound but skeleton has no animation - this is valid (static skeleton)
            logger.info(`Mesh bound to static skeleton: ${meshPath}`, {
              meshName: mesh.getName(),
              meshPath,
              skeletonPrimPath,
              isBound: true,
              hasAnimation: false,
              note: 'Skeleton has no animation, mesh will use bind pose'
            });
          }
        }
      }

      // Log final skeleton-mesh binding state after animations are processed
      logger.info('Final skeleton-mesh binding summary', {
        skeletonCount: skeletonMap.size,
        skeletons: Array.from(skeletonMap.values()).map((skeletonData) => {
          const skelRootNode = skeletonData.skelRootNode;
          const skelRootPath = skelRootNode.getPath();
          const skeletonPrimNode = skeletonData.skeletonPrimNode;
          const skelRootChildren = Array.from(skelRootNode.getChildren());
          const meshChildren = skelRootChildren.filter(child => {
            const childType = child.getTypeName();
            return childType === 'Mesh' || childType === 'Xform';
          });
          const skeletonPrim = skelRootChildren.find(child => child.getTypeName() === 'Skeleton');
          const animationPrims = skelRootChildren.filter(child => child.getTypeName() === 'SkelAnimation');

          // Get SkelRoot and Skeleton prim animation info
          const skelRootAnimationSource = skelRootNode.getProperty('rel skel:animationSource');
          const skeletonPrimAnimationSource = skeletonPrimNode?.getProperty('rel skel:animationSource');

          // Get mesh binding info
          const meshBindings = meshChildren.map(mesh => {
            const meshPath = mesh.getPath();
            const skelSkeleton = mesh.getProperty('rel skel:skeleton');
            const geomBindTransform = mesh.getProperty('skel:geomBindTransform');
            const jointIndices = mesh.getProperty('int[] primvars:skel:jointIndices');
            const jointWeights = mesh.getProperty('float[] primvars:skel:jointWeights');

            // Verify mesh is bound to the same skeleton that has animation
            const meshSkeletonPath = getFirstPropertyValue(skelSkeleton);
            const skeletonPrimPath = skeletonPrimNode?.getPath();
            const isBoundToAnimatedSkeleton = meshSkeletonPath && skeletonPrimPath &&
              (typeof meshSkeletonPath === 'string' && (meshSkeletonPath === skeletonPrimPath || meshSkeletonPath.includes(skeletonPrimPath)));

            // Check if animation is set on skeleton
            const primaryAnimationSource = getFirstPropertyValue(skeletonPrimAnimationSource) || getFirstPropertyValue(skelRootAnimationSource);
            const hasAnimationOnSkeleton = !!primaryAnimationSource;

            return {
              meshName: mesh.getName(),
              meshPath,
              hasSkelBindingAPI: ApiSchemaBuilder.hasApiSchema(mesh, API_SCHEMAS.SKEL_BINDING),
              skelSkeleton,
              skeletonPrimPath,
              isBoundToAnimatedSkeleton,
              hasGeomBindTransform: !!geomBindTransform,
              hasJointIndices: !!jointIndices,
              hasJointWeights: !!jointWeights,
              // Verify animation sync - mesh is properly bound (animation is optional)
              skeletonHasAnimation: hasAnimationOnSkeleton,
              skelRootAnimationSource: skelRootAnimationSource,
              skeletonPrimAnimationSource: skeletonPrimAnimationSource,
              primaryAnimationSource: primaryAnimationSource,
              // Mesh is synchronized if it's bound to skeleton (animation is optional)
              animationSyncVerified: isBoundToAnimatedSkeleton
            };
          });

          return {
            skeletonName: skelRootNode.getName(),
            skeletonPath: skelRootPath,
            hasSkelBindingAPI: ApiSchemaBuilder.hasApiSchema(skelRootNode, API_SCHEMAS.SKEL_BINDING),
            animationSource: getFirstPropertyValue(skelRootAnimationSource),
            animationSourceCount: normalizePropertyToArray(skelRootAnimationSource).length,
            skeletonPrimPath: skeletonPrim?.getPath(),
            skeletonPrimHasSkelBindingAPI: skeletonPrimNode ? ApiSchemaBuilder.hasApiSchema(skeletonPrimNode, API_SCHEMAS.SKEL_BINDING) : false,
            skeletonPrimAnimationSource: skeletonPrimAnimationSource,
            animationPrimPaths: animationPrims.map(anim => anim.getPath()),
            animationCount: animationPrims.length,
            meshBindings,
            meshCount: meshChildren.length,
            // Overall verification
            allMeshesBound: meshBindings.every(m => m.isBoundToAnimatedSkeleton),
            allMeshesHaveAnimation: meshBindings.every(m => m.skeletonHasAnimation),
            // All meshes are synchronized if they're bound (animation is optional)
            animationSyncComplete: meshBindings.every(m => m.animationSyncVerified),
            // Verify mesh and skeleton are synchronized
            meshSkeletonSync: JSON.stringify(
              meshBindings.map(m => ({
                meshName: m.meshName,
                meshPath: m.meshPath,
                skeletonPath: m.skeletonPrimPath,
                isBound: m.isBoundToAnimatedSkeleton,
                hasAnimation: m.skeletonHasAnimation,
                syncVerified: m.animationSyncVerified,
                primaryAnimationSource: m.primaryAnimationSource,
                skelRootAnimationSource: m.skelRootAnimationSource,
                skeletonPrimAnimationSource: m.skeletonPrimAnimationSource,
                skelSkeleton: m.skelSkeleton,
                // Verify mesh is using same animation source as skeleton
                meshSkeletonMatch: m.skelSkeleton === m.skeletonPrimPath ||
                  (typeof m.skelSkeleton === 'string' && m.skelSkeleton.includes(m.skeletonPrimPath || '')),
                // Note: static skeletons (no animation) are valid
                syncNote: m.isBoundToAnimatedSkeleton && !m.skeletonHasAnimation ?
                  'Mesh bound to static skeleton (no animation) - using bind pose' : undefined
              })),
              null,
              2
            )
          };
        })
      });
    }

    // Set time code metadata on root node if animations are present
    if (animationTimeCode) {
      rootStructure.rootNode.setMetadata('startTimeCode', animationTimeCode.startTimeCode);
      rootStructure.rootNode.setMetadata('endTimeCode', animationTimeCode.endTimeCode);
      rootStructure.rootNode.setMetadata('timeCodesPerSecond', animationTimeCode.timeCodesPerSecond);
      rootStructure.rootNode.setMetadata('framesPerSecond', animationTimeCode.framesPerSecond);

      // Set defaultPrim to SkelRoot for animated models
      if (skeletonMap && skeletonMap.size > 0 && animationTimeCode) {
        const firstSkelRoot = Array.from(skeletonMap.values())[0].skelRootNode;
        const skelRootName = sanitizeName(firstSkelRoot.getName());
        rootStructure.rootNode.setMetadata('defaultPrim', skelRootName);
        logger.info('Set defaultPrim to SkelRoot for animated model', {
          defaultPrim: skelRootName,
          skelRootPath: firstSkelRoot.getPath()
        });
      } else {
        // Find blend shape SkelRoots and move to top-level
        const blendShapeSkelRoots: UsdNode[] = [];
        function findBlendShapeSkelRoots(node: UsdNode): void {
          if (node.getTypeName() === 'SkelRoot') {
            // Check if this SkelRoot has blend shapes (morph targets)
            const hasBlendShapes = Array.from(node.getChildren()).some(child => {
              if (child.getTypeName() === 'Mesh') {
                const blendShapes = child.getProperty('rel skel:blendShapes');
                return !!blendShapes;
              }
              return false;
            });
            if (hasBlendShapes) {
              blendShapeSkelRoots.push(node);
            }
          }
          for (const child of node.getChildren()) {
            findBlendShapeSkelRoots(child);
          }
        }
        findBlendShapeSkelRoots(rootStructure.rootNode);

        if (blendShapeSkelRoots.length > 0) {
          // Move the first blend shape SkelRoot to top-level and set as defaultPrim
          const blendSkelRoot = blendShapeSkelRoots[0];
          const oldPath = blendSkelRoot.getPath();
          let skelRootName = blendSkelRoot.getName();

          skelRootName = sanitizeName(skelRootName);

          // Ensure unique name for top-level prim
          const usedTopLevelNames = new Set<string>();
          usedTopLevelNames.add('Root');
          let uniqueName = skelRootName;
          let suffix = 1;
          while (usedTopLevelNames.has(uniqueName)) {
            uniqueName = sanitizeName(`${skelRootName}_${suffix}`);
            suffix++;
          }

          const newPath = `/${uniqueName}`;

          // Update all children paths before updating SkelRoot
          const updateChildPaths = (node: UsdNode, oldParentPath: string, newParentPath: string) => {
            const oldPath = node.getPath();
            if (oldPath.startsWith(oldParentPath + '/')) {
              const relativePath = oldPath.substring(oldParentPath.length);
              const newPath = newParentPath + relativePath;
              node.updatePath(newPath);

              // Recursively update children
              for (const child of node.getChildren()) {
                updateChildPaths(child, oldPath, newPath);
              }
            }
          };

          for (const child of blendSkelRoot.getChildren()) {
            updateChildPaths(child, oldPath, newPath);
          }

          // Update blend shape paths in meshes when SkelRoot moves
          function updateBlendShapePaths(node: UsdNode, oldParentPath: string, newParentPath: string): void {
            if (node.getTypeName() === 'Mesh') {
              const blendShapes = node.getProperty('rel skel:blendShapes');
              if (blendShapes) {
                const blendShapeArray = Array.isArray(blendShapes) ? blendShapes : [blendShapes];
                const updatedBlendShapes = blendShapeArray.map((path: string) => {
                  const cleanPath = path.replace(/[<>]/g, '');
                  if (cleanPath.startsWith(oldParentPath)) {
                    const relativePath = cleanPath.substring(oldParentPath.length);
                    return `<${newParentPath}${relativePath}>`;
                  }
                  return path;
                });
                node.setProperty('rel skel:blendShapes', updatedBlendShapes, 'rel[]');
                logger.info('Updated blend shape paths after SkelRoot move', {
                  meshName: node.getName(),
                  oldParentPath,
                  newParentPath,
                  blendShapeCount: updatedBlendShapes.length
                });
              }
            }
            for (const child of node.getChildren()) {
              updateBlendShapePaths(child, oldPath, newPath);
            }
          }

          updateBlendShapePaths(blendSkelRoot, oldPath, newPath);

          // Remove from current parent
          const currentParent = Array.from(rootStructure.rootNode.getChildren()).find(
            child => Array.from(child.getChildren()).includes(blendSkelRoot)
          ) || rootStructure.sceneNode;
          if (currentParent) {
            function findParent(node: UsdNode, target: UsdNode): UsdNode | null {
              for (const child of node.getChildren()) {
                if (child === target) return node;
                const found = findParent(child, target);
                if (found) return found;
              }
              return null;
            }
            const actualParent = findParent(rootStructure.rootNode, blendSkelRoot);
            if (actualParent) {
              actualParent.removeChild(blendSkelRoot);
            }
          }

          blendSkelRoot.updatePath(newPath);

          // Set customData.defaultAnimation before moving to top-level
          const firstAnimation = root.listAnimations()[0];
          const defaultAnimationName = firstAnimation?.getName() || 'Animation_0';
          blendSkelRoot.setProperty('customData', { defaultAnimation: defaultAnimationName });
          logger.info('Set customData.defaultAnimation on blend shape SkelRoot before moving to top-level', {
            skelRootPath: blendSkelRoot.getPath(),
            defaultAnimation: defaultAnimationName
          });

          // Add to top-level prims
          if (!rootStructure.topLevelPrims) {
            rootStructure.topLevelPrims = [];
          }
          rootStructure.topLevelPrims.push(blendSkelRoot);

          // Set as defaultPrim
          rootStructure.rootNode.setMetadata('defaultPrim', uniqueName);
          logger.info('Set defaultPrim to blend shape SkelRoot for morph target animation', {
            defaultPrim: uniqueName,
            oldPath,
            newPath: blendSkelRoot.getPath(),
            hasCustomData: !!blendSkelRoot.getProperty('customData')
          });
        }
      }
    }

    // Set animated extent on SkelRoot nodes after time code metadata is set
    if (skeletonMap && skeletonMap.size > 0 && animationTimeCode) {
      // Reconstruct animation sources map from skeleton map
      const animationSourcesMap = new Map();
      for (const [skin, skeletonData] of skeletonMap) {
        const skeletonPrimNode = skeletonData.skeletonPrimNode;
        const animationSource = skeletonPrimNode?.getProperty('rel skel:animationSource') ||
          skeletonData.skelRootNode.getProperty('rel skel:animationSource');
        if (animationSource) {
          const animPath = typeof animationSource === 'string'
            ? animationSource.replace(/[<>]/g, '')
            : Array.isArray(animationSource)
              ? animationSource[0]?.replace(/[<>]/g, '')
              : '';
          if (animPath) {
            animationSourcesMap.set(skin, [{ path: animPath, name: '', index: 0 }]);
          }
        }
      }

      if (animationSourcesMap.size > 0) {
        setAnimatedExtentOnSkelRoots(skeletonMap, animationSourcesMap, logger, rootStructure.rootNode);

        // restTransforms must match bind pose, not first animation frame
        // SkelAnimation default values control initial pose, restTransforms stays at bind pose
      }
    }

    // Set animated extent on all SkelRoots (must be called after moving blend shape SkelRoots to top-level)
    if (animationTimeCode) {
      const firstAnimation = root.listAnimations()[0];
      const defaultAnimationName = firstAnimation?.getName() || 'Animation_0';

      setAnimatedExtentOnAllSkelRoots(rootStructure.rootNode, logger, defaultAnimationName);

      // Set animated extent on top-level SkelRoots
      if (rootStructure.topLevelPrims) {
        for (const topLevelPrim of rootStructure.topLevelPrims) {
          if (topLevelPrim.getTypeName() === 'SkelRoot') {
            // Check if this SkelRoot has blend shapes
            let hasBlendShapes = false;
            function checkForBlendShapes(node: UsdNode): boolean {
              if (node.getTypeName() === 'Mesh') {
                const blendShapes = node.getProperty('rel skel:blendShapes');
                if (blendShapes) {
                  return true;
                }
              }
              for (const child of node.getChildren()) {
                if (checkForBlendShapes(child)) {
                  return true;
                }
              }
              return false;
            }
            hasBlendShapes = checkForBlendShapes(topLevelPrim);

            // Set customData.defaultAnimation if not already set
            const existingCustomData = topLevelPrim.getProperty('customData');
            if (hasBlendShapes && defaultAnimationName && !existingCustomData) {
              topLevelPrim.setProperty('customData', { defaultAnimation: defaultAnimationName });
              logger.info('Set customData.defaultAnimation on top-level blend shape SkelRoot', {
                skelRootPath: topLevelPrim.getPath(),
                defaultAnimation: defaultAnimationName
              });
            }

            // Set animated extent on top-level SkelRoot
            const startTimeCode = rootStructure.rootNode.getMetadata('startTimeCode') as number | undefined;
            const endTimeCode = rootStructure.rootNode.getMetadata('endTimeCode') as number | undefined;

            if (startTimeCode !== undefined && endTimeCode !== undefined) {
              // Check if extent is already time-sampled
              const existingExtent = topLevelPrim.getProperty('float3[] extent');
              if (!(existingExtent && typeof existingExtent === 'object' && 'timeSamples' in existingExtent)) {
                // Calculate extent and set time-sampled extent
                const staticExtent = calculateSceneExtent(topLevelPrim);
                if (staticExtent) {
                  const [minX, minY, minZ, maxX, maxY, maxZ] = staticExtent;
                  const extentMinStr = formatUsdTuple3(minX, minY, minZ);
                  const extentMaxStr = formatUsdTuple3(maxX, maxY, maxZ);
                  const extentValue = `[${extentMinStr}, ${extentMaxStr}]`;

                  const finalExtentTimeSamples = new Map<number, string>();
                  for (let frame = startTimeCode; frame <= endTimeCode; frame++) {
                    finalExtentTimeSamples.set(frame, extentValue);
                  }

                  topLevelPrim.setTimeSampledProperty('float3[] extent', finalExtentTimeSamples, 'float3[]');
                  logger.info('Set animated extent on top-level blend shape SkelRoot', {
                    skelRootPath: topLevelPrim.getPath(),
                    extent: `[(${minX}, ${minY}, ${minZ}), (${maxX}, ${maxY}, ${maxZ})]`,
                    timeSampleCount: finalExtentTimeSamples.size,
                    firstTimeCode: startTimeCode,
                    lastTimeCode: endTimeCode
                  });
                }
              }
            }
          }
        }
      }
    }

    // Calculate and set scene extent
    const sceneExtent = calculateSceneExtent(rootStructure.sceneNode);
    if (sceneExtent) {
      const [minX, minY, minZ, maxX, maxY, maxZ] = sceneExtent;
      rootStructure.sceneNode.setProperty(
        'float3[] extent',
        `[(${minX}, ${minY}, ${minZ}), (${maxX}, ${maxY}, ${maxZ})]`,
        'raw'
      );
    }

    // Serialize Root node and its children
    let usdContent = rootStructure.rootNode.serializeToUsda();

    // Serialize top-level prims (siblings of Root) if any
    if (rootStructure.topLevelPrims && rootStructure.topLevelPrims.length > 0) {
      for (const topLevelPrim of rootStructure.topLevelPrims) {
        usdContent += '\n' + topLevelPrim.serializeToUsda(0, true);
      }
    }

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
  logger: Logger
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
  } catch (error: unknown) {
    logger.error(`Failed to parse ${fileType}`, {
      stage: CONVERSION_STAGES.ERROR,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
