/**
 * USD Material Builder
 * 
 * Creates USD materials from GLTF materials.
 * Handles textures and PBR properties.
 */

import { Material, Texture } from '@gltf-transform/core';
import { UsdNode } from '../core/usd-node';

/**
 * Texture reference info
 */
export interface TextureReference {
  /** Texture object from GLTF */
  texture: Texture;
  /** Unique texture identifier */
  id: string;
  /** Texture usage type */
  type: 'diffuse' | 'normal' | 'metallicRoughness';
}

/**
 * Material build result
 */
export interface MaterialBuildResult {
  /** USD material node */
  materialNode: UsdNode;
  /** List of textures used by this material */
  textures: TextureReference[];
}

/**
 * Build USD material from GLTF material
 */
export function buildUsdMaterial(
  material: Material,
  materialIndex: number,
  materialsPath: string = '/Materials'
): MaterialBuildResult {
  const materialName = sanitizeName(material.getName() || `Material_${materialIndex}`);
  const materialPath = `${materialsPath}/${materialName}`;

  // Create material node
  const materialNode = new UsdNode(materialPath, 'Material');

  const textures: TextureReference[] = [];

  // Create PreviewSurface shader
  const surfaceShader = new UsdNode(`${materialPath}/PreviewSurface`, 'Shader');
  surfaceShader.setProperty('uniform token info:id', 'UsdPreviewSurface');

  // Process base color
  const baseColorTexture = material.getBaseColorTexture();
  const normalTexture = material.getNormalTexture();

  if (baseColorTexture) {
    // Only create diffuse texture if base color texture exists
    const textureId = `${materialIndex}_false`;
    const textureNodeName = `Texture_${textureId}`;
    textures.push({
      texture: baseColorTexture,
      id: textureId,
      type: 'diffuse'
    });

    // Create texture shader network for base color
    const { textureShader, uvReader } = createTextureShaderNetwork(
      materialPath,
      textureId,
      textureNodeName,
      false
    );

    materialNode.addChild(textureShader);
    materialNode.addChild(uvReader);

    // Connect to PreviewSurface
    surfaceShader.setProperty(
      'color3f inputs:diffuseColor.connect',
      `<${materialPath}/${textureNodeName}.outputs:rgb>`,
      'connection'
    );
  } else {
    // Use solid base color factor
    const baseColorFactor = material.getBaseColorFactor();
    if (baseColorFactor) {
      const [r, g, b] = baseColorFactor;
      surfaceShader.setProperty(
        'color3f inputs:diffuseColor',
        `(${r}, ${g}, ${b})`
      );
    }
  }

  // Process normal map
  if (normalTexture) {
    const textureId = `${materialIndex}_normal`;
    const textureNodeName = `Texture_${textureId}`;
    textures.push({
      texture: normalTexture,
      id: textureId,
      type: 'normal'
    });

    // Create texture shader network for normal map
    const { textureShader, uvReader } = createTextureShaderNetwork(
      materialPath,
      textureId,
      textureNodeName,
      true
    );

    materialNode.addChild(textureShader);
    materialNode.addChild(uvReader);

    // Connect to PreviewSurface via normal input
    surfaceShader.setProperty(
      'normal3f inputs:normal.connect',
      `<${materialPath}/${textureNodeName}.outputs:rgb>`,
      'connection'
    );
  }

  // Process metallic and roughness (always add these for consistency)
  const metallicFactor = material.getMetallicFactor();
  surfaceShader.setProperty('float inputs:metallic', (metallicFactor ?? 1.0).toString(), 'float');

  const roughnessFactor = material.getRoughnessFactor();
  surfaceShader.setProperty('float inputs:roughness', (roughnessFactor ?? 0.5).toString(), 'float');

  // Add standard PBR properties
  surfaceShader.setProperty('float inputs:opacity', '1', 'float');
  surfaceShader.setProperty('int inputs:useSpecularWorkflow', '0', 'int');

  // Add surface shader to material
  materialNode.addChild(surfaceShader);

  // Connect material output to surface shader
  materialNode.setProperty(
    'outputs:surface.connect',
    `<${materialPath}/PreviewSurface.outputs:surface>`,
    'token'
  );

  return {
    materialNode,
    textures
  };
}

/**
 * Create texture shader network
 */
function createTextureShaderNetwork(
  materialPath: string,
  textureId: string,
  textureNodeName: string,
  isNormalMap: boolean
): { textureShader: UsdNode; uvReader: UsdNode } {
  // Create UV reader
  const uvReader = new UsdNode(`${materialPath}/uvReader_st`, 'Shader');
  uvReader.setProperty('uniform token info:id', 'UsdPrimvarReader_float2');
  uvReader.setProperty('string inputs:varname', 'st', 'string');
  uvReader.setProperty('float2 outputs:result', '');

  // Create texture shader
  const textureShader = new UsdNode(`${materialPath}/${textureNodeName}`, 'Shader');
  textureShader.setProperty('uniform token info:id', 'UsdUVTexture');
  textureShader.setProperty('asset inputs:file', `@./textures/Texture_${textureId}.png@`, 'asset');

  // Normal maps need raw color space, diffuse textures should not specify it (defaults to auto/sRGB)
  if (isNormalMap) {
    textureShader.setProperty('token inputs:sourceColorSpace', 'raw', 'token');
  }

  textureShader.setProperty('token inputs:wrapS', 'repeat', 'token');
  textureShader.setProperty('token inputs:wrapT', 'repeat', 'token');

  // Connect UV reader to texture
  textureShader.setProperty(
    'float2 inputs:st.connect',
    `<${materialPath}/uvReader_st.outputs:result>`,
    'connection'
  );

  // Normal maps need bias and scale for [-1, 1] range
  if (isNormalMap) {
    textureShader.setProperty('float4 inputs:scale', '(2, 2, 2, 2)', 'float4');
    textureShader.setProperty('float4 inputs:bias', '(-1, -1, -1, -1)', 'float4');
  }

  textureShader.setProperty('float3 outputs:rgb', '');

  return { textureShader, uvReader };
}

/**
 * Sanitize name for USD paths
 */
function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_');
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

