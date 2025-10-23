/**
 * USD Node Class
 * 
 * Minimal USD node implementation with only the methods actually used
 * by the GLTF-Transform converter.
 */

import {
  UsdPath,
  UsdAttributeValue
} from '../types';
import { UsdSchemaError } from '../errors';
import { UsdPathSchema } from '../validation';

/**
 * USD Property Interface
 */
interface USDProperty {
  key: string;
  value: any;
  type?: string;
}

/**
 * USD Node Class
 * 
 * Minimal implementation with only used methods.
 */
export class UsdNode {
  private _path: UsdPath;
  private _typeName: string;
  private _metadata: Map<string, UsdAttributeValue>;
  private _children: Map<string, UsdNode>;
  private _properties: USDProperty[] = [];

  constructor(
    path: UsdPath,
    typeName: string
  ) {
    // Validate path
    try {
      UsdPathSchema.parse(path);
    } catch (error) {
      throw new UsdSchemaError(`Invalid USD path: ${path}`, path);
    }

    this._path = path;
    this._typeName = typeName;
    this._metadata = new Map();
    this._children = new Map();
  }


  /**
   * Set metadata on this node
   */
  setMetadata(key: string, value: UsdAttributeValue): this {
    this._metadata.set(key, value);
    return this;
  }

  /**
   * Set a property on this node (for USDZ generation)
   */
  setProperty(key: string, value: any, type?: string): this {
    this._properties.push({ key, value, type });
    return this;
  }

  /**
   * Add a reference to this node (for USDZ generation)
   */
  addReference(target: string, primPath?: string): this {
    // Target is already .usda from geometry file generation, no need to change extension
    const reference = primPath ? `@${target}@<${primPath}>` : `@${target}@`;

    // Set as single reference, not array
    this.setProperty("prepend references", reference);
    return this;
  }

  /**
   * Add a child node (for USDZ generation)
   */
  addChild(child: UsdNode): this {
    const childName = child._path.split('/').pop() || 'Unnamed';
    this._children.set(childName, child);
    return this;
  }


  /**
   * Serialize this node to USDA format
   */
  serializeToUsda(indent: number = 0): string {
    const space = " ".repeat(indent * 4);

    // Add USD header for root node (indent = 0)
    let usda = "";
    if (indent === 0) {
      usda += "#usda 1.0\n";
      usda += "(\n";
      usda += "    customLayerData = {\n";
      usda += "        string creator = \"WebUSD Framework\"\n";
      usda += "    }\n";
      usda += "    defaultPrim = \"Root\"\n";
      usda += "    metersPerUnit = 1\n";
      usda += "    upAxis = \"Y\"\n";
      usda += ")\n\n";
    }

    const nodeName = this.getName() || "Unnamed";
    // Use "over" if the typeName starts with "over", otherwise use "def"
    const defOrOver = this._typeName.startsWith('over') ? 'over' : `def ${this._typeName}`;
    usda += `${space}${defOrOver} "${nodeName}" (\n`;
    let propertiesAndMetadata = "";

    // Add metadata
    for (const [key, value] of this._metadata) {
      propertiesAndMetadata += `${space}    ${key} = ${JSON.stringify(value, null, 4)}\n`;
    }

    // Handle special _usdContent property for inline material definitions
    const usdContentProp = this._properties.find(p => p.key === "_usdContent");
    if (usdContentProp) {
      // Close the node definition and add the content directly
      usda += `${space})\n`;
      usda += `${space}{\n`;
      const contentLines = usdContentProp.value.split('\n');
      for (const line of contentLines) {
        if (line.trim()) {
          usda += `${space}    ${line}\n`;
        }
      }
      usda += `${space}}\n`;
      return usda;
    }

    // For shader nodes, move all properties to the node body
    const isShaderNode = this._typeName === "Shader";

    // Separate token attributes, transform properties, and rel properties from other properties
    const tokenAttributes = isShaderNode ? [] : this._properties.filter(p => p.key.includes(":") && p.type === "token" && !p.key.includes(".connect"));
    const tokenConnections = this._properties.filter(p => p.key.includes(".connect") && p.type === "token");
    const transformProperties = this._properties.filter(p => p.key === "xformOp:transform" || p.key === "xformOpOrder");
    const relProperties = this._properties.filter(p => p.type === "rel");
    const otherProperties = isShaderNode ? [] : this._properties.filter(p => !(p.key.includes(":") && p.type === "token") && p.key !== "xformOp:transform" && p.key !== "xformOpOrder" && p.type !== "rel" && !p.key.includes(".connect"));
    const shaderProperties = isShaderNode ? this._properties : [];

    // Add properties (excluding token attributes)
    for (const prop of otherProperties) {
      // Handle raw type properties (geometry data)
      if (prop.type === 'raw') {
        propertiesAndMetadata += `${space}    ${prop.key} = ${prop.value}\n`;
        continue;
      }

      const value = Array.isArray(prop.value)
        ? `[${prop.value.map(v => JSON.stringify(v)).join(", ")}]`
        : JSON.stringify(prop.value);

      if (prop.key === "prepend references") {
        // Don't JSON.stringify references, they should be raw strings
        propertiesAndMetadata += `${space}    prepend references = ${prop.value}\n`;
      } else if (prop.key === "prepend apiSchemas") {
        propertiesAndMetadata += `${space}    prepend apiSchemas = ${value}\n`;
      } else if (prop.key === "xformOp:transform") {
        // Special handling for transform to match original format
        propertiesAndMetadata += `${space}    matrix4d ${prop.key} = ${prop.value}\n`;
      } else if (prop.key === "xformOpOrder") {
        // Special handling for xformOpOrder to match original format
        propertiesAndMetadata += `${space}    uniform token[] ${prop.key} = ${value}\n`;
      } else if (prop.key === "customData") {
        // Special handling for customData
        propertiesAndMetadata += `${space}    customData = {\n`;
        for (const [key, val] of Object.entries(prop.value)) {
          propertiesAndMetadata += `${space}        ${key} = ${JSON.stringify(val)}\n`;
        }
        propertiesAndMetadata += `${space}    }\n`;
      } else if (prop.key.includes("inputs:file")) {
        // Special handling for asset inputs:file - don't double quote
        propertiesAndMetadata += `${space}    asset ${prop.key} = ${prop.value}\n`;
      } else if (prop.key.includes(":")) {
        // Special handling for properties with colons (like preliminary:anchoring:type)
        // In USD, namespaced properties need to be declared as attributes
        const [namespace, ...rest] = prop.key.split(":");
        const attributeName = rest.join(":");
        propertiesAndMetadata += `${space}    ${namespace}:${attributeName} = ${value}\n`;
      } else {
        // Skip connection properties (they're handled in tokenConnections)
        if (!prop.key.includes(".connect")) {
          propertiesAndMetadata += `${space}    ${prop.key} = ${value}\n`;
        }
      }
    }

    if (propertiesAndMetadata) {
      usda += propertiesAndMetadata;
      usda += `${space})\n`;
    } else {
      usda += `${space})\n`;
    }

    if (this._children.size > 0 || tokenAttributes.length > 0 || tokenConnections.length > 0 || transformProperties.length > 0 || relProperties.length > 0 || shaderProperties.length > 0) {
      usda += `${space}{\n`;

      // Add shader properties first (in node body)
      for (const prop of shaderProperties) {
        if (prop.value === undefined || prop.value === "") {
          // For outputs and properties without values, just declare the type
          usda += `${space}    ${prop.key}\n`;
        } else if (prop.key.includes(".connect")) {
          // For connection properties, don't quote the value
          const value = prop.value.toString().replace(/^"(.*)"$/, '$1');
          usda += `${space}    ${prop.key} = ${value}\n`;
        } else {
          let value;
          if (prop.type === 'raw') {
            // For raw type, output the value as-is without additional quoting or brackets
            usda += `${space}    ${prop.key} = ${prop.value}\n`;
            continue;
          } else if (Array.isArray(prop.value)) {
            value = `[${prop.value.map(v => JSON.stringify(v)).join(", ")}]`;
          } else if (prop.type === 'asset' || prop.key.includes("inputs:file")) {
            // For asset types, don't quote the value (it's already formatted with @...@)
            usda += `${space}    asset ${prop.key.replace('asset ', '')} = ${prop.value}\n`;
            continue;
          } else if ((prop.key.includes("inputs:wrapS") || prop.key.includes("inputs:wrapT") || prop.key.includes("inputs:sourceColorSpace"))) {
            // For token inputs with specific values, quote them
            value = JSON.stringify(prop.value);
          } else if (prop.key.includes("inputs:") && (prop.key.includes("diffuseColor") || prop.key.includes("emissiveColor") || prop.key.includes("specularColor"))) {
            // For color inputs, don't quote the values
            value = prop.value;
          } else if (prop.type === 'float4' || prop.type === 'float3' || prop.type === 'float2' || prop.type === 'float') {
            // For float types with explicit type annotation, don't quote
            value = prop.value;
          } else if (prop.type === 'int') {
            // For int types, don't quote
            value = prop.value;
          } else if (prop.type === 'string') {
            // For string types, quote the value
            value = JSON.stringify(prop.value);
          } else if (prop.type === 'token') {
            // For token types, don't quote if it's not already quoted
            value = prop.value.startsWith('"') ? prop.value : JSON.stringify(prop.value);
          } else {
            value = JSON.stringify(prop.value);
          }
          usda += `${space}    ${prop.key} = ${value}\n`;
        }
      }

      // Add token attributes (in node body)
      for (const attr of tokenAttributes) {
        let value;
        if (Array.isArray(attr.value)) {
          value = `[${attr.value.map(v => JSON.stringify(v)).join(", ")}]`;
        } else if (attr.key.includes("sourceColorSpace")) {
          // For sourceColorSpace, ensure it's quoted
          value = JSON.stringify(attr.value);
        } else if (attr.key.includes("wrapS") || attr.key.includes("wrapT")) {
          // For wrapS/wrapT, ensure they're quoted
          value = JSON.stringify(attr.value);
        } else {
          value = JSON.stringify(attr.value);
        }
        usda += `${space}    token ${attr.key} = ${value}\n`;
      }

      // Add token connections (in node body, without quotes)
      for (const prop of tokenConnections) {
        // Remove quotes from connection paths
        const value = prop.value.replace(/"([^"]+)"/g, '$1');
        usda += `${space}    token ${prop.key} = ${value}\n`;
      }

      // Add rel properties (in node body)
      for (const prop of relProperties) {
        // Remove quotes from connection paths for rel properties
        const value = prop.value.replace(/"([^"]+)"/g, '$1');
        usda += `${space}    rel ${prop.key} = ${value}\n`;
      }

      // Add transform properties (in node body)
      for (const prop of transformProperties) {
        if (prop.key === "xformOp:transform") {
          usda += `${space}    matrix4d ${prop.key} = ${prop.value}\n`;
        } else if (prop.key === "xformOpOrder") {
          const value = Array.isArray(prop.value)
            ? `[${prop.value.map(v => JSON.stringify(v)).join(", ")}]`
            : JSON.stringify(prop.value);
          usda += `${space}    uniform token[] ${prop.key} = ${value}\n`;
        }
      }

      // Add children
      for (const child of this._children.values()) {
        usda += child.serializeToUsda(indent + 1);
      }
      usda += `${space}}\n`;
    }

    return usda;
  }

  /**
   * Get the name of this node
   */
  getName(): string {
    const parts = this._path.split('/');
    return parts[parts.length - 1];
  }

  /**
   * Get the full USD path of this node
   */
  getPath(): string {
    return this._path;
  }

}