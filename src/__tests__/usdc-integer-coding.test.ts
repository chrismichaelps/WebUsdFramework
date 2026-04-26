/**
 * Round-trip tests for the TfDelta integer-coding utility.
 *
 * Both int32 and int64 paths are exercised end-to-end. Each test compresses
 * a sequence and immediately decompresses it; the result must equal the input
 * exactly (including signed values and large jumps that exercise all four
 * code widths).
 */
import { describe, it, expect } from 'vitest';
import {
  compressInt32,
  decompressInt32,
  compressInt64,
  decompressInt64,
  int32CompressedBound,
  int64CompressedBound,
} from '../converters/shared/usdc/integer-coding';

function roundTripInt32(input: number[]): number[] {
  const compressed = compressInt32(input);
  const decompressed = decompressInt32(compressed, input.length);
  return Array.from(decompressed);
}

function roundTripInt64(input: bigint[]): bigint[] {
  const compressed = compressInt64(input);
  const decompressed = decompressInt64(compressed, input.length);
  return Array.from(decompressed);
}

describe('TfDelta integer coding — int32', () => {
  it('round-trips an empty array', () => {
    expect(roundTripInt32([])).toEqual([]);
  });

  it('round-trips a single value', () => {
    expect(roundTripInt32([42])).toEqual([42]);
  });

  it('round-trips small monotonically increasing deltas (byte-code path)', () => {
    expect(roundTripInt32([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('round-trips negative deltas (still byte-code)', () => {
    expect(roundTripInt32([100, 99, 98, 50, 49, 48])).toEqual([100, 99, 98, 50, 49, 48]);
  });

  it('round-trips medium deltas (word-code path)', () => {
    const input = [0, 1000, 2000, 3000, 4000];
    expect(roundTripInt32(input)).toEqual(input);
  });

  it('round-trips large deltas (dword-code path)', () => {
    const input = [0, 0x40000000, -0x40000000, 0x7fffffff, -0x7fffffff];
    expect(roundTripInt32(input)).toEqual(input);
  });

  it('round-trips a mixed-width sequence', () => {
    const input = [
      0,            // byte
      127,          // byte
      -128,         // byte
      32767,        // word
      -32768,       // word
      0x12345678,   // dword
      -0x12345678,  // dword
      0,            // byte
    ];
    expect(roundTripInt32(input)).toEqual(input);
  });

  it('round-trips a sequence representative of a USDC FieldSet (small ints)', () => {
    // FieldSet entries are typically 0..N field indices in monotonically
    // increasing order, terminated by ~0 in the source, but we encode the
    // ints themselves. This case mimics that.
    const input = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 8, 9, 10];
    expect(roundTripInt32(input)).toEqual(input);
  });

  it('produces output within int32CompressedBound', () => {
    const input = [0, 1, 2, 3, 0x7fffffff, -0x7fffffff, 100];
    const compressed = compressInt32(input);
    expect(compressed.length).toBeLessThanOrEqual(int32CompressedBound(input.length));
  });

  it('throws when source is too small for declared count', () => {
    expect(() => decompressInt32(new Uint8Array(0), 5)).toThrow();
  });
});

describe('TfDelta integer coding — int64', () => {
  it('round-trips an empty array', () => {
    expect(roundTripInt64([])).toEqual([]);
  });

  it('round-trips a single value', () => {
    expect(roundTripInt64([42n])).toEqual([42n]);
  });

  it('round-trips small deltas (byte-code path)', () => {
    expect(roundTripInt64([0n, 1n, 2n, 3n, 4n])).toEqual([0n, 1n, 2n, 3n, 4n]);
  });

  it('round-trips word-sized deltas', () => {
    const input = [0n, 1000n, 2000n, 3000n];
    expect(roundTripInt64(input)).toEqual(input);
  });

  it('round-trips dword-sized deltas', () => {
    const input = [0n, 0x40000000n, -0x40000000n];
    expect(roundTripInt64(input)).toEqual(input);
  });

  it('round-trips qword-sized deltas (full int64 range)', () => {
    const input = [0n, 0x7fffffffffffffffn, -0x7fffffffffffffffn];
    expect(roundTripInt64(input)).toEqual(input);
  });

  it('round-trips a mixed-width sequence', () => {
    const input = [
      0n,                       // byte
      100n,                     // byte
      -1n,                      // byte
      40000n,                   // word
      0x12345678n,              // dword
      0x123456789abcdefn,       // qword
      0n,                       // byte
    ];
    expect(roundTripInt64(input)).toEqual(input);
  });

  it('handles BigInt64Array input directly', () => {
    const input = BigInt64Array.from([0n, 100n, 200n, 300n]);
    const compressed = compressInt64(input);
    const decompressed = decompressInt64(compressed, input.length);
    expect(Array.from(decompressed)).toEqual(Array.from(input));
  });

  it('produces output within int64CompressedBound', () => {
    const input = [0n, 1n, 0x7fffffffffffffffn, -0x7fffffffffffffffn];
    const compressed = compressInt64(input);
    expect(compressed.length).toBeLessThanOrEqual(int64CompressedBound(input.length));
  });

  it('throws when source is too small for declared count', () => {
    expect(() => decompressInt64(new Uint8Array(0), 5)).toThrow();
  });
});

describe('TfDelta integer coding — sizing', () => {
  it('byte-only sequences emit ceil(n/4) header + n payload bytes', () => {
    const input = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // 9 ints, all byte-deltas
    const compressed = compressInt32(input);
    // 9 ints => ceil(9/4) = 3 header bytes + 9 payload bytes = 12 total
    expect(compressed.length).toBe(12);
  });

  it('compresses better than fixed 4-byte-per-int when most deltas are small', () => {
    const input: number[] = [];
    for (let i = 0; i < 100; i++) input.push(i);
    const compressed = compressInt32(input);
    expect(compressed.length).toBeLessThan(input.length * 4);
  });
});
