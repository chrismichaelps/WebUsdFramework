/**
 * Tests for the TokenListOp value encoder.
 *
 * Round-trip: every input shape that comes through `encodeTokenListOp`
 * must decode back to the same logical value via `decodeTokenListOp`. The
 * tests also lock down the byte layout so future encoder changes can't
 * silently drift from the on-disk format.
 */
import { describe, it, expect } from 'vitest';
import {
  encodeTokenListOp,
  decodeTokenListOp,
  SdfListOpSubListType,
  listOpValueRep,
  type TokenListOpInput,
} from '../converters/shared/usdc/listop-values';
import { CrateDataType, decodeValueRep } from '../converters/shared/usdc/value-rep';

function roundTrip(input: TokenListOpInput): TokenListOpInput {
  return decodeTokenListOp(encodeTokenListOp(input).bytes);
}

describe('encodeTokenListOp — byte layout', () => {
  it('emits a 2-byte header for an empty op', () => {
    const enc = encodeTokenListOp({});
    expect(enc.bytes.length).toBe(2);
    expect(enc.bytes[0]).toBe(0); // isExplicit = false
    expect(enc.bytes[1]).toBe(0); // 0 active sub-lists
  });

  it('marks isExplicit=true with the first byte', () => {
    const enc = encodeTokenListOp({ isExplicit: true });
    expect(enc.bytes[0]).toBe(1);
  });

  it('packs a single prepended sub-list with one item', () => {
    const enc = encodeTokenListOp({ prepended: [7] });
    // 2 (header) + 1 (listType) + 8 (numItems) + 4 (1 × uint32) = 15
    expect(enc.bytes.length).toBe(15);
    expect(enc.bytes[0]).toBe(0); // isExplicit
    expect(enc.bytes[1]).toBe(1); // numActiveLists
    expect(enc.bytes[2]).toBe(SdfListOpSubListType.Prepended);
    const view = new DataView(enc.bytes.buffer, enc.bytes.byteOffset, enc.bytes.byteLength);
    expect(view.getBigUint64(3, true)).toBe(1n);
    expect(view.getUint32(11, true)).toBe(7);
  });

  it('packs multiple sub-lists in fixed canonical order', () => {
    // Encoder walks explicit → added → deleted → ordered → prepended → appended.
    const enc = encodeTokenListOp({
      explicit: [10],
      prepended: [20, 21],
      appended: [30],
    });
    // Verify the sub-list type bytes appear in declaration order.
    let dp = 2;
    expect(enc.bytes[dp]).toBe(SdfListOpSubListType.Explicit); dp += 1 + 8 + 4 * 1;
    expect(enc.bytes[dp]).toBe(SdfListOpSubListType.Prepended); dp += 1 + 8 + 4 * 2;
    expect(enc.bytes[dp]).toBe(SdfListOpSubListType.Appended);
  });

  it('drops empty sub-lists from the output', () => {
    const enc = encodeTokenListOp({
      explicit: [],
      prepended: [1, 2],
      appended: [],
    });
    // Only `prepended` is non-empty.
    expect(enc.bytes[1]).toBe(1);
  });

  it('rejects out-of-range tokenIndex values', () => {
    expect(() => encodeTokenListOp({ prepended: [-1] })).toThrow(RangeError);
    expect(() => encodeTokenListOp({ prepended: [0x100000000] })).toThrow(RangeError);
    expect(() => encodeTokenListOp({ prepended: [1.5] })).toThrow(RangeError);
  });
});

describe('encodeTokenListOp / decodeTokenListOp round-trip', () => {
  it('round-trips an empty op', () => {
    expect(roundTrip({})).toEqual({ isExplicit: false });
  });

  it('round-trips an isExplicit-only op', () => {
    expect(roundTrip({ isExplicit: true })).toEqual({ isExplicit: true });
  });

  it('round-trips the prepend apiSchemas shape', () => {
    const r = roundTrip({ prepended: [42] });
    expect(r.prepended).toEqual([42]);
    expect(r.isExplicit).toBe(false);
  });

  it('round-trips a multi-sublist op', () => {
    const r = roundTrip({
      explicit: [1, 2],
      prepended: [3, 4, 5],
      appended: [6],
      deleted: [99],
    });
    expect(r.explicit).toEqual([1, 2]);
    expect(r.prepended).toEqual([3, 4, 5]);
    expect(r.appended).toEqual([6]);
    expect(r.deleted).toEqual([99]);
    expect(r.added).toBeUndefined();
    expect(r.ordered).toBeUndefined();
  });
});

describe('listOpValueRep', () => {
  it('builds a non-array, non-inlined ValueRep with the encoded type', () => {
    const enc = encodeTokenListOp({ prepended: [7] });
    const rep = listOpValueRep(enc, 1024);
    const fields = decodeValueRep(rep);
    expect(fields.type).toBe(CrateDataType.TokenListOp);
    expect(fields.isArray).toBe(false);
    expect(fields.isInlined).toBe(false);
    expect(fields.payload).toBe(1024n);
  });
});

describe('decodeTokenListOp — error paths', () => {
  it('throws on truncated header', () => {
    expect(() => decodeTokenListOp(new Uint8Array(1))).toThrow();
  });

  it('throws when sub-list header is missing', () => {
    // numActiveLists=1 but no sub-list bytes follow.
    const buf = new Uint8Array([0, 1]);
    expect(() => decodeTokenListOp(buf)).toThrow();
  });

  it('throws when item payload is short', () => {
    // Claims 1 item but only 2 bytes of payload follow.
    const buf = new Uint8Array([0, 1, SdfListOpSubListType.Prepended, 1, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff]);
    expect(() => decodeTokenListOp(buf)).toThrow();
  });
});
