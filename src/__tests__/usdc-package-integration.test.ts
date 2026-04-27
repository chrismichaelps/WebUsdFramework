/**
 * End-to-end tests for the layerFormat: 'usdc' option through the packaging
 * pipeline.
 *
 * The packager honors `config.layerFormat`:
 *   - 'usda' (default)  → emits the root layer as text (`model.usda`).
 *   - 'usdc'            → tries to emit the root layer as binary
 *                          (`model.usdc`) using the UsdNode → USDC adapter.
 *                          Falls back to USDA when the source tree was not
 *                          provided OR contains properties the adapter can't
 *                          encode yet.
 *
 * These tests cover both branches plus the fallback safety net.
 */
import { describe, it, expect } from 'vitest';
import { UsdNode } from '../core/usd-node';
import {
  createUsdzPackage,
  type PackageContent,
} from '../converters/shared/usd-packaging';

/** Read every file inside a USDZ blob and return their names. */
async function readArchiveNames(blob: Blob): Promise<string[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const names: string[] = [];
  let cursor = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (cursor + 4 <= bytes.length) {
    const sig = view.getUint32(cursor, true);
    if (sig !== 0x04034b50) break; // PK\3\4 — local file header
    const nameLen = view.getUint16(cursor + 26, true);
    const extraLen = view.getUint16(cursor + 28, true);
    const compressedSize = view.getUint32(cursor + 18, true);
    const name = new TextDecoder().decode(
      bytes.subarray(cursor + 30, cursor + 30 + nameLen)
    );
    names.push(name);
    cursor += 30 + nameLen + extraLen + compressedSize;
  }
  return names;
}

function basicContent(): PackageContent {
  return {
    usdContent: '#usda 1.0\n(\n  defaultPrim = "Root"\n)\n\ndef Xform "Root" {}\n',
    geometryFiles: new Map(),
    textureFiles: new Map(),
  };
}

function basicTree(): UsdNode {
  // A tree the adapter can fully encode.
  const root = new UsdNode('/Root', 'Xform');
  const mesh = new UsdNode('/Root/Mesh', 'Mesh');
  mesh.setProperty('point3f[] points', new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  mesh.setProperty('int[] faceVertexIndices', new Int32Array([0, 1, 2]));
  mesh.setProperty('int[] faceVertexCounts', new Int32Array([3]));
  root.addChild(mesh);
  return root;
}

describe('layerFormat — default ("usda")', () => {
  it('writes model.usda when layerFormat is omitted', async () => {
    const blob = await createUsdzPackage(basicContent());
    const names = await readArchiveNames(blob);
    expect(names).toContain('model.usda');
    expect(names).not.toContain('model.usdc');
  });

  it('writes model.usda when layerFormat is explicitly "usda"', async () => {
    const blob = await createUsdzPackage(basicContent(), { layerFormat: 'usda' });
    const names = await readArchiveNames(blob);
    expect(names).toContain('model.usda');
  });
});

describe('layerFormat — "usdc"', () => {
  it('writes model.usdc when usdContentNode is provided and adapter succeeds', async () => {
    const content: PackageContent = {
      ...basicContent(),
      usdContentNode: basicTree(),
    };
    const blob = await createUsdzPackage(content, { layerFormat: 'usdc' });
    const names = await readArchiveNames(blob);
    expect(names).toContain('model.usdc');
    expect(names).not.toContain('model.usda');
  });

  it('falls back to model.usda when usdContentNode is missing', async () => {
    const blob = await createUsdzPackage(basicContent(), { layerFormat: 'usdc' });
    const names = await readArchiveNames(blob);
    expect(names).toContain('model.usda');
    expect(names).not.toContain('model.usdc');
  });

  it('falls back to model.usda when the tree contains unsupported properties', async () => {
    const root = new UsdNode('/Root', 'Xform');
    // material:binding is a relationship — adapter does not yet emit these.
    root.setProperty('material:binding', '<x>');

    const content: PackageContent = {
      ...basicContent(),
      usdContentNode: root,
    };
    const blob = await createUsdzPackage(content, { layerFormat: 'usdc' });
    const names = await readArchiveNames(blob);
    expect(names).toContain('model.usda');
    expect(names).not.toContain('model.usdc');
  });

  it('USDC root layer starts with PXR-USDC magic when emitted', async () => {
    const content: PackageContent = {
      ...basicContent(),
      usdContentNode: basicTree(),
    };
    const blob = await createUsdzPackage(content, { layerFormat: 'usdc' });
    const archive = new Uint8Array(await blob.arrayBuffer());

    // Find model.usdc inside the archive and verify its first 8 bytes.
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    let cursor = 0;
    let found = false;
    while (cursor + 4 <= archive.length) {
      const sig = view.getUint32(cursor, true);
      if (sig !== 0x04034b50) break;
      const nameLen = view.getUint16(cursor + 26, true);
      const extraLen = view.getUint16(cursor + 28, true);
      const compressedSize = view.getUint32(cursor + 18, true);
      const name = new TextDecoder().decode(
        archive.subarray(cursor + 30, cursor + 30 + nameLen)
      );
      if (name === 'model.usdc') {
        const dataStart = cursor + 30 + nameLen + extraLen;
        // PXR-USDC magic.
        const magic = String.fromCharCode(
          archive[dataStart], archive[dataStart + 1], archive[dataStart + 2], archive[dataStart + 3],
          archive[dataStart + 4], archive[dataStart + 5], archive[dataStart + 6], archive[dataStart + 7]
        );
        expect(magic).toBe('PXR-USDC');
        found = true;
        break;
      }
      cursor += 30 + nameLen + extraLen + compressedSize;
    }
    expect(found).toBe(true);
  });
});
