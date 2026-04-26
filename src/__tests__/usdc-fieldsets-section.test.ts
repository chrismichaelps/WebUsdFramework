/**
 * Tests for the USDC FIELDSETS section encoder + FieldSetTable builder.
 *
 * The flat pool stores all field-index sequences with `~0u` sentinels
 * between sets; specs reference these by FieldSetIndex (the start position
 * of the sequence in the pool). The pool is TfDelta-compressed on disk.
 */
import { describe, it, expect } from 'vitest';
import {
  FieldSetTable,
  FIELD_SET_SENTINEL,
  encodeFieldSetsSection,
  decodeFieldSetsSection,
} from '../converters/shared/usdc/fieldsets-section';

describe('FieldSetTable', () => {
  it('returns 0 for the first added set; second set follows after the sentinel', () => {
    const t = new FieldSetTable();
    expect(t.add([1, 2, 3])).toBe(0);
    expect(t.add([4, 5])).toBe(4); // 3 indices + sentinel = 4
    expect(t.size).toBe(7); // [1,2,3,SENT,4,5,SENT]
  });

  it('dedupes identical sequences', () => {
    const t = new FieldSetTable();
    expect(t.add([10, 20, 30])).toBe(0);
    expect(t.add([10, 20, 30])).toBe(0);
    expect(t.add([10, 20])).toBe(4); // different sequence
    expect(t.size).toBe(7); // [10,20,30,SENT,10,20,SENT]
  });

  it('preserves order in toArray() and includes sentinels', () => {
    const t = new FieldSetTable();
    t.add([1, 2]);
    t.add([3]);
    expect(t.toArray()).toEqual([1, 2, FIELD_SET_SENTINEL, 3, FIELD_SET_SENTINEL]);
  });

  it('reads a stored sequence by index', () => {
    const t = new FieldSetTable();
    const i0 = t.add([7, 8, 9]);
    const i1 = t.add([10, 11]);
    expect(t.read(i0)).toEqual([7, 8, 9]);
    expect(t.read(i1)).toEqual([10, 11]);
  });

  it('round-trips through encode() / decodeFieldSetsSection', () => {
    const t = new FieldSetTable();
    t.add([1, 2, 3]);
    t.add([4]);
    t.add([5, 6, 7, 8]);
    const decoded = decodeFieldSetsSection(t.encode());
    expect(decoded).toEqual(t.toArray());
  });

  it('rejects FieldIndex equal to the sentinel', () => {
    const t = new FieldSetTable();
    expect(() => t.add([FIELD_SET_SENTINEL])).toThrow(RangeError);
  });

  it('rejects out-of-range FieldIndex values', () => {
    const t = new FieldSetTable();
    expect(() => t.add([-1])).toThrow(RangeError);
    expect(() => t.add([0x100000000])).toThrow(RangeError);
    expect(() => t.add([1.5])).toThrow(RangeError);
  });

  it('handles an empty field set (just the sentinel)', () => {
    const t = new FieldSetTable();
    expect(t.add([])).toBe(0);
    expect(t.size).toBe(1);
    expect(t.read(0)).toEqual([]);
  });
});

describe('encodeFieldSetsSection — layout', () => {
  it('emits a 16-byte header for an empty pool', () => {
    const out = encodeFieldSetsSection([]);
    expect(out.length).toBe(16);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getBigUint64(0, true)).toBe(0n);
    expect(view.getBigUint64(8, true)).toBe(0n);
  });

  it('writes numEntries and compressedSize as little-endian uint64', () => {
    const out = encodeFieldSetsSection([0, 1, 2, FIELD_SET_SENTINEL]);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getBigUint64(0, true)).toBe(4n);
    const compressedSize = Number(view.getBigUint64(8, true));
    expect(compressedSize).toBeGreaterThan(0);
    expect(out.length).toBe(16 + compressedSize);
  });
});

describe('encodeFieldSetsSection / decodeFieldSetsSection round-trip', () => {
  it('round-trips an empty pool', () => {
    expect(decodeFieldSetsSection(encodeFieldSetsSection([]))).toEqual([]);
  });

  it('round-trips a single field set with sentinel', () => {
    const flat = [1, 2, 3, FIELD_SET_SENTINEL];
    expect(decodeFieldSetsSection(encodeFieldSetsSection(flat))).toEqual(flat);
  });

  it('round-trips many small field sets', () => {
    const flat: number[] = [];
    for (let i = 0; i < 100; i++) {
      flat.push(i, i + 1, FIELD_SET_SENTINEL);
    }
    expect(decodeFieldSetsSection(encodeFieldSetsSection(flat))).toEqual(flat);
  });

  it('round-trips a flat array containing the maximum FieldIndex value (sentinel)', () => {
    // Just the sentinel itself — represents an empty set.
    const flat = [FIELD_SET_SENTINEL];
    expect(decodeFieldSetsSection(encodeFieldSetsSection(flat))).toEqual(flat);
  });

  it('round-trips a non-monotonic mix of indices and sentinels', () => {
    const flat = [
      0, 5, 10, FIELD_SET_SENTINEL,
      0, 5, 10, FIELD_SET_SENTINEL,
      100, 99, 98, FIELD_SET_SENTINEL,
      FIELD_SET_SENTINEL, // empty set
      1, 2, 3, 4, 5, 6, 7, 8, FIELD_SET_SENTINEL,
    ];
    expect(decodeFieldSetsSection(encodeFieldSetsSection(flat))).toEqual(flat);
  });
});

describe('decodeFieldSetsSection — error paths', () => {
  it('throws on truncated header', () => {
    expect(() => decodeFieldSetsSection(new Uint8Array(8))).toThrow();
  });

  it('throws when payload is shorter than declared compressedSize', () => {
    const out = encodeFieldSetsSection([1, 2, 3, FIELD_SET_SENTINEL]);
    expect(() => decodeFieldSetsSection(out.slice(0, out.length - 1))).toThrow();
  });
});
