/**
 * USD Root Structure Builder
 * 
 * Builds the root USD hierarchy structure.
 */

import { UsdNode } from '../../core/usd-node';
import {
  USD_NODE_TYPES,
  USD_ROOT_PATHS,
  USD_PROPERTIES,
  USD_PROPERTY_TYPES,
  USD_DEFAULT_NAMES
} from '../../constants/usd';

/**
 * USD Root Structure
 */
export interface UsdRootStructure {
  rootNode: UsdNode;
  scenesNode: UsdNode;
  sceneNode: UsdNode;
  materialsNode: UsdNode;
}

/**
 * Creates the root USD hierarchy structure
 */
export function createRootStructure(sceneName?: string): UsdRootStructure {
  const rootNode = createRootNode();
  const scenesNode = createScenesNode(rootNode);
  const sceneNode = createSceneNode(scenesNode, sceneName);
  const materialsNode = createMaterialsNode(rootNode);

  return {
    rootNode,
    scenesNode,
    sceneNode,
    materialsNode
  };
}

/**
 * Creates the root Xform node
 */
function createRootNode(): UsdNode {
  const rootNode = new UsdNode(USD_ROOT_PATHS.ROOT, USD_NODE_TYPES.XFORM);

  // Set AR anchoring type for iOS compatibility
  rootNode.setProperty(
    USD_PROPERTIES.ANCHORING_TYPE,
    USD_PROPERTIES.ANCHORING_PLANE,
    USD_PROPERTY_TYPES.TOKEN
  );

  return rootNode;
}

/**
 * Creates the scenes scope node
 */
function createScenesNode(rootNode: UsdNode): UsdNode {
  const scenesNode = new UsdNode(
    USD_ROOT_PATHS.SCENES,
    USD_NODE_TYPES.SCOPE
  );

  rootNode.addChild(scenesNode);
  return scenesNode;
}

/**
 * Creates the scene Xform node
 */
function createSceneNode(
  scenesNode: UsdNode,
  sceneName?: string
): UsdNode {
  const name = sceneName || USD_DEFAULT_NAMES.SCENE;
  const sceneNode = new UsdNode(
    `${USD_ROOT_PATHS.SCENES}/${name}`,
    USD_NODE_TYPES.XFORM
  );

  scenesNode.addChild(sceneNode);
  return sceneNode;
}

/**
 * Creates the materials scope node
 */
function createMaterialsNode(rootNode: UsdNode): UsdNode {
  const materialsNode = new UsdNode(
    USD_ROOT_PATHS.MATERIALS,
    USD_NODE_TYPES.SCOPE
  );

  rootNode.addChild(materialsNode);
  return materialsNode;
}

