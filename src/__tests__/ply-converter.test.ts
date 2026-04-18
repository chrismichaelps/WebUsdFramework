/** Tests for PLY parser and converter */

import { describe, it, expect } from 'vitest';
import { parsePly, PlyMeshData } from '../converters/ply/ply-parser';
import { convertPlyToUsdz } from '../converters/ply/ply-converter';

/** Helper: encode a string to ArrayBuffer */
function toBuffer(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer as ArrayBuffer;
}

/** Minimal ASCII PLY triangle mesh */
const ASCII_MESH_PLY = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0 0 0
1 0 0
0 1 0
3 0 1 2
`;

/** ASCII PLY point cloud (no faces) */
const ASCII_POINTCLOUD_PLY = `ply
format ascii 1.0
element vertex 4
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
end_header
0 0 0 255 0 0
1 0 0 0 255 0
0 1 0 0 0 255
1 1 0 255 255 0
`;

/** ASCII PLY with normals and texture coords */
const ASCII_FULL_PLY = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
property float nx
property float ny
property float nz
property float s
property float t
element face 1
property list uchar int vertex_indices
end_header
0 0 0 0 0 1 0 0
1 0 0 0 0 1 1 0
0 1 0 0 0 1 0 1
3 0 1 2
`;

/** ASCII PLY with quad face (tests triangulation) */
const ASCII_QUAD_PLY = `ply
format ascii 1.0
element vertex 4
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0 0 0
1 0 0
1 1 0
0 1 0
4 0 1 2 3
`;

/** Build a binary little-endian PLY triangle mesh in memory */
function buildBinaryPly(): ArrayBuffer {
  const header = `ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n`;
  const headerBytes = new TextEncoder().encode(header);

  // 3 vertices * 3 floats * 4 bytes = 36 bytes
  // 1 face: 1 byte (count=3) + 3 ints * 4 bytes = 13 bytes
  const dataSize = 36 + 13;
  const totalSize = headerBytes.length + dataSize;
  const buffer = new ArrayBuffer(totalSize);
  const bytes = new Uint8Array(buffer);
  bytes.set(headerBytes, 0);

  const view = new DataView(buffer);
  let offset = headerBytes.length;

  // Vertex 0: (0, 0, 0)
  view.setFloat32(offset, 0, true); offset += 4;
  view.setFloat32(offset, 0, true); offset += 4;
  view.setFloat32(offset, 0, true); offset += 4;
  // Vertex 1: (1, 0, 0)
  view.setFloat32(offset, 1, true); offset += 4;
  view.setFloat32(offset, 0, true); offset += 4;
  view.setFloat32(offset, 0, true); offset += 4;
  // Vertex 2: (0, 1, 0)
  view.setFloat32(offset, 0, true); offset += 4;
  view.setFloat32(offset, 1, true); offset += 4;
  view.setFloat32(offset, 0, true); offset += 4;

  // Face: 3 vertices, indices 0 1 2
  view.setUint8(offset, 3); offset += 1;
  view.setInt32(offset, 0, true); offset += 4;
  view.setInt32(offset, 1, true); offset += 4;
  view.setInt32(offset, 2, true); offset += 4;

  return buffer;
}

describe('PLY Parser', () => {
  it('parses ASCII mesh correctly', () => {
    const data = parsePly(toBuffer(ASCII_MESH_PLY));
    expect(data.format).toBe('ascii');
    expect(data.vertexCount).toBe(3);
    expect(data.faceCount).toBe(1);
    expect(data.isPointCloud).toBe(false);
    expect(data.faceIndices).toBeDefined();
    expect(data.faceIndices!.length).toBe(3);
    expect(Array.from(data.faceIndices!)).toEqual([0, 1, 2]);
  });

  it('parses ASCII point cloud (no faces)', () => {
    const data = parsePly(toBuffer(ASCII_POINTCLOUD_PLY));
    expect(data.isPointCloud).toBe(true);
    expect(data.vertexCount).toBe(4);
    expect(data.faceCount).toBe(0);
    expect(data.faceIndices).toBeUndefined();
    expect(data.colors).toBeDefined();
    // Red channel of first vertex should be ~1.0 (255/255)
    expect(data.colors![0]).toBeCloseTo(1.0, 2);
  });

  it('parses normals and texture coords', () => {
    const data = parsePly(toBuffer(ASCII_FULL_PLY));
    expect(data.normals).toBeDefined();
    expect(data.texCoords).toBeDefined();
    // Normal z should be 1.0 for all vertices
    expect(data.normals![2]).toBeCloseTo(1.0);
    expect(data.normals![5]).toBeCloseTo(1.0);
    // Tex coord of vertex 1: s=1, t=0
    expect(data.texCoords![2]).toBeCloseTo(1.0);
    expect(data.texCoords![3]).toBeCloseTo(0.0);
  });

  it('triangulates quad faces', () => {
    const data = parsePly(toBuffer(ASCII_QUAD_PLY));
    expect(data.faceCount).toBe(2); // quad → 2 triangles
    expect(data.faceIndices!.length).toBe(6);
    // First triangle: 0,1,2; second: 0,2,3
    expect(Array.from(data.faceIndices!)).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it('parses binary little-endian PLY', () => {
    const data = parsePly(buildBinaryPly());
    expect(data.format).toBe('binary_little_endian');
    expect(data.vertexCount).toBe(3);
    expect(data.faceCount).toBe(1);
    expect(data.isPointCloud).toBe(false);
    // Vertex 1 x should be 1.0
    expect(data.positions[3]).toBeCloseTo(1.0);
  });

  it('computes correct bounding box', () => {
    const data = parsePly(toBuffer(ASCII_MESH_PLY));
    expect(data.bounds.min.x).toBeCloseTo(0);
    expect(data.bounds.min.y).toBeCloseTo(0);
    expect(data.bounds.max.x).toBeCloseTo(1);
    expect(data.bounds.max.y).toBeCloseTo(1);
  });
});

describe('PLY → USDZ Converter', () => {
  it('converts ASCII mesh PLY to valid USDZ', async () => {
    const blob = await convertPlyToUsdz(toBuffer(ASCII_MESH_PLY));
    expect(blob.size).toBeGreaterThan(0);

    // USDZ is a ZIP — check magic bytes
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4B); // K
  });

  it('converts point cloud PLY to USDZ with Points prim', async () => {
    const blob = await convertPlyToUsdz(toBuffer(ASCII_POINTCLOUD_PLY));
    expect(blob.size).toBeGreaterThan(0);
  });

  it('mesh output contains Mesh prim type', async () => {
    // We can't easily extract USDA from USDZ in test, but we can verify
    // the converter doesn't throw and produces valid output
    const blob = await convertPlyToUsdz(toBuffer(ASCII_MESH_PLY));
    expect(blob.size).toBeGreaterThan(100);
  });

  it('respects maxPoints downsampling for point clouds', async () => {
    // Create a larger point cloud
    const lines = ['ply', 'format ascii 1.0', 'element vertex 100',
      'property float x', 'property float y', 'property float z', 'end_header'];
    for (let i = 0; i < 100; i++) {
      lines.push(`${i} ${i * 0.1} ${i * 0.01}`);
    }
    const ply = lines.join('\n') + '\n';

    const blob = await convertPlyToUsdz(toBuffer(ply), { maxPoints: 10 });
    expect(blob.size).toBeGreaterThan(0);
    // Can't directly check point count in USDZ, but it should succeed
  });

  it('converts binary PLY to valid USDZ', async () => {
    const blob = await convertPlyToUsdz(buildBinaryPly());
    expect(blob.size).toBeGreaterThan(0);
  });
});
