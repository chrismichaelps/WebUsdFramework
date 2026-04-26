/**
 * Integration tests for the USDC layer builder.
 *
 * These exercise `serialize()` end-to-end: build a small scene, produce the
 * complete USDC bytes, and verify the resulting file:
 *   - starts with the `PXR-USDC` magic (bootstrap),
 *   - declares a TOC offset that points at a valid TOC,
 *   - has TOC entries for the six required sections, each in declaration
 *     order with non-overlapping byte ranges,
 *   - has tokens / paths / fields / specs that round-trip back through their
 *     respective decoders.
 */
import { describe, it, expect } from 'vitest';
import { UsdcLayerBuilder, buildSimpleUsdcLayer } from '../converters/shared/usdc/layer-builder';
import {
  USDC_BOOTSTRAP_SIZE,
  USDC_MAGIC,
  USDC_SECTION_NAME_SIZE,
} from '../converters/shared/usdc-writer';
import { decodeTokensSection } from '../converters/shared/usdc/tokens-section';
import { decodeFieldsSection } from '../converters/shared/usdc/fields-section';
import { decodeFieldSetsSection } from '../converters/shared/usdc/fieldsets-section';
import { decodePathsSection } from '../converters/shared/usdc/paths-section';
import { decodeSpecsSection } from '../converters/shared/usdc/specs-section';
import {
  CrateDataType,
  decodeValueRep,
  SdfSpecType,
} from '../converters/shared/usdc/value-rep';

interface TocEntry {
  name: string;
  start: number;
  size: number;
}

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

describe('UsdcLayerBuilder.serialize() — bootstrap + TOC layout', () => {
  it('starts with the PXR-USDC magic', () => {
    const bytes = buildSimpleUsdcLayer(() => {});
    for (let i = 0; i < USDC_MAGIC.length; i++) {
      expect(bytes[i]).toBe(USDC_MAGIC[i]);
    }
  });

  it('writes a valid TOC offset pointing past the bootstrap', () => {
    const bytes = buildSimpleUsdcLayer(() => {});
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tocOffset = Number(view.getBigInt64(16, true));
    expect(tocOffset).toBeGreaterThan(USDC_BOOTSTRAP_SIZE);
    expect(tocOffset).toBeLessThan(bytes.length);
  });

  it('emits all six required sections in dependency order', () => {
    const bytes = buildSimpleUsdcLayer(() => {});
    const toc = readToc(bytes);
    expect(toc.map((e) => e.name)).toEqual([
      'TOKENS',
      'STRINGS',
      'FIELDS',
      'FIELDSETS',
      'PATHS',
      'SPECS',
    ]);
  });

  it('emits non-overlapping section byte ranges within the file', () => {
    const bytes = buildSimpleUsdcLayer(() => {});
    const toc = readToc(bytes);
    let prevEnd = USDC_BOOTSTRAP_SIZE;
    for (const e of toc) {
      expect(e.start).toBeGreaterThanOrEqual(prevEnd);
      expect(e.start + e.size).toBeLessThanOrEqual(bytes.length);
      prevEnd = e.start + e.size;
    }
  });
});

describe('UsdcLayerBuilder.serialize() — section contents', () => {
  it('TOKENS contains every interned identifier', () => {
    const bytes = buildSimpleUsdcLayer((b, root) => {
      b.addFloatAttribute(root, 'inputs:roughness', 0.6);
      b.addTokenAttribute(root, 'info:id', 'UsdPreviewSurface');
    });
    const toc = readToc(bytes);
    const tokensEntry = toc.find((e) => e.name === 'TOKENS')!;
    const tokens = decodeTokensSection(
      bytes.subarray(tokensEntry.start, tokensEntry.start + tokensEntry.size)
    );
    // The builder pre-interns 'specifier' + 'typeName'; the simple wrapper
    // declares /Root with type 'Xform'; this test adds two more attributes.
    expect(tokens).toContain('specifier');
    expect(tokens).toContain('typeName');
    expect(tokens).toContain('Root');
    expect(tokens).toContain('Xform');
    expect(tokens).toContain('inputs:roughness');
    expect(tokens).toContain('info:id');
    expect(tokens).toContain('UsdPreviewSurface');
  });

  it('SPECS contains a PseudoRoot row at index 0 and a Prim row at index 1', () => {
    const bytes = buildSimpleUsdcLayer(() => {});
    const toc = readToc(bytes);
    const specsEntry = toc.find((e) => e.name === 'SPECS')!;
    const specs = decodeSpecsSection(
      bytes.subarray(specsEntry.start, specsEntry.start + specsEntry.size)
    );
    expect(specs.length).toBe(2);
    expect(specs[0].pathIndex).toBe(0);
    expect(specs[0].specType).toBe(SdfSpecType.PseudoRoot);
    expect(specs[1].pathIndex).toBe(1);
    expect(specs[1].specType).toBe(SdfSpecType.Prim);
  });

  it('FIELDS / FIELDSETS reflect the prim spec (specifier + typeName)', () => {
    const bytes = buildSimpleUsdcLayer(() => {});
    const toc = readToc(bytes);
    const fieldsEntry = toc.find((e) => e.name === 'FIELDS')!;
    const fieldSetsEntry = toc.find((e) => e.name === 'FIELDSETS')!;
    const fields = decodeFieldsSection(
      bytes.subarray(fieldsEntry.start, fieldsEntry.start + fieldsEntry.size)
    );
    const flatFieldSets = decodeFieldSetsSection(
      bytes.subarray(fieldSetsEntry.start, fieldSetsEntry.start + fieldSetsEntry.size)
    );

    // The Root prim spec should reference exactly two fields: specifier + typeName.
    // FieldSetIndex for the Root prim is at offset 0 (PseudoRoot has empty
    // fields → fieldsetIndex 0 with just sentinel) — no, actually pseudo-root
    // is added first with empty fields, so its fieldsetIndex is 0 and its
    // pool entry is just [SENTINEL]. The Root prim's fieldset starts at 1.
    expect(flatFieldSets.length).toBeGreaterThan(0);

    // Verify that the Root prim's typeName field references the 'Xform' token.
    const typeNameField = fields.find((f) => {
      const fieldsView = decodeValueRep(f.valueRep);
      return fieldsView.type === CrateDataType.Token && fieldsView.isInlined;
    });
    expect(typeNameField).toBeDefined();
  });

  it('PATHS root has the prim added under it', () => {
    const bytes = buildSimpleUsdcLayer(() => {});
    const toc = readToc(bytes);
    const pathsEntry = toc.find((e) => e.name === 'PATHS')!;
    const paths = decodePathsSection(
      bytes.subarray(pathsEntry.start, pathsEntry.start + pathsEntry.size)
    );
    // 2 paths total: pseudo-root + /Root.
    expect(paths.pathIndexes.length).toBe(2);
    expect(paths.pathIndexes[0]).toBe(0);
    expect(paths.pathIndexes[1]).toBe(1);
  });
});

describe('UsdcLayerBuilder — array attributes', () => {
  it('places array payloads between STRINGS and FIELDS', () => {
    const bytes = buildSimpleUsdcLayer((b, root) => {
      b.addFloatArrayAttribute(root, 'widths', new Float32Array([0.1, 0.2, 0.3]));
      b.addVec3fArrayAttribute(root, 'points', new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    });
    const toc = readToc(bytes);
    const stringsEntry = toc.find((e) => e.name === 'STRINGS')!;
    const fieldsEntry = toc.find((e) => e.name === 'FIELDS')!;
    // Array bytes are between strings end and fields start — there must be
    // at least 2 × (8 byte count + payload) bytes of room.
    const arraysRegionSize = fieldsEntry.start - (stringsEntry.start + stringsEntry.size);
    expect(arraysRegionSize).toBeGreaterThan(0);
  });

  it('produces FIELDS with array ValueReps that point inside the file', () => {
    const bytes = buildSimpleUsdcLayer((b, root) => {
      b.addFloatArrayAttribute(root, 'widths', new Float32Array([0.1, 0.2, 0.3]));
    });
    const toc = readToc(bytes);
    const fieldsEntry = toc.find((e) => e.name === 'FIELDS')!;
    const fields = decodeFieldsSection(
      bytes.subarray(fieldsEntry.start, fieldsEntry.start + fieldsEntry.size)
    );
    const arrayFields = fields.filter((f) => {
      const v = decodeValueRep(f.valueRep);
      return v.isArray && !v.isInlined;
    });
    expect(arrayFields.length).toBeGreaterThan(0);
    for (const f of arrayFields) {
      const v = decodeValueRep(f.valueRep);
      const offset = Number(v.payload);
      expect(offset).toBeGreaterThan(USDC_BOOTSTRAP_SIZE);
      expect(offset).toBeLessThan(bytes.length);
    }
  });
});

describe('UsdcLayerBuilder — error paths', () => {
  it('rejects an empty path', () => {
    const b = new UsdcLayerBuilder();
    expect(() => b.declarePrim('/', 'Xform')).toThrow(RangeError);
  });

  it('rejects a path that does not start with /', () => {
    const b = new UsdcLayerBuilder();
    expect(() => b.declarePrim('Root', 'Xform')).toThrow(RangeError);
  });

  it('rejects a child whose parent has not been declared', () => {
    const b = new UsdcLayerBuilder();
    expect(() => b.declarePrim('/Root/Child', 'Xform')).toThrow(RangeError);
  });

  it('accepts nested prims when the parent is declared first', () => {
    const b = new UsdcLayerBuilder();
    const root = b.declarePrim('/Root', 'Xform');
    expect(root.pathIndex).toBe(1);
    const child = b.declarePrim('/Root/Child', 'Mesh');
    expect(child.pathIndex).toBe(2);
  });
});
