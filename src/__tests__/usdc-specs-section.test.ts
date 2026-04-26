/**
 * Round-trip tests for the USDC SPECS section encoder.
 *
 * The SPECS section stores three parallel TfDelta-compressed arrays
 * (pathIndex, fieldSetIndex, specType). These tests cover layout, three
 * representative scene shapes, and the bounds-check error paths.
 */
import { describe, it, expect } from 'vitest';
import {
  encodeSpecsSection,
  decodeSpecsSection,
  type UsdcSpec,
} from '../converters/shared/usdc/specs-section';
import { SdfSpecType } from '../converters/shared/usdc/value-rep';

function specsEqual(a: UsdcSpec[], b: UsdcSpec[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].pathIndex !== b[i].pathIndex) return false;
    if (a[i].fieldSetIndex !== b[i].fieldSetIndex) return false;
    if (a[i].specType !== b[i].specType) return false;
  }
  return true;
}

describe('encodeSpecsSection — layout', () => {
  it('emits a 32-byte header for an empty list', () => {
    const out = encodeSpecsSection([]);
    expect(out.length).toBe(32);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getBigUint64(0, true)).toBe(0n);
    expect(view.getBigUint64(8, true)).toBe(0n);
    expect(view.getBigUint64(16, true)).toBe(0n);
    expect(view.getBigUint64(24, true)).toBe(0n);
  });

  it('writes spec count and three compressed sizes as little-endian uint64', () => {
    const specs: UsdcSpec[] = [
      { pathIndex: 0, fieldSetIndex: 0, specType: SdfSpecType.PseudoRoot },
      { pathIndex: 1, fieldSetIndex: 4, specType: SdfSpecType.Prim },
      { pathIndex: 2, fieldSetIndex: 4, specType: SdfSpecType.Prim },
    ];
    const out = encodeSpecsSection(specs);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getBigUint64(0, true)).toBe(3n);
    expect(view.getBigUint64(8, true)).toBeGreaterThan(0n);
    expect(view.getBigUint64(16, true)).toBeGreaterThan(0n);
    expect(view.getBigUint64(24, true)).toBeGreaterThan(0n);
  });

  it('rejects out-of-range pathIndex', () => {
    expect(() =>
      encodeSpecsSection([
        { pathIndex: -1, fieldSetIndex: 0, specType: SdfSpecType.Prim },
      ])
    ).toThrow(RangeError);
    expect(() =>
      encodeSpecsSection([
        { pathIndex: 0x100000000, fieldSetIndex: 0, specType: SdfSpecType.Prim },
      ])
    ).toThrow(RangeError);
  });

  it('rejects out-of-range fieldSetIndex', () => {
    expect(() =>
      encodeSpecsSection([
        { pathIndex: 0, fieldSetIndex: -1, specType: SdfSpecType.Prim },
      ])
    ).toThrow(RangeError);
  });
});

describe('encodeSpecsSection / decodeSpecsSection round-trip', () => {
  function roundTrip(specs: UsdcSpec[]): UsdcSpec[] {
    return decodeSpecsSection(encodeSpecsSection(specs));
  }

  it('round-trips an empty list', () => {
    expect(roundTrip([])).toEqual([]);
  });

  it('round-trips a single PseudoRoot spec', () => {
    const specs: UsdcSpec[] = [
      { pathIndex: 0, fieldSetIndex: 0, specType: SdfSpecType.PseudoRoot },
    ];
    expect(specsEqual(roundTrip(specs), specs)).toBe(true);
  });

  it('round-trips a representative scene (PseudoRoot + 3 prims + 2 attributes)', () => {
    const specs: UsdcSpec[] = [
      { pathIndex: 0, fieldSetIndex: 0, specType: SdfSpecType.PseudoRoot },
      { pathIndex: 1, fieldSetIndex: 4, specType: SdfSpecType.Prim },
      { pathIndex: 2, fieldSetIndex: 7, specType: SdfSpecType.Prim },
      { pathIndex: 3, fieldSetIndex: 4, specType: SdfSpecType.Prim }, // shares fieldSet with row 1
      { pathIndex: 4, fieldSetIndex: 12, specType: SdfSpecType.Attribute },
      { pathIndex: 5, fieldSetIndex: 16, specType: SdfSpecType.Attribute },
    ];
    expect(specsEqual(roundTrip(specs), specs)).toBe(true);
  });

  it('round-trips a long sequence of monotonically increasing pathIndexes', () => {
    const specs: UsdcSpec[] = [];
    for (let i = 0; i < 200; i++) {
      specs.push({
        pathIndex: i,
        fieldSetIndex: (i % 5) * 4,
        specType: i === 0 ? SdfSpecType.PseudoRoot : SdfSpecType.Prim,
      });
    }
    expect(specsEqual(roundTrip(specs), specs)).toBe(true);
  });

  it('round-trips entries that exercise all of byte/word/dword TfDelta widths', () => {
    const specs: UsdcSpec[] = [
      { pathIndex: 0, fieldSetIndex: 0, specType: SdfSpecType.PseudoRoot },
      { pathIndex: 1, fieldSetIndex: 1, specType: SdfSpecType.Prim },         // byte deltas
      { pathIndex: 2000, fieldSetIndex: 2000, specType: SdfSpecType.Prim },   // word deltas
      { pathIndex: 0x100000, fieldSetIndex: 0x100000, specType: SdfSpecType.Prim }, // dword deltas
    ];
    expect(specsEqual(roundTrip(specs), specs)).toBe(true);
  });
});

describe('decodeSpecsSection — error paths', () => {
  it('throws on truncated header', () => {
    expect(() => decodeSpecsSection(new Uint8Array(16))).toThrow();
  });

  it('throws when section is shorter than declared sizes', () => {
    const out = encodeSpecsSection([
      { pathIndex: 0, fieldSetIndex: 0, specType: SdfSpecType.PseudoRoot },
    ]);
    expect(() => decodeSpecsSection(out.slice(0, out.length - 1))).toThrow();
  });
});
