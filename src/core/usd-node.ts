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
  value: string | number | boolean | string[] | number[] | boolean[] | object;
  type?: string | undefined;
}

/**
 * USD Node Class
 * 
 * Minimal implementation with only used methods.
 */
/**
 * Time sample data
 */
interface TimeSampleData {
  timeSamples: Map<number, string>;
  type: string;
}

export class UsdNode {
  private _path: UsdPath;
  private _typeName: string;
  private _metadata: Map<string, UsdAttributeValue>;
  private _children: Map<string, UsdNode>;
  private _properties: USDProperty[] = [];
  private _timeSamples: Map<string, TimeSampleData> = new Map();

  constructor(
    path: UsdPath,
    typeName: string
  ) {
    // Parse and validate path
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
   * Get metadata value from this node
   */
  getMetadata(key: string): UsdAttributeValue | undefined {
    return this._metadata.get(key);
  }

  /**
   * Set a property on this node (for USDZ generation)
   */
  setProperty(key: string, value: string | number | boolean | string[] | number[] | boolean[] | object, type?: string): this {
    // Remove existing property if present (ignore type for comparison)
    const existingIndex = this._properties.findIndex(p => p.key === key);
    if (existingIndex !== -1) {
      this._properties.splice(existingIndex, 1);
    }

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
   * Remove a child node from this node
   */
  removeChild(child: UsdNode): boolean {
    const childName = child._path.split('/').pop() || 'Unnamed';
    return this._children.delete(childName);
  }

  /**
   * Update the path of this node (useful when moving nodes in hierarchy)
   */
  updatePath(newPath: UsdPath): this {
    try {
      UsdPathSchema.parse(newPath);
    } catch (error) {
      throw new UsdSchemaError(`Invalid USD path: ${newPath}`, newPath);
    }
    this._path = newPath;
    return this;
  }

  /**
   * Get all child nodes
   */
  getChildren(): IterableIterator<UsdNode> {
    return this._children.values();
  }

  /**
   * Get a property value
   */
  getProperty(key: string): string | number | boolean | string[] | number[] | boolean[] | object | undefined {
    const prop = this._properties.find(p => p.key === key);
    return prop ? prop.value : undefined;
  }

  /**
   * Set a time-sampled property for animation
   */
  setTimeSampledProperty(key: string, timeSamples: Map<number, string>, type: string): this {
    this._timeSamples.set(key, { timeSamples, type });
    return this;
  }


  /**
   * Serialize this node to USDA format
   */
  serializeToUsda(indent: number = 0, skipHeader: boolean = false): string {
    const space = " ".repeat(indent * 4);

    // Add USD header for root node (indent = 0)
    let usda = "";
    if (indent === 0 && !skipHeader) {
      usda += "#usda 1.0\n";
      usda += "(\n";
      usda += "    customLayerData = {\n";
      usda += "        string creator = \"WebUSD Framework\"\n";

      // Add XMP metadata if present
      const xmpMetadata = this._metadata.get('xmpMetadata') as Record<string, unknown> | undefined;
      if (xmpMetadata) {
        // Format XMP metadata as nested dictionary in customLayerData
        const xmpData = xmpMetadata.xmp as { context: Record<string, string>; properties: Record<string, unknown> } | undefined;
        if (xmpData) {
          usda += "        dictionary xmp = {\n";

          // Add context
          if (xmpData.context && Object.keys(xmpData.context).length > 0) {
            usda += "            dictionary context = {\n";
            for (const [term, definition] of Object.entries(xmpData.context)) {
              const defValue = typeof definition === 'string' ? definition : JSON.stringify(definition);
              usda += `                string ${term} = ${JSON.stringify(defValue)}\n`;
            }
            usda += "            }\n";
          }

          // Add properties
          if (xmpData.properties && Object.keys(xmpData.properties).length > 0) {
            usda += "            dictionary properties = {\n";
            for (const [propName, propValue] of Object.entries(xmpData.properties)) {
              if (typeof propValue === 'string') {
                usda += `                string ${propName} = ${JSON.stringify(propValue)}\n`;
              } else if (typeof propValue === 'number') {
                const typeDecl = Number.isInteger(propValue) ? 'int' : 'float';
                usda += `                ${typeDecl} ${propName} = ${propValue}\n`;
              } else if (typeof propValue === 'boolean') {
                usda += `                bool ${propName} = ${propValue}\n`;
              } else {
                // Complex object - serialize as JSON string
                usda += `                string ${propName} = ${JSON.stringify(propValue)}\n`;
              }
            }
            usda += "            }\n";
          }

          usda += "        }\n";
        }
      }

      usda += "    }\n";

      // defaultPrim must be a direct child of the root layer
      const defaultPrim = this._metadata.get('defaultPrim') as string | undefined;
      if (defaultPrim) {
        usda += `    defaultPrim = "${defaultPrim}"\n`;
      } else {
        usda += "    defaultPrim = \"Root\"\n";
      }

      usda += "    metersPerUnit = 1\n";
      usda += "    upAxis = \"Y\"\n";

      // Add time code metadata if present (header only)
      const timeCodesPerSecond = this._metadata.get('timeCodesPerSecond');
      const framesPerSecond = this._metadata.get('framesPerSecond');
      const startTimeCode = this._metadata.get('startTimeCode');
      const endTimeCode = this._metadata.get('endTimeCode');

      // Add autoPlay and playbackMode when animations are present
      const hasAnimations = timeCodesPerSecond !== undefined &&
        framesPerSecond !== undefined &&
        startTimeCode !== undefined &&
        endTimeCode !== undefined;

      if (hasAnimations) {
        usda += `    autoPlay = true\n`;
        usda += `    playbackMode = "loop"\n`;
      }

      if (timeCodesPerSecond !== undefined) {
        usda += `    timeCodesPerSecond = ${timeCodesPerSecond}\n`;
      }
      if (framesPerSecond !== undefined) {
        usda += `    framesPerSecond = ${framesPerSecond}\n`;
      }
      if (startTimeCode !== undefined) {
        usda += `    startTimeCode = ${startTimeCode}\n`;
      }
      if (endTimeCode !== undefined) {
        usda += `    endTimeCode = ${endTimeCode}\n`;
      }

      usda += ")\n\n";
    }

    const nodeName = this.getName() || "Unnamed";
    // Use "over" if the typeName starts with "over", otherwise use "def"
    const defOrOver = this._typeName.startsWith('over') ? 'over' : `def ${this._typeName}`;

    let propertiesAndMetadata = "";

    // Add metadata (exclude header-only keys)
    const timeCodeKeys = ['startTimeCode', 'endTimeCode', 'timeCodesPerSecond', 'framesPerSecond'];
    const headerOnlyKeys = ['defaultPrim', ...timeCodeKeys];
    for (const [key, value] of this._metadata) {
      if (headerOnlyKeys.includes(key)) {
        continue;
      }
      propertiesAndMetadata += `${space}    ${key} = ${JSON.stringify(value, null, 4)}\n`;
    }

    // Handle special _usdContent property for inline material definitions
    const usdContentProp = this._properties.find(p => p.key === "_usdContent");
    if (usdContentProp) {
      // Add node definition without parentheses
      usda += `${space}${defOrOver} "${nodeName}"\n`;
      usda += `${space}{\n`;
      const contentLines = (usdContentProp.value as string).split('\n');
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

    // Separate token attributes, transform properties, rel properties, and array properties from other properties
    const tokenAttributes = isShaderNode ? [] : this._properties.filter(p => p.key.includes(":") && p.type === "token" && !p.key.includes(".connect"));
    const tokenConnections = this._properties.filter(p => p.key.includes(".connect") && (p.type === "token" || p.type === "connection") && !isShaderNode);

    // If we have time-sampled transform ops, exclude xformOp:transform (can't mix with individual ops)
    const hasAnimatedTransforms = this._timeSamples.size > 0 &&
      Array.from(this._timeSamples.keys()).some(key =>
        key.startsWith('xformOp:translate') ||
        key.startsWith('xformOp:rotate') ||
        key.startsWith('xformOp:scale')
      );

    const transformProperties = this._properties.filter(p => {
      if (p.key === "xformOp:transform" && hasAnimatedTransforms) {
        // Exclude xformOp:transform if we have animated individual ops
        return false;
      }
      return p.key === "xformOp:transform" || p.key === "xformOpOrder" || p.key === "skel:geomBindTransform";
    });
    const relProperties = this._properties.filter(p => p.type === "rel" || p.type === "rel[]");
    const interpolationProperties = this._properties.filter(p => p.type === "interpolation");
    const elementSizeProperties = this._properties.filter(p => p.type === "elementSize");
    const arrayProperties = this._properties.filter(p =>
      (p.key === 'int[] faceVertexCounts' || p.key === 'int[] faceVertexIndices' || p.key === 'float3[] normals' || p.key === 'point3f[] points' || p.key === 'point3f[] offsets' || p.key === 'float3[] extent' || p.key.startsWith('float2[] primvars:st') || p.key.startsWith('texCoord2f[] primvars:st') || p.key === 'float3[] translations' || p.key === 'half3[] scales' || p.key === 'quatf[] rotations' || p.key === 'int[] primvars:skel:jointIndices' || p.key === 'float[] primvars:skel:jointWeights' || p.key === 'float[] primvars:blendShapeWeights' || p.key === 'color3f[] primvars:displayColor')
      // primvars:st:interpolation is handled via interpolationProperties, not as a separate property
    );
    // Token array properties that go in node body (skeleton joints, etc.)
    const tokenArrayProperties = this._properties.filter(p =>
      (p.key === 'uniform token[] joints' || p.key.startsWith('uniform token[]') || p.key.startsWith('uniform matrix4d[]'))
    );
    // Simple token properties that go in node body (not in parentheses)
    const simpleTokenProperties = this._properties.filter(p =>
      (p.key === 'token subdivisionScheme' || p.key === 'token visibility' || p.key === 'token purpose')
    );
    // xformOp properties go in node body, exclude if they have time samples
    const xformOpProperties = this._properties.filter(p => {
      if (!(p.key.startsWith('xformOp:translate') ||
        p.key.startsWith('xformOp:orient') ||
        p.key.startsWith('xformOp:scale') ||
        (p.key.startsWith('xformOp:rotate') && !p.key.startsWith('xformOp:rotateXYZ')))) {
        return false;
      }
      return !this._timeSamples.has(p.key);
    });

    // Input properties that go in node body (for Lights, etc.)
    const inputProperties = isShaderNode ? [] : this._properties.filter(p => p.key.includes("inputs:"));

    const otherProperties = isShaderNode ? [] : this._properties.filter(p =>
      !p.key.includes("inputs:") && // Exclude inputs - they go in node body
      !(p.key.includes(":") && p.type === "token") &&
      p.key !== "xformOp:transform" &&
      p.key !== "xformOpOrder" &&
      p.key !== "skel:geomBindTransform" && // Exclude - it goes in node body as transform property
      !p.key.startsWith('xformOp:translate') && // Exclude - goes in node body
      !p.key.startsWith('xformOp:orient') && // Exclude - goes in node body
      !p.key.startsWith('xformOp:scale') && // Exclude - goes in node body
      !(p.key.startsWith('xformOp:rotate') && !p.key.startsWith('xformOp:rotateXYZ')) && // Exclude - goes in node body
      p.key !== "float3[] extent" && // Exclude extent - it goes in node body
      p.key !== "point3f[] offsets" && // Exclude - it goes in node body
      p.key !== "float3[] translations" && // Exclude - it goes in node body
      p.key !== "half3[] scales" && // Exclude - it goes in node body
      p.key !== "quatf[] rotations" && // Exclude - it goes in node body
      p.key !== "int[] primvars:skel:jointIndices" && // Exclude - it goes in node body
      p.key !== "float[] primvars:skel:jointWeights" && // Exclude - it goes in node body
      p.key !== "float[] primvars:blendShapeWeights" && // Exclude - it goes in node body
      p.key !== "color3f[] primvars:displayColor" && // Exclude - it goes in node body
      p.key !== "token subdivisionScheme" && // Exclude - it goes in node body
      p.key !== "token visibility" && // Exclude - it goes in node body
      p.key !== "token purpose" && // Exclude - it goes in node body
      p.key !== "uniform token primvars:st:interpolation" && // Exclude - handled via interpolation metadata
      p.key !== "token normals:interpolation" && // Exclude - handled via interpolation metadata
      p.key !== "uniform token primvars:displayColor:interpolation" && // Exclude - handled via interpolation metadata
      p.key !== "uniform token[] joints" && // Exclude - goes in node body
      p.type !== "rel" &&
      p.type !== "rel[]" && // Exclude rel array properties - they go in node body
      p.type !== "interpolation" && // Exclude interpolation properties
      p.type !== "elementSize" && // Exclude elementSize properties - handled via metadata
      !p.key.includes(".connect") &&
      !arrayProperties.some(ap => ap.key === p.key) && // Exclude array properties from otherProperties
      !simpleTokenProperties.some(stp => stp.key === p.key) && // Exclude simple token properties from otherProperties
      !tokenArrayProperties.some(tap => tap.key === p.key) && // Exclude token array properties from otherProperties
      !transformProperties.some(tp => tp.key === p.key) // Exclude transform properties from otherProperties
    );
    const shaderProperties = isShaderNode ? this._properties : [];

    // Add properties (excluding token attributes)
    for (const prop of otherProperties) {
      // Handle xformOp properties
      if (prop.key.startsWith('xformOp:translate') || prop.key.startsWith('xformOp:orient') || prop.key.startsWith('xformOp:scale')) {
        propertiesAndMetadata += `${space}    ${prop.key} = ${prop.value}\n`;
        continue;
      }

      // Handle raw type properties (geometry data)
      if (prop.type === 'raw') {
        propertiesAndMetadata += `${space}    ${prop.key} = ${prop.value}\n`;
        continue;
      }

      // Handle arrays properly - don't double-quote them
      let value;
      if (Array.isArray(prop.value)) {
        // For arrays, don't wrap in quotes - just output the raw array
        value = `[${prop.value.join(", ")}]`;
      } else {
        value = JSON.stringify(prop.value);
      }

      if (prop.key === "prepend references") {
        // Don't JSON.stringify references, they should be raw strings
        propertiesAndMetadata += `${space}    prepend references = ${prop.value}\n`;
      } else if (prop.key === "prepend apiSchemas") {
        // For apiSchemas, quote each element as a string
        if (Array.isArray(prop.value)) {
          const quotedArray = prop.value.map(item => `"${item}"`).join(", ");
          propertiesAndMetadata += `${space}    prepend apiSchemas = [${quotedArray}]\n`;
        } else {
          propertiesAndMetadata += `${space}    prepend apiSchemas = ${value}\n`;
        }
      } else if (prop.key === "xformOp:transform") {
        // Special handling for transform to match original format
        propertiesAndMetadata += `${space}    matrix4d ${prop.key} = ${prop.value}\n`;
      } else if (prop.key === "xformOpOrder") {
        // Special handling for xformOpOrder to match original format
        propertiesAndMetadata += `${space}    uniform token[] ${prop.key} = ${value}\n`;
      } else if (prop.key === "customData") {
        // Special handling for customData
        // USD requires explicit type declarations for customData values
        // Supports nested dictionaries (e.g., { Maya: { generated: 1 } })
        propertiesAndMetadata += `${space}    customData = {\n`;
        for (const [key, val] of Object.entries(prop.value)) {
          // Handle nested dictionaries (e.g., Maya: { generated: 1 })
          if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            propertiesAndMetadata += `${space}        dictionary ${key} = {\n`;
            for (const [nestedKey, nestedVal] of Object.entries(val)) {
              // Determine type based on nested value type
              let typeDecl = '';
              if (typeof nestedVal === 'string') {
                typeDecl = 'string ';
              } else if (typeof nestedVal === 'number') {
                typeDecl = Number.isInteger(nestedVal) ? 'int ' : 'float ';
              } else if (typeof nestedVal === 'boolean') {
                typeDecl = 'bool ';
              }
              propertiesAndMetadata += `${space}            ${typeDecl}${nestedKey} = ${JSON.stringify(nestedVal)}\n`;
            }
            propertiesAndMetadata += `${space}        }\n`;
          } else {
            // Handle flat values (string, number, boolean)
            let typeDecl = '';
            if (typeof val === 'string') {
              typeDecl = 'string ';
            } else if (typeof val === 'number') {
              typeDecl = Number.isInteger(val) ? 'int ' : 'float ';
            } else if (typeof val === 'boolean') {
              typeDecl = 'bool ';
            }
            propertiesAndMetadata += `${space}        ${typeDecl}${key} = ${JSON.stringify(val)}\n`;
          }
        }
        propertiesAndMetadata += `${space}    }\n`;
      } else if (prop.key.includes("inputs:file")) {
        // Special handling for asset inputs:file - don't double quote
        propertiesAndMetadata += `${space}    asset ${prop.key} = ${prop.value}\n`;
      } else if (prop.key.includes(":") && !prop.key.startsWith("rel ")) {
        // Special handling for properties with colons (like preliminary:anchoring:type)
        // In USD, namespaced properties need to be declared as attributes
        // Exclude rel properties (they start with "rel " and go in the body)
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

    // Only add parentheses if there are properties/metadata
    if (propertiesAndMetadata) {
      usda += `${space}${defOrOver} "${nodeName}" (\n`;
      usda += propertiesAndMetadata;
      usda += `${space})\n`;
    } else {
      usda += `${space}${defOrOver} "${nodeName}"\n`;
    }

    // Determine if we need braces for the node body
    // Material nodes need braces for their children (shaders) and connections
    const needsBraces = this._typeName === 'Scope' || this._typeName === 'Xform' || this._typeName === 'Material' || this._children.size > 0 || tokenAttributes.length > 0 || tokenConnections.length > 0 || transformProperties.length > 0 || relProperties.length > 0 || shaderProperties.length > 0 || inputProperties.length > 0 || arrayProperties.length > 0 || simpleTokenProperties.length > 0 || tokenArrayProperties.length > 0 || xformOpProperties.length > 0 || this._timeSamples.size > 0;

    if (needsBraces) {
      usda += `${space}{\n`;

      // Add array properties first (in node body)
      for (const prop of arrayProperties) {
        // Extract type declaration from the key (e.g., 'int[] faceVertexCounts' -> 'int[]')
        const typeDeclaration = prop.key.split(' ')[0];
        const propertyName = prop.key.split(' ').slice(1).join(' ');

        // Skip default value if property has time samples
        if (this._timeSamples.has(prop.key)) {
          continue;
        }

        if (typeDeclaration) {
          // Handle texCoord2f primvars:st with interpolation metadata
          if (prop.type === 'texcoord') {
            // Find the matching interpolation property (e.g., primvars:st:interpolation for primvars:st)
            const interpolationProp = interpolationProperties.find(ip => {
              const ipKeyParts = ip.key.split(' ');
              const ipPropertyName = ipKeyParts.length > 1 ? ipKeyParts[ipKeyParts.length - 1] : ip.key;
              return ipPropertyName.startsWith(propertyName + ':') || ipPropertyName === propertyName + ':interpolation';
            });
            if (interpolationProp) {
              // Reference format uses duplicate interpolation lines
              usda += `${space}    ${typeDeclaration} ${propertyName} = ${prop.value} (\n`;
              usda += `${space}        interpolation = "${interpolationProp.value}"\n`;
              usda += `${space}        interpolation = "${interpolationProp.value}"\n`;
              usda += `${space}    )\n`;
            } else {
              usda += `${space}    ${typeDeclaration} ${propertyName} = ${prop.value}\n`;
            }
          } else if (prop.key === 'float3[] normals') {
            // Handle normals with interpolation metadata
            const interpolationProp = interpolationProperties.find(ip => {
              const ipKeyParts = ip.key.split(' ');
              const ipPropertyName = ipKeyParts.length > 1 ? ipKeyParts[ipKeyParts.length - 1] : ip.key;
              return ipPropertyName === 'normals:interpolation' || ipPropertyName.startsWith('normals:');
            });
            if (interpolationProp) {
              usda += `${space}    ${typeDeclaration} ${propertyName} = ${prop.value} (\n`;
              usda += `${space}        interpolation = "${interpolationProp.value}"\n`;
              usda += `${space}    )\n`;
            } else {
              usda += `${space}    ${typeDeclaration} ${propertyName} = ${prop.value}\n`;
            }
          } else if (prop.key === 'int[] primvars:skel:jointIndices' || prop.key === 'float[] primvars:skel:jointWeights') {
            // Handle joint primvars with interpolation and elementSize metadata
            const interpolationProp = interpolationProperties.find(ip => {
              const ipKeyParts = ip.key.split(' ');
              const ipPropertyName = ipKeyParts.length > 1 ? ipKeyParts[ipKeyParts.length - 1] : ip.key;
              return ipPropertyName === propertyName + ':interpolation';
            });
            const elementSizeProp = elementSizeProperties.find(ep => {
              const epKeyParts = ep.key.split(' ');
              const epPropertyName = epKeyParts.length > 1 ? epKeyParts[epKeyParts.length - 1] : ep.key;
              return epPropertyName === propertyName + ':elementSize';
            });

            if (interpolationProp || elementSizeProp) {
              usda += `${space}    ${typeDeclaration} ${propertyName} = ${prop.value} (\n`;
              if (interpolationProp) {
                usda += `${space}        interpolation = "${interpolationProp.value}"\n`;
              }
              if (elementSizeProp) {
                usda += `${space}        elementSize = ${elementSizeProp.value}\n`;
              }
              usda += `${space}    )\n`;
            } else {
              // No metadata, output normally
              if (prop.type === 'raw') {
                usda += `${space}    ${typeDeclaration} ${propertyName} = ${prop.value}\n`;
              } else {
                usda += `${space}    ${typeDeclaration} ${propertyName} = ${prop.value}\n`;
              }
            }
          } else if (prop.key === 'color3f[] primvars:displayColor') {
            // Handle displayColor with interpolation metadata
            const interpolationProp = interpolationProperties.find(ip => {
              const ipKeyParts = ip.key.split(' ');
              const ipPropertyName = ipKeyParts.length > 1 ? ipKeyParts[ipKeyParts.length - 1] : ip.key;
              // Match both 'primvars:displayColor:interpolation' and 'uniform token primvars:displayColor:interpolation'
              return ipPropertyName === propertyName + ':interpolation' ||
                ip.key === 'uniform token primvars:displayColor:interpolation' ||
                ip.key === 'primvars:displayColor:interpolation';
            });
            if (interpolationProp) {
              usda += `${space}    ${typeDeclaration} ${propertyName} = ${prop.value} (\n`;
              usda += `${space}        interpolation = "${interpolationProp.value}"\n`;
              usda += `${space}    )\n`;
            } else {
              // No metadata, output normally
              if (prop.type === 'raw') {
                usda += `${space}    ${typeDeclaration} ${propertyName} = ${prop.value}\n`;
              } else {
                usda += `${space}    ${typeDeclaration} ${propertyName} = ${prop.value}\n`;
              }
            }
          } else if (prop.type === 'raw') {
            // Handle raw type properties (geometry data) - don't quote the value
            usda += `${space}    ${typeDeclaration} ${propertyName} = ${prop.value}\n`;
          } else {
            usda += `${space}    ${typeDeclaration} ${propertyName} = ${prop.value}\n`;
          }
        } else {
          // Handle raw type properties without type declaration
          if (prop.type === 'raw') {
            usda += `${space}    ${propertyName} = ${prop.value}\n`;
          } else {
            usda += `${space}    ${propertyName} = ${prop.value}\n`;
          }
        }
      }

      // Add token array properties (in node body) - for skeleton joints, etc.
      for (const prop of tokenArrayProperties) {
        // Extract type and property name from key (e.g., 'uniform token[] joints' -> 'uniform token[]' and 'joints')
        const parts = prop.key.split(' ');
        const typeDeclaration = parts.slice(0, -1).join(' '); // 'uniform token[]'
        const propertyName = parts[parts.length - 1]; // 'joints'
        // For raw type, output the value as-is (already formatted as USDA string)
        if (prop.type === 'raw') {
          usda += `${space}    ${typeDeclaration} ${propertyName} = ${prop.value}\n`;
        } else {
          // Fallback to JSON stringify if not raw
          usda += `${space}    ${typeDeclaration} ${propertyName} = ${JSON.stringify(prop.value)}\n`;
        }
      }

      // Add simple token properties (in node body)
      for (const prop of simpleTokenProperties) {
        // Extract type and property name from key (e.g., 'token subdivisionScheme' -> 'token' and 'subdivisionScheme')
        const parts = prop.key.split(' ');
        const typeDeclaration = parts[0]; // 'token'
        const propertyName = parts.slice(1).join(' '); // 'subdivisionScheme', 'visibility', 'purpose'
        const value = typeof prop.value === 'string' && prop.value.startsWith('"') ? prop.value : JSON.stringify(prop.value);
        usda += `${space}    ${typeDeclaration} ${propertyName} = ${value}\n`;
      }

      // Add input properties (in node body) - for Lights, etc.
      for (const prop of inputProperties) {
        let value;
        if (prop.key.includes("inputs:color")) {
          // For color inputs, don't quote the values
          value = prop.value;
        } else if (prop.type === 'color3f' || prop.type === 'float3' || prop.type === 'float' || prop.type === 'int') {
          // For numeric types, don't quote the values
          value = prop.value;
        } else if (typeof prop.value === 'number') {
          // For any numeric value, don't quote
          value = prop.value;
        } else {
          value = JSON.stringify(prop.value);
        }

        // Use the full key as the property name (e.g., "color3f inputs:color")
        // But we need to handle the type declaration if it's part of the key
        if (prop.key.startsWith('color3f ') || prop.key.startsWith('float3 ')) {
          usda += `${space}    ${prop.key} = ${value}\n`;
        } else {
          // If type is not in key, assume it's needed or handled by type property
          // For inputs:color on lights, we usually see "color3f inputs:color"
          usda += `${space}    ${prop.key} = ${value}\n`;
        }
      }

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
            // For arrays, don't wrap in quotes - just output the raw array
            value = `[${prop.value.join(", ")}]`;
          } else if (prop.type === 'asset' || prop.key.includes("inputs:file")) {
            // For asset types, don't quote the value (it's already formatted with @...@)
            usda += `${space}    asset ${prop.key.replace('asset ', '')} = ${prop.value}\n`;
            continue;
          } else if ((prop.key.includes("inputs:wrapS") || prop.key.includes("inputs:wrapT") || prop.key.includes("inputs:sourceColorSpace"))) {
            // For token inputs with specific values, quote them
            value = JSON.stringify(prop.value);
          } else if (prop.key.includes("inputs:") && (prop.key.includes("diffuseColor") || prop.key.includes("emissiveColor") || prop.key.includes("specularColor") || prop.key.includes("inputs:color"))) {
            // For color inputs, don't quote the values
            value = prop.value;
          } else if (prop.type === 'float4' || prop.type === 'float3' || prop.type === 'float2' || prop.type === 'float' || prop.type === 'color3f') {
            // For float/color types with explicit type annotation, don't quote
            value = prop.value;
          } else if (prop.type === 'int') {
            // For int types, don't quote
            value = prop.value;
          } else if (prop.type === 'string') {
            // For string types, quote the value
            value = JSON.stringify(prop.value);
            // Ensure inputs:varname is written as 'string' not 'token' (USDZ validator requirement)
            if (prop.key.includes('inputs:varname')) {
              // Replace 'token' with 'string' in the key if present
              const key = prop.key.replace(/^token\s+/, 'string ');
              usda += `${space}    ${key} = ${value}\n`;
              continue;
            }
          } else if (prop.type === 'token') {
            // For token types, don't quote if it's not already quoted
            const valueStr = prop.value as string;
            value = valueStr.startsWith('"') ? valueStr : JSON.stringify(valueStr);
            // Ensure inputs:varname is written as 'string' not 'token' (USDZ validator requirement)
            if (prop.key.includes('inputs:varname')) {
              // Replace 'token' with 'string' in the key
              const key = prop.key.replace(/^token\s+/, 'string ');
              usda += `${space}    ${key} = ${value}\n`;
              continue;
            }
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
          // Quote sourceColorSpace values
          value = JSON.stringify(attr.value);
        } else if (attr.key.includes("wrapS") || attr.key.includes("wrapT")) {
          // Quote wrapS/wrapT values
          value = JSON.stringify(attr.value);
        } else {
          value = JSON.stringify(attr.value);
        }
        usda += `${space}    token ${attr.key} = ${value}\n`;
      }

      // Add token connections (in node body, without quotes)
      for (const prop of tokenConnections) {
        // Remove quotes from connection paths
        const valueStr = prop.value as string;
        const value = valueStr.replace(/"([^"]+)"/g, '$1');
        // Don't add 'token' prefix if the key already contains 'token'
        const key = prop.key.startsWith('token ') ? prop.key.substring(6) : prop.key;
        usda += `${space}    token ${key} = ${value}\n`;
      }

      // Add rel properties (in node body)
      for (const prop of relProperties) {
        // Check if key already starts with "rel " - if so, remove it to avoid duplicate
        const key = prop.key.startsWith('rel ') ? prop.key.substring(4) : prop.key;

        // Handle arrays for rel properties
        if (Array.isArray(prop.value)) {
          // For rel arrays, format as [<path1>, <path2>, ...]
          const values = (prop.value as string[]).map(v => {
            const valueStr = v as string;
            return valueStr.replace(/"([^"]+)"/g, '$1');
          });
          usda += `${space}    rel ${key} = [${values.join(', ')}]\n`;
        } else {
          // Single rel value
          const valueStr = prop.value as string;
          const value = valueStr.replace(/"([^"]+)"/g, '$1');
          usda += `${space}    rel ${key} = ${value}\n`;
        }
      }

      // Add xformOp properties (translate, orient, scale) - these go in node body
      for (const prop of xformOpProperties) {
        usda += `${space}    ${prop.key} = ${prop.value}\n`;
      }

      // Add transform properties (in node body)
      for (const prop of transformProperties) {
        if (prop.key === "xformOp:transform") {
          usda += `${space}    matrix4d ${prop.key} = ${prop.value}\n`;
        } else if (prop.key === "skel:geomBindTransform") {
          // skel:geomBindTransform is a matrix4d property
          usda += `${space}    matrix4d ${prop.key} = ${prop.value}\n`;
        } else if (prop.key === "xformOpOrder") {
          const value = Array.isArray(prop.value)
            ? `[${prop.value.map(v => JSON.stringify(v)).join(", ")}]`
            : JSON.stringify(prop.value);
          usda += `${space}    uniform token[] ${prop.key} = ${value}\n`;
        }
      }

      // Add time-sampled properties (in node body)
      for (const [key, timeSampleData] of this._timeSamples) {
        const { timeSamples, type } = timeSampleData;
        const sortedTimes = Array.from(timeSamples.keys()).sort((a, b) => a - b);

        if (sortedTimes.length === 0) {
          continue;
        }

        // Log time samples being serialized (especially for SkelAnimation properties)
        if (key.includes('translations') || key.includes('rotations') || key.includes('scales') || this._typeName === 'SkelAnimation') {
          console.log('[UsdNode.serializeToUsda] Serializing time samples:', {
            nodePath: this._path,
            nodeType: this._typeName,
            propertyKey: key,
            propertyType: type,
            timeSampleCount: sortedTimes.length,
            minTimeCode: sortedTimes[0],
            maxTimeCode: sortedTimes[sortedTimes.length - 1],
            first10TimeCodes: sortedTimes.slice(0, 10),
            last10TimeCodes: sortedTimes.slice(-10),
            hasTimeCode0: timeSamples.has(0),
            timeCode0Value: timeSamples.get(0) ? (timeSamples.get(0)!.length > 100 ? timeSamples.get(0)!.substring(0, 100) + '...' : timeSamples.get(0)) : 'N/A'
          });
        }

        // Check if key already includes the type (e.g., 'quatf[] rotations')
        // If so, use it as-is; otherwise add the type prefix
        // Check if key starts with type followed by space, or if key equals type
        const propertyKey = (key.startsWith(type + ' ') || key === type) ? key : `${type} ${key}`;

        if (sortedTimes.length === 1) {
          // Single time sample - use default value syntax
          usda += `${space}    ${propertyKey} = ${timeSamples.get(sortedTimes[0])}\n`;
        } else {
          // Multiple time samples - use .timeSamples attribute syntax
          // For xformOp attributes, the syntax is: float3 xformOp:translate.timeSamples = { ... }
          usda += `${space}    ${propertyKey}.timeSamples = {\n`;

          for (let i = 0; i < sortedTimes.length; i++) {
            const time = sortedTimes[i];
            const value = timeSamples.get(time);
            if (value !== undefined) {
              // Add comma only if not the last item
              const comma = i < sortedTimes.length - 1 ? ',' : '';
              usda += `${space}        ${time}: ${value}${comma}\n`;
            }
          }
          usda += `${space}    }\n`;
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

  /**
   * Get the type name of this node
   */
  getTypeName(): string {
    return this._typeName;
  }

}
