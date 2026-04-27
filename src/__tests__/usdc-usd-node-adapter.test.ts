/**
 * Tests for the UsdNode → UsdcLayerBuilder adapter.
 *
 * The adapter is the "live wire" between the converters' existing scene
 * graph and the binary encoder. These tests verify:
 *   - that representative scene fragments produce structurally-valid USDC,
 *   - that the per-property type dispatch covers the shapes the live PLY /
 *     OBJ / STL / GLB converters emit,
 *   - that unsupported keys (relationships, list-ops, connections) are
 *     reported but do not abort the walk,
 *   - that the resulting USDC contains the tokens, paths, fields, and specs
 *     we'd expect for the input.
 */
import { describe, it, expect } from 'vitest';
import { UsdNode } from '../core/usd-node';
import {
  adaptUsdNodeTree,
  applyProperty,
  encodeUsdNodeTreeToUsdc,
} from '../converters/shared/usdc/usd-node-adapter';
import { UsdcLayerBuilder } from '../converters/shared/usdc/layer-builder';
import { decodeTokensSection } from '../converters/shared/usdc/tokens-section';
import { decodeSpecsSection } from '../converters/shared/usdc/specs-section';
import { decodeFieldsSection } from '../converters/shared/usdc/fields-section';
import {
  USDC_BOOTSTRAP_SIZE,
  USDC_MAGIC,
  USDC_SECTION_NAME_SIZE,
} from '../converters/shared/usdc-writer';
import {
  decodeValueRep,
  CrateDataType,
  SdfSpecType,
} from '../converters/shared/usdc/value-rep';

interface TocEntry { name: string; start: number; size: number }

function readToc(bytes: Uint8Array): TocEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tocOffset = Number(view.getBigInt64(16, true));
  const numSections = Number(view.getBigUint64(tocOffset, true));
  const entries: TocEntry[] = new Array(numSections);
  let cursor = tocOffset + 8;
  for (let i = 0; i < numSections; i++) {
    let nameEnd = USDC_SECTION_NAME_SIZE;
    for (let j = 0; j < USDC_SECTION_NAME_SIZE; j++) {
      if (bytes[cursor + j] === 0) {
        nameEnd = j;
        break;
      }
    }
    const name = new TextDecoder().decode(bytes.subarray(cursor, cursor + nameEnd));
    const start = Number(view.getBigInt64(cursor + USDC_SECTION_NAME_SIZE, true));
    const size = Number(view.getBigInt64(cursor + USDC_SECTION_NAME_SIZE + 8, true));
    entries[i] = { name, start, size };
    cursor += USDC_SECTION_NAME_SIZE + 16;
  }
  return entries;
}

function getTokens(bytes: Uint8Array): string[] {
  const e = readToc(bytes).find((s) => s.name === 'TOKENS')!;
  return decodeTokensSection(bytes.subarray(e.start, e.start + e.size));
}

describe('applyProperty — scalar dispatch', () => {
  it('emits a Float scalar for "float inputs:roughness"', () => {
    const b = new UsdcLayerBuilder();
    const root = b.declarePrim('/Root', 'Xform');
    const r = applyProperty(b, root, 'float inputs:roughness', 0.6);
    expect(r.emitted).toBe(true);
  });

  it('parses numeric strings for float scalars', () => {
    const b = new UsdcLayerBuilder();
    const root = b.declarePrim('/Root', 'Xform');
    expect(applyProperty(b, root, 'float inputs:roughness', '0.6').emitted).toBe(true);
  });

  it('emits a Token scalar for "uniform token info:id"', () => {
    const b = new UsdcLayerBuilder();
    const root = b.declarePrim('/Root', 'Material');
    expect(
      applyProperty(b, root, 'uniform token info:id', 'UsdPreviewSurface').emitted
    ).toBe(true);
  });

  it('emits an empty Token for an empty string value', () => {
    const b = new UsdcLayerBuilder();
    const root = b.declarePrim('/Root', 'Material');
    expect(applyProperty(b, root, 'token outputs:surface', '').emitted).toBe(true);
  });

  it('parses USDA-formatted scalar Vec3f literals (color3f inputs:diffuseColor)', () => {
    const b = new UsdcLayerBuilder();
    const root = b.declarePrim('/Root', 'Material');
    const r = applyProperty(b, root, 'color3f inputs:diffuseColor', '(0.7, 0.7, 0.7)');
    expect(r.emitted).toBe(true);
  });

  it('skips malformed Vec3f scalar literals', () => {
    const b = new UsdcLayerBuilder();
    const root = b.declarePrim('/Root', 'Material');
    const r = applyProperty(b, root, 'color3f inputs:diffuseColor', '(not, a, tuple)');
    expect(r.emitted).toBe(false);
  });

  it('parses USDA-formatted Vec3f[] literals (float3[] extent)', () => {
    const b = new UsdcLayerBuilder();
    b.declarePrim('/Root', 'Xform');
    const root = b.declarePrim('/Root/Mesh', 'Mesh');
    const r = applyProperty(b, root, 'float3[] extent', '[(-1, -1, -1), (1, 1, 1)]');
    expect(r.emitted).toBe(true);
  });

  it('skips connection keys (.connect suffix)', () => {
    const b = new UsdcLayerBuilder();
    const root = b.declarePrim('/Root', 'Material');
    expect(applyProperty(b, root, 'token outputs:surface.connect', '<x>').emitted).toBe(false);
  });

  it('emits a Relationship for material:binding (target as USDA-style <path>)', () => {
    const b = new UsdcLayerBuilder();
    const root = b.declarePrim('/Root', 'Xform');
    const mat = b.declarePrim('/Root/PlyMaterial', 'Material');
    const r = applyProperty(b, root, 'material:binding', '</Root/PlyMaterial>');
    expect(r.emitted).toBe(true);
    void mat; // declared so the target resolves at serialize time
  });

  it('emits a Relationship for material:binding (target as bare path)', () => {
    const b = new UsdcLayerBuilder();
    b.declarePrim('/Root', 'Xform');
    b.declarePrim('/Root/PlyMaterial', 'Material');
    const root = b.declarePrim('/Root/Mesh', 'Mesh');
    const r = applyProperty(b, root, 'material:binding', '/Root/PlyMaterial');
    expect(r.emitted).toBe(true);
  });

  it('emits a Relationship for an array of target paths', () => {
    const b = new UsdcLayerBuilder();
    b.declarePrim('/Root', 'Xform');
    b.declarePrim('/Root/A', 'Material');
    b.declarePrim('/Root/B', 'Material');
    const mesh = b.declarePrim('/Root/Mesh', 'Mesh');
    const r = applyProperty(b, mesh, 'material:binding', ['</Root/A>', '</Root/B>']);
    expect(r.emitted).toBe(true);
  });

  it('skips a relationship whose value is empty / non-absolute', () => {
    const b = new UsdcLayerBuilder();
    const root = b.declarePrim('/Root', 'Xform');
    expect(applyProperty(b, root, 'material:binding', '').emitted).toBe(false);
    expect(applyProperty(b, root, 'material:binding', 'NotAbsolute').emitted).toBe(false);
    expect(applyProperty(b, root, 'material:binding', 42).emitted).toBe(false);
  });

  it('emits a TokenListOp for prepend apiSchemas', () => {
    const b = new UsdcLayerBuilder();
    const root = b.declarePrim('/Root', 'Xform');
    const r = applyProperty(b, root, 'prepend apiSchemas', ['MaterialBindingAPI']);
    expect(r.emitted).toBe(true);
  });

  it('emits a TokenListOp for append apiSchemas', () => {
    const b = new UsdcLayerBuilder();
    const root = b.declarePrim('/Root', 'Xform');
    const r = applyProperty(b, root, 'append apiSchemas', ['MaterialBindingAPI', 'Other']);
    expect(r.emitted).toBe(true);
  });

  it('skips list-ops for fields that are not TokenListOp-shaped (e.g. references)', () => {
    const b = new UsdcLayerBuilder();
    const root = b.declarePrim('/Root', 'Xform');
    expect(applyProperty(b, root, 'prepend references', ['@asset.usd@']).emitted).toBe(false);
  });

  it('skips list-ops whose value is not a string array', () => {
    const b = new UsdcLayerBuilder();
    const root = b.declarePrim('/Root', 'Xform');
    expect(applyProperty(b, root, 'prepend apiSchemas', 'not-an-array').emitted).toBe(false);
  });
});

describe('applyProperty — array dispatch', () => {
  it('emits a Vec3f[] for "point3f[] points" with a Float32Array', () => {
    const b = new UsdcLayerBuilder();
    b.declarePrim('/Root', 'Xform');
    const root = b.declarePrim('/Root/Mesh', 'Mesh');
    const r = applyProperty(b, root, 'point3f[] points', new Float32Array([0, 0, 0, 1, 0, 0]));
    expect(r.emitted).toBe(true);
  });

  it('rejects Vec3f[] when length is not a multiple of 3', () => {
    const b = new UsdcLayerBuilder();
    b.declarePrim('/Root', 'Xform');
    const root = b.declarePrim('/Root/Mesh', 'Mesh');
    const r = applyProperty(b, root, 'point3f[] points', new Float32Array([0, 0]));
    expect(r.emitted).toBe(false);
  });

  it('emits a Float[] for "float[] widths" with a Float32Array', () => {
    const b = new UsdcLayerBuilder();
    const root = b.declarePrim('/Root', 'Points');
    const r = applyProperty(b, root, 'float[] widths', new Float32Array([0.1, 0.2, 0.3]));
    expect(r.emitted).toBe(true);
  });

  it('emits an Int[] for "int[] faceVertexIndices"', () => {
    const b = new UsdcLayerBuilder();
    b.declarePrim('/Root', 'Xform');
    const root = b.declarePrim('/Root/Mesh', 'Mesh');
    const r = applyProperty(b, root, 'int[] faceVertexIndices', new Int32Array([0, 1, 2]));
    expect(r.emitted).toBe(true);
  });

  it('coerces a plain number[] into the right typed array', () => {
    const b = new UsdcLayerBuilder();
    b.declarePrim('/Root', 'Xform');
    const root = b.declarePrim('/Root/Mesh', 'Mesh');
    expect(applyProperty(b, root, 'float[] widths', [0.1, 0.2, 0.3]).emitted).toBe(true);
    expect(applyProperty(b, root, 'int[] faceVertexCounts', [3, 3, 3]).emitted).toBe(true);
  });

  it('emits a Token[] for a string array', () => {
    const b = new UsdcLayerBuilder();
    b.declarePrim('/Root', 'Xform');
    const root = b.declarePrim('/Root/Mesh', 'Mesh');
    const r = applyProperty(b, root, 'uniform token[] xformOpOrder', ['xformOp:translate']);
    expect(r.emitted).toBe(true);
  });

  it('skips array attributes whose value is not the expected shape', () => {
    const b = new UsdcLayerBuilder();
    b.declarePrim('/Root', 'Xform');
    const root = b.declarePrim('/Root/Mesh', 'Mesh');
    expect(applyProperty(b, root, 'point3f[] points', 'not an array').emitted).toBe(false);
    expect(applyProperty(b, root, 'int[] faceVertexIndices', [1.5, 2]).emitted).toBe(false);
  });
});

describe('adaptUsdNodeTree — small scene', () => {
  function makeScene(): UsdNode {
    const root = new UsdNode('/Root', 'Xform');
    const scene = new UsdNode('/Root/Scene', 'Scope');
    const mesh = new UsdNode('/Root/Scene/PlyMesh', 'Mesh');
    mesh.setProperty('point3f[] points', new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]));
    mesh.setProperty('int[] faceVertexIndices', new Int32Array([0, 1, 2]));
    mesh.setProperty('int[] faceVertexCounts', new Int32Array([3]));
    scene.addChild(mesh);
    root.addChild(scene);
    return root;
  }

  it('walks every node in the tree', () => {
    const root = makeScene();
    const builder = new UsdcLayerBuilder();
    const report = adaptUsdNodeTree(root, builder);
    expect(report.primCount).toBe(3); // Root + Scene + PlyMesh
    expect(report.skipped).toBe(0);
  });

  it('emitted USDC starts with PXR-USDC magic and has 6 sections', () => {
    const { bytes, report } = encodeUsdNodeTreeToUsdc(makeScene());
    for (let i = 0; i < USDC_MAGIC.length; i++) expect(bytes[i]).toBe(USDC_MAGIC[i]);
    const toc = readToc(bytes);
    expect(toc.map((s) => s.name)).toEqual([
      'TOKENS',
      'STRINGS',
      'FIELDS',
      'FIELDSETS',
      'PATHS',
      'SPECS',
    ]);
    expect(report.skipped).toBe(0);
  });

  it('TOKENS contains every prim name and property name from the source tree', () => {
    const { bytes } = encodeUsdNodeTreeToUsdc(makeScene());
    const tokens = getTokens(bytes);
    for (const expected of [
      'Root',
      'Scene',
      'PlyMesh',
      'Xform',
      'Scope',
      'Mesh',
      'points',
      'faceVertexIndices',
      'faceVertexCounts',
    ]) {
      expect(tokens).toContain(expected);
    }
  });

  it('SPECS contains a row for each prim plus the pseudo-root', () => {
    const { bytes } = encodeUsdNodeTreeToUsdc(makeScene());
    const toc = readToc(bytes);
    const specsEntry = toc.find((e) => e.name === 'SPECS')!;
    const specs = decodeSpecsSection(bytes.subarray(specsEntry.start, specsEntry.start + specsEntry.size));
    expect(specs.length).toBe(4); // PseudoRoot + Root + Scene + PlyMesh
    expect(specs[0].specType).toBe(SdfSpecType.PseudoRoot);
    for (let i = 1; i < specs.length; i++) {
      expect(specs[i].specType).toBe(SdfSpecType.Prim);
    }
  });

  it('FIELDS contains array ValueReps that point inside the file', () => {
    const { bytes } = encodeUsdNodeTreeToUsdc(makeScene());
    const toc = readToc(bytes);
    const fieldsEntry = toc.find((e) => e.name === 'FIELDS')!;
    const fields = decodeFieldsSection(bytes.subarray(fieldsEntry.start, fieldsEntry.start + fieldsEntry.size));
    const arrayFields = fields.filter((f) => {
      const v = decodeValueRep(f.valueRep);
      return v.isArray && !v.isInlined;
    });
    // We added points + faceVertexIndices + faceVertexCounts → 3 array fields.
    expect(arrayFields.length).toBe(3);
    for (const f of arrayFields) {
      const v = decodeValueRep(f.valueRep);
      const offset = Number(v.payload);
      expect(offset).toBeGreaterThan(USDC_BOOTSTRAP_SIZE);
      expect(offset).toBeLessThan(bytes.length);
    }
  });
});

describe('adaptUsdNodeTree — properties report', () => {
  it('records every visited property, marking unsupported keys without aborting', () => {
    const root = new UsdNode('/Root', 'Xform');
    root.setProperty('uniform token[] xformOpOrder', ['xformOp:translate']);
    root.setProperty('material:binding', '<x>');
    root.setProperty('token outputs:surface.connect', '<x>');

    const builder = new UsdcLayerBuilder();
    const report = adaptUsdNodeTree(root, builder);
    expect(report.properties.length).toBe(3);
    const unsupported = report.properties.filter((p) => !p.emitted);
    expect(unsupported.length).toBe(2);
    for (const u of unsupported) expect(u.reason).toBeDefined();
  });

  it('emits TokenListOp for prepend apiSchemas during a tree walk', () => {
    const root = new UsdNode('/Root', 'Xform');
    root.setProperty('prepend apiSchemas', ['MaterialBindingAPI']);

    const builder = new UsdcLayerBuilder();
    const report = adaptUsdNodeTree(root, builder);
    expect(report.skipped).toBe(0);
    const apiSchemasReport = report.properties.find((p) => p.rawKey === 'prepend apiSchemas');
    expect(apiSchemasReport?.emitted).toBe(true);
  });
});
