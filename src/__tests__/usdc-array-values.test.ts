/**
 * Round-trip tests for the USDC array-value encoders (Float[], Vec3f[],
 * Int[], Token[]).
 *
 * Each encoder produces:
 *   - the on-disk bytes (with a uint64 count prefix and optional LZ4 envelope)
 *   - an `EncodedArrayValue` describing the type for the eventual ValueRep
 *
 * Round-trip tests decode the bytes through `decodeArrayHeader` and verify
 * the element data survives intact, including the LZ4-compressed path for
 * arrays large enough to trigger automatic compression.
 */
import { describe, it, expect } from 'vitest';
import {
  encodeFloatArray,
  encodeVec3fArray,
  encodeInt32Array,
  encodeTokenArray,
  decodeArrayHeader,
  arrayValueRep,
  COMPRESSION_THRESHOLD_BYTES,
} from '../converters/shared/usdc/array-values';
import { CrateDataType, decodeValueRep } from '../converters/shared/usdc/value-rep';

function readFloats(bytes: Uint8Array, count: number): number[] {
  const out: number[] = new Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

function readInts(bytes: Uint8Array, count: number): number[] {
  const out: number[] = new Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i++) out[i] = view.getInt32(i * 4, true);
  return out;
}

function readUint32s(bytes: Uint8Array, count: number): number[] {
  const out: number[] = new Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i++) out[i] = view.getUint32(i * 4, true);
  return out;
}

describe('encodeFloatArray', () => {
  it('encodes an empty array as just the count prefix', () => {
    const enc = encodeFloatArray([]);
    expect(enc.count).toBe(0);
    expect(enc.isCompressed).toBe(false);
    expect(enc.bytes.length).toBe(8);
    expect(enc.type).toBe(CrateDataType.Float);
  });

  it('round-trips a small array (uncompressed)', () => {
    const values = [1.5, -0.25, 0.5, 0.0];
    const enc = encodeFloatArray(values);
    expect(enc.isCompressed).toBe(false);
    const dec = decodeArrayHeader(enc.bytes, 0, false);
    expect(dec.count).toBe(values.length);
    const out = readFloats(dec.elementBytes, values.length);
    for (let i = 0; i < values.length; i++) expect(out[i]).toBeCloseTo(values[i], 6);
  });

  it('compresses arrays past the threshold and round-trips', () => {
    const count = (COMPRESSION_THRESHOLD_BYTES / 4) * 4; // well above threshold
    const values: number[] = new Array(count);
    for (let i = 0; i < count; i++) values[i] = (i % 5) * 0.5;
    const enc = encodeFloatArray(values);
    expect(enc.isCompressed).toBe(true);
    const dec = decodeArrayHeader(enc.bytes, 0, true);
    expect(dec.count).toBe(count);
    const out = readFloats(dec.elementBytes, count);
    for (let i = 0; i < count; i++) expect(out[i]).toBeCloseTo(values[i], 6);
  });
});

describe('encodeVec3fArray', () => {
  it('rejects non-multiple-of-3 inputs', () => {
    expect(() => encodeVec3fArray([1, 2])).toThrow(RangeError);
  });

  it('round-trips a small array', () => {
    const flat = [1, 2, 3, 4, 5, 6];
    const enc = encodeVec3fArray(flat);
    expect(enc.count).toBe(2);
    expect(enc.type).toBe(CrateDataType.Vec3f);
    const dec = decodeArrayHeader(enc.bytes, 0, enc.isCompressed);
    expect(readFloats(dec.elementBytes, flat.length)).toEqual(flat);
  });

  it('round-trips a large compressed Vec3f array', () => {
    // Use a repeating pattern so LZ4 actually compresses.
    const count = 1000;
    const flat: number[] = new Array(count * 3);
    for (let i = 0; i < count; i++) {
      flat[i * 3] = 0.5;
      flat[i * 3 + 1] = -0.5;
      flat[i * 3 + 2] = 1.0;
    }
    const enc = encodeVec3fArray(flat);
    expect(enc.isCompressed).toBe(true);
    const dec = decodeArrayHeader(enc.bytes, 0, true);
    expect(dec.count).toBe(count);
    const out = readFloats(dec.elementBytes, flat.length);
    for (let i = 0; i < flat.length; i++) expect(out[i]).toBeCloseTo(flat[i], 5);
  });
});

describe('encodeInt32Array', () => {
  it('round-trips a small Int32 array', () => {
    const values = [0, 1, -1, 0x7fffffff, -0x80000000, 42];
    const enc = encodeInt32Array(values);
    expect(enc.type).toBe(CrateDataType.Int);
    const dec = decodeArrayHeader(enc.bytes, 0, enc.isCompressed);
    expect(readInts(dec.elementBytes, values.length)).toEqual(values);
  });

  it('round-trips a large compressed Int32 array', () => {
    // Use a repeating pattern so LZ4 actually compresses.
    const count = 1000;
    const values: number[] = new Array(count);
    for (let i = 0; i < count; i++) values[i] = i % 8;
    const enc = encodeInt32Array(values);
    expect(enc.isCompressed).toBe(true);
    const dec = decodeArrayHeader(enc.bytes, 0, true);
    expect(dec.count).toBe(count);
    expect(readInts(dec.elementBytes, count)).toEqual(values);
  });
});

describe('encodeTokenArray', () => {
  it('round-trips a small Token array', () => {
    const indices = [0, 5, 10, 100];
    const enc = encodeTokenArray(indices);
    expect(enc.type).toBe(CrateDataType.Token);
    const dec = decodeArrayHeader(enc.bytes, 0, enc.isCompressed);
    expect(readUint32s(dec.elementBytes, indices.length)).toEqual(indices);
  });

  it('rejects negative or non-integer indices', () => {
    expect(() => encodeTokenArray([-1])).toThrow(RangeError);
    expect(() => encodeTokenArray([1.5])).toThrow(RangeError);
  });
});

describe('arrayValueRep', () => {
  it('builds a non-inlined ValueRep with the encoded type and isCompressed flag', () => {
    const enc = encodeFloatArray(new Array(200).fill(0.0)); // forces compression
    expect(enc.isCompressed).toBe(true);
    const rep = arrayValueRep(enc, 4096);
    const fields = decodeValueRep(rep);
    expect(fields.type).toBe(CrateDataType.Float);
    expect(fields.isArray).toBe(true);
    expect(fields.isInlined).toBe(false);
    expect(fields.isCompressed).toBe(true);
    expect(fields.payload).toBe(4096n);
  });

  it('respects forced compression=false', () => {
    const enc = encodeFloatArray(new Array(200).fill(0.0), { compress: false });
    expect(enc.isCompressed).toBe(false);
    const fields = decodeValueRep(arrayValueRep(enc, 0));
    expect(fields.isCompressed).toBe(false);
  });

  it('falls back to uncompressed when LZ4 expands the input', () => {
    // Tiny incompressible-shaped input: just a few bytes worth.
    const enc = encodeFloatArray([1.0, 2.0]);
    expect(enc.isCompressed).toBe(false);
  });
});
