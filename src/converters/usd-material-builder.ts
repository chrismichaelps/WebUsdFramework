/**
 * USD Material Builder
 * 
 * Creates USD materials from GLTF materials.
 * Handles textures and PBR properties.
 */

import { Material, Texture, Primitive } from '@gltf-transform/core';
import { UsdNode } from '../core/usd-node';
import { sanitizeName } from '../utils/name-utils';
import { bakeVertexColorsToTexture } from './helpers/vertex-color-baker';

/**
 * Texture reference info
 */
export interface TextureReference {
  /** Texture object from GLTF (optional for baked textures) */
  texture?: Texture;
  /** Unique texture identifier */
  id: string;
  /** Texture usage type */
  type: 'diffuse' | 'normal' | 'metallicRoughness' | 'emissive' | 'occlusion';
  /** UV set index for this texture */
  uvSet: number;
  /** Texture transform info */
  transform?: {
    offset: [number, number];
    scale: [number, number];
    rotation: number;
  } | undefined;
  /** Baked texture data (for vertex color textures) */
  textureData?: ArrayBuffer;
}

/**
 * Material build result
 */
export interface MaterialBuildResult {
  /** USD material node */
  materialNode: UsdNode;
  /** List of textures used by this material */
  textures: TextureReference[];
  /** UV readers created for this material */
  uvReaders: UsdNode[];
  /** Transform2d nodes created for this material */
  transform2dNodes: UsdNode[];
}

/**
 * Optimized texture mapping configuration
 */
interface TextureMappingConfig {
  /** UV set index */
  uvSet: number;
  /** Texture transform */
  transform?: {
    offset: [number, number];
    scale: [number, number];
    rotation: number;
  };
  /** Texture wrapping mode */
  wrapMode: 'repeat' | 'clamp' | 'mirror';
}

/**
 * Build USD material from GLTF material
 * @param primitive - Optional primitive to check for vertex colors and bake them to textures
 */
export async function buildUsdMaterial(
  material: Material,
  materialIndex: number,
  materialsPath: string,
  primitive?: Primitive
): Promise<MaterialBuildResult> {
  const materialName = sanitizeName(material.getName() || `Material_${materialIndex}`);
  const materialPath = `${materialsPath}/${materialName}`;

  // Create material node
  const materialNode = new UsdNode(materialPath, 'Material');

  const textures: TextureReference[] = [];

  // Create shared UV reader and Transform2d node for the material
  const uvReader = new UsdNode(`${materialPath}/PrimvarReader_diffuse`, 'Shader');
  uvReader.setProperty('uniform token info:id', 'UsdPrimvarReader_float2');
  uvReader.setProperty('float2 inputs:fallback', '(0, 0)', 'float2');
  uvReader.setProperty('string inputs:varname', 'st', 'string');
  uvReader.setProperty('float2 outputs:result', '');

  const transform2d = new UsdNode(`${materialPath}/Transform2d_diffuse`, 'Shader');
  transform2d.setProperty('uniform token info:id', 'UsdTransform2d');
  transform2d.setProperty('float2 inputs:in.connect', `<${materialPath}/PrimvarReader_diffuse.outputs:result>`, 'float2');
  transform2d.setProperty('float inputs:rotation', '0', 'float');
  transform2d.setProperty('float2 inputs:scale', '(1, 1)', 'float2');
  transform2d.setProperty('float2 inputs:translation', '(0, 0)', 'float2');
  transform2d.setProperty('float2 outputs:result', '');

  // Create PreviewSurface shader
  const surfaceShader = new UsdNode(`${materialPath}/PreviewSurface`, 'Shader');
  surfaceShader.setProperty('uniform token info:id', 'UsdPreviewSurface');

  // Process base color with optimized mapping
  const baseColorTexture = material.getBaseColorTexture();
  const normalTexture = material.getNormalTexture();

  // Log texture availability for debugging
  console.log(`[buildUsdMaterial] Material: ${materialName}`, {
    hasBaseColorTexture: !!baseColorTexture,
    hasNormalTexture: !!normalTexture,
    hasMetallicRoughnessTexture: !!material.getMetallicRoughnessTexture(),
    hasEmissiveTexture: !!material.getEmissiveTexture(),
    hasOcclusionTexture: !!material.getOcclusionTexture()
  });

  // Check if primitive has vertex colors that should be baked to texture
  const hasVertexColors = primitive?.getAttribute('COLOR_0') !== null;
  const hasUVs = primitive?.getAttribute('TEXCOORD_0') !== null;
  const shouldBakeVertexColors = hasVertexColors && hasUVs && !baseColorTexture && primitive !== undefined;

  // Try to bake vertex colors to texture for better USDZ compatibility
  let bakedVertexColorTexture: { textureId: string; textureData: ArrayBuffer } | null = null;
  if (shouldBakeVertexColors && primitive) {
    try {
      const bakeResult = await bakeVertexColorsToTexture(primitive, {
        resolution: 2048,
        highQuality: true
      });
      bakedVertexColorTexture = {
        textureId: bakeResult.textureId,
        textureData: bakeResult.textureData
      };
      console.log(`[buildUsdMaterial] Baked vertex colors to texture: ${bakeResult.textureId}`);
    } catch (error) {
      console.warn(`[buildUsdMaterial] Failed to bake vertex colors: ${error instanceof Error ? error.message : String(error)}`);
      // Fall back to PrimvarReader if baking fails
    }
  }

  if (baseColorTexture) {
    const textureId = await generateTextureId(baseColorTexture, 'diffuse');
    const textureNodeName = `Texture_${textureId}`;
    const uvSet = getTextureUVSet(material, 'baseColor');

    textures.push({
      texture: baseColorTexture,
      id: textureId,
      type: 'diffuse',
      uvSet,
      transform: getTextureTransform(material, 'baseColor')
    });

    // Create optimized texture shader network
    const textureShader = createOptimizedTextureShader(
      materialPath,
      textureId,
      textureNodeName,
      false,
      baseColorTexture
    );

    materialNode.addChild(textureShader);

    // Connect to PreviewSurface
    surfaceShader.setProperty(
      'color3f inputs:diffuseColor.connect',
      `<${materialPath}/${textureNodeName}.outputs:rgb>`,
      'connection'
    );
  } else if (bakedVertexColorTexture) {
    // Use baked vertex color texture - connect directly to PrimvarReader
    // UVs are already normalized and flipped during baking
    const textureId = bakedVertexColorTexture.textureId;
    const textureNodeName = `Texture_${textureId}`;
    const uvSet = 0; // Use first UV set for baked textures

    textures.push({
      id: textureId,
      type: 'diffuse',
      uvSet,
      textureData: bakedVertexColorTexture.textureData
    });

    // Create texture shader for baked vertex color texture
    const textureShader = new UsdNode(`${materialPath}/${textureNodeName}`, 'Shader');
    textureShader.setProperty('uniform token info:id', 'UsdUVTexture');
    textureShader.setProperty('asset inputs:file', `@textures/Texture_${textureId}.png@`, 'asset');
    textureShader.setProperty('token inputs:sourceColorSpace', 'sRGB', 'token');
    textureShader.setProperty('token inputs:wrapS', 'repeat', 'token');
    textureShader.setProperty('token inputs:wrapT', 'repeat', 'token');
    textureShader.setProperty('float4 inputs:scale', '(1, 1, 1, 1)', 'float4');
    textureShader.setProperty('float outputs:r', '');
    textureShader.setProperty('float outputs:g', '');
    textureShader.setProperty('float outputs:b', '');
    textureShader.setProperty('float outputs:a', '');
    textureShader.setProperty('float3 outputs:rgb', '');

    // Connect directly to PrimvarReader - no Transform2d needed since UVs are pre-processed
    // Use 'connection' type for proper shader connection
    textureShader.setProperty(
      'float2 inputs:st.connect',
      `<${materialPath}/PrimvarReader_diffuse.outputs:result>`,
      'connection'
    );

    materialNode.addChild(textureShader);

    // Connect to PreviewSurface
    surfaceShader.setProperty(
      'color3f inputs:diffuseColor.connect',
      `<${materialPath}/${textureNodeName}.outputs:rgb>`,
      'connection'
    );
  } else {
    // Use solid base color factor or PrimvarReader as fallback
    const baseColorFactor = material.getBaseColorFactor();
    if (baseColorFactor) {
      const [r, g, b] = baseColorFactor;
      const isWhite = Math.abs(r - 1.0) < 0.001 && Math.abs(g - 1.0) < 0.001 && Math.abs(b - 1.0) < 0.001;

      if (isWhite && hasVertexColors) {
        // If baseColorFactor is white and we have vertex colors, try PrimvarReader as fallback
        // Note: This may not work in all USDZ viewers, but it's better than nothing
        const displayColorReader = new UsdNode(`${materialPath}/PrimvarReader_displayColor`, 'Shader');
        displayColorReader.setProperty('uniform token info:id', 'UsdPrimvarReader_float3');
        displayColorReader.setProperty('float3 inputs:fallback', '(1, 1, 1)', 'float3');
        displayColorReader.setProperty('string inputs:varname', 'displayColor', 'string');
        displayColorReader.setProperty('float3 outputs:result', '');

        materialNode.addChild(displayColorReader);

        surfaceShader.setProperty(
          'color3f inputs:diffuseColor.connect',
          `<${materialPath}/PrimvarReader_displayColor.outputs:result>`,
          'connection'
        );
      } else {
        // If not white, use the baseColorFactor directly
        surfaceShader.setProperty(
          'color3f inputs:diffuseColor',
          `(${r}, ${g}, ${b})`
        );
      }
    } else if (hasVertexColors) {
      // No baseColorFactor but we have vertex colors - use PrimvarReader as fallback
      const displayColorReader = new UsdNode(`${materialPath}/PrimvarReader_displayColor`, 'Shader');
      displayColorReader.setProperty('uniform token info:id', 'UsdPrimvarReader_float3');
      displayColorReader.setProperty('float3 inputs:fallback', '(1, 1, 1)', 'float3');
      displayColorReader.setProperty('string inputs:varname', 'displayColor', 'string');
      displayColorReader.setProperty('float3 outputs:result', '');

      materialNode.addChild(displayColorReader);

      surfaceShader.setProperty(
        'color3f inputs:diffuseColor.connect',
        `<${materialPath}/PrimvarReader_displayColor.outputs:result>`,
        'connection'
      );
    } else {
      // No base color at all - use default white
      surfaceShader.setProperty(
        'color3f inputs:diffuseColor',
        '(1, 1, 1)'
      );
    }
  }

  // Process normal map with optimized mapping
  if (normalTexture) {
    const textureId = await generateTextureId(normalTexture, 'normal');
    const textureNodeName = `Texture_${textureId}`;
    const uvSet = getTextureUVSet(material, 'normal');

    textures.push({
      texture: normalTexture,
      id: textureId,
      type: 'normal',
      uvSet,
      transform: getTextureTransform(material, 'normal')
    });

    // Create optimized texture shader network for normal map
    const textureShader = createOptimizedTextureShader(
      materialPath,
      textureId,
      textureNodeName,
      true,
      normalTexture
    );

    materialNode.addChild(textureShader);

    // Connect to PreviewSurface via normal input
    surfaceShader.setProperty(
      'normal3f inputs:normal.connect',
      `<${materialPath}/${textureNodeName}.outputs:rgb>`,
      'connection'
    );
  }

  // Process emissive texture with optimized mapping
  const emissiveTexture = material.getEmissiveTexture();
  if (emissiveTexture) {
    const textureId = await generateTextureId(emissiveTexture, 'emissive');
    const textureNodeName = `Texture_${textureId}`;
    const uvSet = getTextureUVSet(material, 'emissive');

    textures.push({
      texture: emissiveTexture,
      id: textureId,
      type: 'emissive',
      uvSet,
      transform: getTextureTransform(material, 'emissive')
    });

    // Create optimized texture shader network for emissive
    const textureShader = createOptimizedTextureShader(
      materialPath,
      textureId,
      textureNodeName,
      false,
      emissiveTexture
    );

    materialNode.addChild(textureShader);

    // Connect to PreviewSurface
    surfaceShader.setProperty(
      'color3f inputs:emissiveColor.connect',
      `<${materialPath}/${textureNodeName}.outputs:rgb>`,
      'connection'
    );
  } else {
    // Use emissive factor if no texture
    const emissiveFactor = material.getEmissiveFactor();
    if (emissiveFactor && (emissiveFactor[0] > 0 || emissiveFactor[1] > 0 || emissiveFactor[2] > 0)) {
      surfaceShader.setProperty(
        'color3f inputs:emissiveColor',
        `(${emissiveFactor[0]}, ${emissiveFactor[1]}, ${emissiveFactor[2]})`
      );
    }
  }

  // Process occlusion texture with optimized mapping
  const occlusionTexture = material.getOcclusionTexture();
  if (occlusionTexture) {
    const textureId = await generateTextureId(occlusionTexture, 'occlusion');
    const textureNodeName = `Texture_${textureId}`;
    const uvSet = getTextureUVSet(material, 'occlusion');

    textures.push({
      texture: occlusionTexture,
      id: textureId,
      type: 'occlusion',
      uvSet,
      transform: getTextureTransform(material, 'occlusion')
    });

    // Create optimized texture shader network for occlusion
    const textureShader = createOptimizedTextureShader(
      materialPath,
      textureId,
      textureNodeName,
      false,
      occlusionTexture
    );

    materialNode.addChild(textureShader);

    // Connect to PreviewSurface via occlusion input
    surfaceShader.setProperty(
      'float inputs:occlusion.connect',
      `<${materialPath}/${textureNodeName}.outputs:r>`,
      'connection'
    );
  }

  // Process metallic/roughness texture with optimized mapping
  const metallicRoughnessTexture = material.getMetallicRoughnessTexture();
  if (metallicRoughnessTexture) {
    const textureId = await generateTextureId(metallicRoughnessTexture, 'metallicRoughness');
    const textureNodeName = `Texture_${textureId}`;
    const uvSet = getTextureUVSet(material, 'metallicRoughness');

    textures.push({
      texture: metallicRoughnessTexture,
      id: textureId,
      type: 'metallicRoughness',
      uvSet,
      transform: getTextureTransform(material, 'metallicRoughness')
    });

    // Create optimized texture shader network for metallic/roughness
    const textureShader = createOptimizedTextureShader(
      materialPath,
      textureId,
      textureNodeName,
      false,
      metallicRoughnessTexture
    );

    materialNode.addChild(textureShader);

    // Connect metallic and roughness channels (correct channel mapping)
    surfaceShader.setProperty(
      'float inputs:metallic.connect',
      `<${materialPath}/${textureNodeName}.outputs:b>`,
      'connection'
    );
    surfaceShader.setProperty(
      'float inputs:roughness.connect',
      `<${materialPath}/${textureNodeName}.outputs:g>`,
      'connection'
    );
  } else {
    // Process metallic and roughness factors (only if no texture)
    const metallicFactor = material.getMetallicFactor();
    surfaceShader.setProperty('float inputs:metallic', (metallicFactor ?? 0.0).toString(), 'float');

    const roughnessFactor = material.getRoughnessFactor();
    surfaceShader.setProperty('float inputs:roughness', (roughnessFactor ?? 0.5).toString(), 'float');
  }

  // Add standard PBR properties
  surfaceShader.setProperty('float inputs:opacity', '1', 'float');
  surfaceShader.setProperty('int inputs:useSpecularWorkflow', '0', 'int');

  // Add outputs:surface declaration - required for rendering
  surfaceShader.setProperty('token outputs:surface', '');

  // Add shared UV reader and Transform2d nodes to material
  materialNode.addChild(uvReader);
  materialNode.addChild(transform2d);

  // Add surface shader to material
  materialNode.addChild(surfaceShader);

  // Connect material output to surface shader
  materialNode.setProperty(
    'token outputs:surface.connect',
    `<${materialPath}/PreviewSurface.outputs:surface>`,
    'connection'
  );

  return {
    materialNode,
    textures,
    uvReaders: [uvReader],
    transform2dNodes: [transform2d]
  };
}


/**
 * Get UV set index for texture based on material's texture info
 */
function getTextureUVSet(material: Material, textureType: 'baseColor' | 'normal' | 'emissive' | 'occlusion' | 'metallicRoughness'): number {
  let textureInfo = null;

  switch (textureType) {
    case 'baseColor':
      textureInfo = material.getBaseColorTextureInfo();
      break;
    case 'normal':
      textureInfo = material.getNormalTextureInfo();
      break;
    case 'emissive':
      textureInfo = material.getEmissiveTextureInfo();
      break;
    case 'occlusion':
      textureInfo = material.getOcclusionTextureInfo();
      break;
    case 'metallicRoughness':
      textureInfo = material.getMetallicRoughnessTextureInfo();
      break;
  }

  if (textureInfo) {
    const texCoord = textureInfo.getTexCoord();
    return texCoord;
  }
  // Default to UV set 0
  return 0;
}

/**
 * Get texture transform information from material's texture info
 */
function getTextureTransform(material: Material, textureType: 'baseColor' | 'normal' | 'emissive' | 'occlusion' | 'metallicRoughness'): TextureMappingConfig['transform'] | undefined {
  let textureInfo = null;

  switch (textureType) {
    case 'baseColor':
      textureInfo = material.getBaseColorTextureInfo();
      break;
    case 'normal':
      textureInfo = material.getNormalTextureInfo();
      break;
    case 'emissive':
      textureInfo = material.getEmissiveTextureInfo();
      break;
    case 'occlusion':
      textureInfo = material.getOcclusionTextureInfo();
      break;
    case 'metallicRoughness':
      textureInfo = material.getMetallicRoughnessTextureInfo();
      break;
  }

  if (!textureInfo) return undefined;

  // GLTF-Transform TextureInfo doesn't have getOffset/getScale/getRotation methods
  // These would need to be handled through extensions or custom logic
  // For now, return undefined to use default transforms
  return undefined;
}

/**
 * Create texture shader with shared UV reader and Transform2d for optimal USDZ compatibility
 */
function createOptimizedTextureShader(
  materialPath: string,
  textureId: string,
  textureNodeName: string,
  isNormalMap: boolean,
  texture: Texture
): UsdNode {
  // Use shared Transform2d for optimal USDZ compatibility

  // Create texture shader
  const textureShader = new UsdNode(`${materialPath}/${textureNodeName}`, 'Shader');
  textureShader.setProperty('uniform token info:id', 'UsdUVTexture');

  // Detect the correct file extension based on texture data
  const textureExtension = getTextureExtension(texture);
  textureShader.setProperty('asset inputs:file', `@textures/Texture_${textureId}.${textureExtension}@`, 'asset');

  // Set color space based on texture type
  if (isNormalMap) {
    textureShader.setProperty('token inputs:sourceColorSpace', 'raw', 'token');
  } else {
    textureShader.setProperty('token inputs:sourceColorSpace', 'sRGB', 'token');
  }

  // Set wrapping mode
  textureShader.setProperty('token inputs:wrapS', 'repeat', 'token');
  textureShader.setProperty('token inputs:wrapT', 'repeat', 'token');

  // Connect to shared Transform2d for optimal USDZ compatibility
  const transformConnection = `<${materialPath}/Transform2d_diffuse.outputs:result>`;
  textureShader.setProperty(
    'float2 inputs:st.connect',
    transformConnection,
    'token'
  );

  // Add scale and bias based on texture type
  if (isNormalMap) {
    // Normal maps require specific bias and scale values for USD compliance
    // USD standard: bias=(-1, -1, -1, 0), scale=(2, 2, 2, 1) for 8-bit normal maps
    textureShader.setProperty('float4 inputs:scale', '(2, 2, 2, 1)', 'float4');
    textureShader.setProperty('float4 inputs:bias', '(-1, -1, -1, 0)', 'float4');
  } else {
    // Regular textures use default scale
    textureShader.setProperty('float4 inputs:scale', '(1, 1, 1, 1)', 'float4');
  }

  // Add outputs for individual channels and RGB
  textureShader.setProperty('float outputs:r', '');
  textureShader.setProperty('float outputs:g', '');
  textureShader.setProperty('float outputs:b', '');
  textureShader.setProperty('float3 outputs:rgb', '');

  return textureShader;
}

/**
 * Extract texture data as ArrayBuffer
 */
export async function extractTextureData(texture: Texture): Promise<ArrayBuffer> {
  const image = texture.getImage();
  if (!image) {
    throw new Error(`Texture has no image data`);
  }

  // Image data is already in PNG/JPEG format from GLTF
  // Convert ArrayBufferLike to ArrayBuffer
  return image.buffer as ArrayBuffer;
}

/**
 * Get the correct file extension for a texture based on its data
 */
function getTextureExtension(texture: Texture): string {
  const image = texture.getImage();
  if (!image) {
    return 'png'; // Default fallback
  }

  const buffer = image.buffer as ArrayBuffer;
  const uint8Array = new Uint8Array(buffer);

  // Check for JPEG magic bytes (FF D8 FF)
  if (uint8Array.length >= 3 && uint8Array[0] === 0xFF && uint8Array[1] === 0xD8 && uint8Array[2] === 0xFF) {
    return 'jpg';
  }

  // Check for PNG magic bytes (89 50 4E 47 0D 0A 1A 0A)
  if (uint8Array.length >= 8 &&
    uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4E && uint8Array[3] === 0x47 &&
    uint8Array[4] === 0x0D && uint8Array[5] === 0x0A && uint8Array[6] === 0x1A && uint8Array[7] === 0x0A) {
    return 'png';
  }

  // Default to PNG if format is not recognized
  return 'png';
}

/**
 * Generate a unique texture ID based on texture data hash and type
 */
async function generateTextureId(texture: Texture, type: string): Promise<string> {
  const image = texture.getImage();
  if (!image) {
    throw new Error(`Texture has no image data`);
  }

  const buffer = image.buffer as ArrayBuffer;

  // Create a simple hash from the texture data
  const uint8Array = new Uint8Array(buffer);
  let hash = 0;
  const step = Math.max(1, Math.floor(uint8Array.length / 1000)); // Sample every nth byte for performance

  for (let i = 0; i < uint8Array.length; i += step) {
    hash = ((hash << 5) - hash + uint8Array[i]) & 0xffffffff;
  }

  // Convert to positive hex string and take first 8 characters
  const hashStr = Math.abs(hash).toString(16).substring(0, 8);

  return `${hashStr}_${type}`;
}

/**
 * Build materials node for optimal USDZ compatibility
 */
export function buildMaterialsNode(materials: any): UsdNode {
  const materialsNode = new UsdNode('/Root/Materials', 'Scope');

  for (const materialId in materials) {
    const material = materials[materialId];
    const materialName = material.name || `Material_${materialId}`;
    const materialPath = `/Root/Materials/${materialName}`;

    // Create material node
    const materialNode = new UsdNode(materialPath, 'Material');

    // Create PreviewSurface shader
    const surfaceShader = new UsdNode(`${materialPath}/PreviewSurface`, 'Shader');
    surfaceShader.setProperty('uniform token info:id', 'UsdPreviewSurface');

    // Set base material properties
    if (material.color) {
      const color = material.color;
      surfaceShader.setProperty('color3f inputs:diffuseColor', `(${color.r}, ${color.g}, ${color.b})`, 'color3f');
    }

    if (material.metalness !== undefined) {
      surfaceShader.setProperty('float inputs:metallic', material.metalness.toString(), 'float');
    }

    if (material.roughness !== undefined) {
      surfaceShader.setProperty('float inputs:roughness', material.roughness.toString(), 'float');
    }

    if (material.emissive) {
      const emissive = material.emissive;
      surfaceShader.setProperty('color3f inputs:emissiveColor', `(${emissive.r}, ${emissive.g}, ${emissive.b})`, 'color3f');
    }

    // Set opacity
    if (material.transparent && material.opacity !== undefined) {
      surfaceShader.setProperty('float inputs:opacity', material.opacity.toString(), 'float');
    } else {
      surfaceShader.setProperty('float inputs:opacity', '1', 'float');
    }

    // Add surface shader to material
    materialNode.addChild(surfaceShader);

    // Connect material output to surface shader
    materialNode.setProperty(
      'token outputs:surface.connect',
      `<${materialPath}/PreviewSurface.outputs:surface>`,
      'connection'
    );

    // Add material to materials node
    materialsNode.addChild(materialNode);
  }

  return materialsNode;
}

