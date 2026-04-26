/**
 * Round-trip tests for the USDC FIELDS section encoder.
 *
 * The FIELDS section pairs each field's tokenIndex (TfDelta-compressed) with
 * its 8-byte ValueRep (raw uint64). These tests verify the layout, the
 * compression flow, and the bounds-check error paths.
 */
import { describe, it, expect } from 'vitest';
import {
  encodeFieldsSection,
  decodeFieldsSection,
  type UsdcField,
} from '../converters/shared/usdc/fields-section';
import {
  inlineFloat,
  inlineToken,
  inlineSpecifier,
  SdfSpecifier,
  externalValueRep,
  CrateDataType,
} from '../converters/shared/usdc/value-rep';

function fieldsEqual(a: UsdcField[], b: UsdcField[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].tokenIndex !== b[i].tokenIndex) return false;
    if (a[i].valueRep !== b[i].valueRep) return false;
  }
  return true;
}

describe('encodeFieldsSection — layout', () => {
  it('emits a 16-byte header for an empty list', () => {
    const out = encodeFieldsSection([]);
    expect(out.length).toBe(16);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getBigUint64(0, true)).toBe(0n);
    expect(view.getBigUint64(8, true)).toBe(0n);
  });

  it('writes numFields and compressedTokensSize as little-endian uint64', () => {
    const fields: UsdcField[] = [
      { tokenIndex: 5, valueRep: inlineFloat(1.0) },
      { tokenIndex: 6, valueRep: inlineFloat(2.0) },
    ];
    const out = encodeFieldsSection(fields);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getBigUint64(0, true)).toBe(2n);
    const compressedSize = Number(view.getBigUint64(8, true));
    // 2 ints with byte-deltas: 1 header byte + 2 payload bytes = 3 bytes
    expect(compressedSize).toBe(3);
  });

  it('appends valueReps as raw little-endian uint64 after the compressed tokens', () => {
    const fields: UsdcField[] = [
      { tokenIndex: 0, valueRep: 0xdeadbeefcafebaben },
    ];
    const out = encodeFieldsSection(fields);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const compressedSize = Number(view.getBigUint64(8, true));
    const valueRepOffset = 16 + compressedSize;
    expect(view.getBigUint64(valueRepOffset, true)).toBe(0xdeadbeefcafebaben);
  });

  it('rejects out-of-range tokenIndex', () => {
    expect(() =>
      encodeFieldsSection([{ tokenIndex: -1, valueRep: 0n }])
    ).toThrow(RangeError);
    expect(() =>
      encodeFieldsSection([{ tokenIndex: 0x100000000, valueRep: 0n }])
    ).toThrow(RangeError);
    expect(() =>
      encodeFieldsSection([{ tokenIndex: 1.5, valueRep: 0n }])
    ).toThrow(RangeError);
  });
});

describe('encodeFieldsSection / decodeFieldsSection round-trip', () => {
  it('round-trips an empty list', () => {
    expect(decodeFieldsSection(encodeFieldsSection([]))).toEqual([]);
  });

  it('round-trips a single inlined field', () => {
    const fields: UsdcField[] = [{ tokenIndex: 7, valueRep: inlineFloat(0.5) }];
    expect(fieldsEqual(decodeFieldsSection(encodeFieldsSection(fields)), fields)).toBe(
      true
    );
  });

  it('round-trips a representative scene-description field set', () => {
    // Mimic the fields a typical Mesh prim emits.
    const fields: UsdcField[] = [
      { tokenIndex: 0, valueRep: inlineSpecifier(SdfSpecifier.Def) },     // specifier
      { tokenIndex: 1, valueRep: inlineToken(2) },                         // typeName
      { tokenIndex: 3, valueRep: externalValueRep({                       // points
          type: CrateDataType.Vec3f,
          isArray: true,
          isCompressed: true,
          fileOffset: 4096,
        }),
      },
      { tokenIndex: 4, valueRep: externalValueRep({                       // faceVertexIndices
          type: CrateDataType.Int,
          isArray: true,
          isCompressed: false,
          fileOffset: 8192,
        }),
      },
      { tokenIndex: 5, valueRep: inlineFloat(1.0) },                      // opacity
    ];
    const decoded = decodeFieldsSection(encodeFieldsSection(fields));
    expect(fieldsEqual(decoded, fields)).toBe(true);
  });

  it('round-trips a large monotonically increasing tokenIndex sequence', () => {
    const fields: UsdcField[] = [];
    for (let i = 0; i < 200; i++) {
      fields.push({ tokenIndex: i, valueRep: inlineFloat(i) });
    }
    const decoded = decodeFieldsSection(encodeFieldsSection(fields));
    expect(fieldsEqual(decoded, fields)).toBe(true);
  });

  it('round-trips fields with non-monotonic tokenIndex (mixes byte / word codes)', () => {
    const indices = [10, 20, 5, 1000, 999, 0, 65535, 100];
    const fields: UsdcField[] = indices.map((t, i) => ({
      tokenIndex: t,
      valueRep: inlineFloat(i),
    }));
    const decoded = decodeFieldsSection(encodeFieldsSection(fields));
    expect(fieldsEqual(decoded, fields)).toBe(true);
  });

  it('round-trips a high-bit valueRep (full uint64)', () => {
    const fields: UsdcField[] = [
      { tokenIndex: 0, valueRep: 0xffffffffffffffffn },
    ];
    const decoded = decodeFieldsSection(encodeFieldsSection(fields));
    expect(decoded[0].valueRep).toBe(0xffffffffffffffffn);
  });
});

describe('decodeFieldsSection — error paths', () => {
  it('throws on truncated header', () => {
    expect(() => decodeFieldsSection(new Uint8Array(8))).toThrow();
  });

  it('throws when payload is shorter than declared sizes', () => {
    const fields: UsdcField[] = [{ tokenIndex: 0, valueRep: inlineFloat(1) }];
    const out = encodeFieldsSection(fields);
    expect(() => decodeFieldsSection(out.slice(0, out.length - 1))).toThrow();
  });
});
