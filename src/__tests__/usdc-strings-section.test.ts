/**
 * Tests for the USDC STRINGS section encoder + StringTable.
 *
 * The STRINGS section is a thin index layer on top of TOKENS: every entry is
 * a uint32 TokenIndex. These tests cover round-trip equivalence, the header
 * byte layout, interning identity, and bounds-check error paths.
 */
import { describe, it, expect } from 'vitest';
import {
  StringTable,
  encodeStringsSection,
  decodeStringsSection,
  STRINGS_SECTION_HEADER_SIZE,
} from '../converters/shared/usdc/strings-section';

describe('StringTable interning', () => {
  it('returns 0 for the first interned token index', () => {
    const t = new StringTable();
    expect(t.intern(42)).toBe(0);
  });

  it('returns the same string index for repeated calls with the same token', () => {
    const t = new StringTable();
    expect(t.intern(7)).toBe(0);
    expect(t.intern(11)).toBe(1);
    expect(t.intern(7)).toBe(0);
    expect(t.intern(11)).toBe(1);
    expect(t.count).toBe(2);
  });

  it('preserves insertion order in toArray()', () => {
    const t = new StringTable();
    t.intern(10);
    t.intern(20);
    t.intern(10);
    t.intern(30);
    expect(t.toArray()).toEqual([10, 20, 30]);
  });

  it('looks up token indices by string index', () => {
    const t = new StringTable();
    t.intern(99);
    t.intern(100);
    expect(t.get(0)).toBe(99);
    expect(t.get(1)).toBe(100);
    expect(t.get(2)).toBeUndefined();
  });
});

describe('encodeStringsSection — section layout', () => {
  it('emits an 8-byte header for an empty list', () => {
    const out = encodeStringsSection([]);
    expect(out.length).toBe(STRINGS_SECTION_HEADER_SIZE);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getBigUint64(0, true)).toBe(0n);
  });

  it('writes count + uint32 entries little-endian', () => {
    const out = encodeStringsSection([0xdeadbeef, 0x12345678, 0]);
    expect(out.length).toBe(STRINGS_SECTION_HEADER_SIZE + 3 * 4);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getBigUint64(0, true)).toBe(3n);
    expect(view.getUint32(8, true)).toBe(0xdeadbeef);
    expect(view.getUint32(12, true)).toBe(0x12345678);
    expect(view.getUint32(16, true)).toBe(0);
  });

  it('rejects non-integer entries', () => {
    expect(() => encodeStringsSection([1.5])).toThrow(RangeError);
  });

  it('rejects negative entries', () => {
    expect(() => encodeStringsSection([-1])).toThrow(RangeError);
  });

  it('rejects entries above uint32 max', () => {
    expect(() => encodeStringsSection([0x1_0000_0000])).toThrow(RangeError);
  });
});

describe('encodeStringsSection / decodeStringsSection round-trip', () => {
  function roundTrip(indices: ReadonlyArray<number>): number[] {
    return decodeStringsSection(encodeStringsSection(indices));
  }

  it('round-trips an empty list', () => {
    expect(roundTrip([])).toEqual([]);
  });

  it('round-trips a single entry', () => {
    expect(roundTrip([7])).toEqual([7]);
  });

  it('round-trips a sequence of token indices', () => {
    const indices = [0, 1, 2, 3, 100, 1000, 65535, 0xffffffff];
    expect(roundTrip(indices)).toEqual(indices);
  });

  it('round-trips a StringTable.encode() output', () => {
    const t = new StringTable();
    t.intern(100);
    t.intern(200);
    t.intern(300);
    t.intern(100); // duplicate — must not change encoding
    expect(decodeStringsSection(t.encode())).toEqual([100, 200, 300]);
  });
});

describe('decodeStringsSection — error paths', () => {
  it('throws on truncated header', () => {
    expect(() => decodeStringsSection(new Uint8Array(4))).toThrow();
  });

  it('throws when payload is shorter than declared count', () => {
    const out = encodeStringsSection([1, 2, 3]);
    expect(() => decodeStringsSection(out.slice(0, out.length - 1))).toThrow();
  });
});
