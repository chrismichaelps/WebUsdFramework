/**
 * Byte-level unit tests for the USDC (Crate) writer scaffold.
 *
 * These assertions are intentionally low-level: they pin the exact bytes
 * emitted by `writeBootstrap` and `writeTOC` so any future change to the
 * format primitives must be deliberate and visible in this file.
 */
import { describe, it, expect } from 'vitest';
import {
  USDC_BOOTSTRAP_SIZE,
  USDC_DEFAULT_VERSION,
  USDC_MAGIC,
  USDC_SECTION_NAME_SIZE,
  USDC_TOC_ENTRY_SIZE,
  tocByteLength,
  writeBootstrap,
  writeTOC,
} from '../converters/shared/usdc-writer';

const MAGIC_STRING = 'PXR-USDC';

describe('USDC writer — bootstrap header', () => {
  it('is exactly 88 bytes', () => {
    expect(USDC_BOOTSTRAP_SIZE).toBe(88);
  });

  it('writes the PXR-USDC magic at the start', () => {
    const buf = new Uint8Array(USDC_BOOTSTRAP_SIZE);
    const view = new DataView(buf.buffer);

    writeBootstrap(view, 0, /* tocOffset */ 0);

    expect(Array.from(buf.subarray(0, 8))).toEqual(Array.from(USDC_MAGIC));
    expect(new TextDecoder('ascii').decode(buf.subarray(0, 8))).toBe(MAGIC_STRING);
  });

  it('writes the version triple followed by five zero bytes', () => {
    const buf = new Uint8Array(USDC_BOOTSTRAP_SIZE);
    const view = new DataView(buf.buffer);

    writeBootstrap(view, 0, 0, { major: 1, minor: 2, patch: 3 });

    expect(buf[8]).toBe(1);
    expect(buf[9]).toBe(2);
    expect(buf[10]).toBe(3);
    expect(Array.from(buf.subarray(11, 16))).toEqual([0, 0, 0, 0, 0]);
  });

  it('writes the default version (0.8.0) when none is supplied', () => {
    const buf = new Uint8Array(USDC_BOOTSTRAP_SIZE);
    const view = new DataView(buf.buffer);

    writeBootstrap(view, 0, 0);

    expect(buf[8]).toBe(USDC_DEFAULT_VERSION.major);
    expect(buf[9]).toBe(USDC_DEFAULT_VERSION.minor);
    expect(buf[10]).toBe(USDC_DEFAULT_VERSION.patch);
  });

  it('writes tocOffset as a little-endian int64 at byte 16', () => {
    const buf = new Uint8Array(USDC_BOOTSTRAP_SIZE);
    const view = new DataView(buf.buffer);
    const tocOffset = 0x0011_2233_4455; // arbitrary 6-byte value

    writeBootstrap(view, 0, tocOffset);

    expect(view.getBigInt64(16, /* littleEndian */ true)).toBe(BigInt(tocOffset));
    // Independent verification: rebuild the same value byte-by-byte.
    const lo = buf[16] | (buf[17] << 8) | (buf[18] << 16) | (buf[19] << 24);
    const hi = buf[20] | (buf[21] << 8) | (buf[22] << 16) | (buf[23] << 24);
    expect(lo >>> 0).toBe(tocOffset & 0xffff_ffff);
    expect(hi >>> 0).toBe(Math.floor(tocOffset / 2 ** 32));
  });

  it('zero-fills the 64-byte reserved region even when the buffer is dirty', () => {
    const buf = new Uint8Array(USDC_BOOTSTRAP_SIZE).fill(0xff);
    const view = new DataView(buf.buffer);

    writeBootstrap(view, 0, 0);

    for (let i = 24; i < USDC_BOOTSTRAP_SIZE; i++) {
      expect(buf[i]).toBe(0);
    }
  });

  it('returns the byte offset immediately after the bootstrap', () => {
    const buf = new Uint8Array(USDC_BOOTSTRAP_SIZE * 2);
    const view = new DataView(buf.buffer);

    expect(writeBootstrap(view, 0, 0)).toBe(USDC_BOOTSTRAP_SIZE);
    expect(writeBootstrap(view, USDC_BOOTSTRAP_SIZE, 0)).toBe(USDC_BOOTSTRAP_SIZE * 2);
  });

  it('honours non-zero offsets', () => {
    const buf = new Uint8Array(USDC_BOOTSTRAP_SIZE + 16).fill(0xee);
    const view = new DataView(buf.buffer);

    writeBootstrap(view, 16, /* tocOffset */ 0x42);

    // Bytes before the offset are untouched.
    for (let i = 0; i < 16; i++) {
      expect(buf[i]).toBe(0xee);
    }
    expect(new TextDecoder('ascii').decode(buf.subarray(16, 24))).toBe(MAGIC_STRING);
    expect(view.getBigInt64(16 + 16, true)).toBe(0x42n);
  });

  it('throws when the write would overflow the buffer', () => {
    const tooSmall = new DataView(new ArrayBuffer(USDC_BOOTSTRAP_SIZE - 1));
    expect(() => writeBootstrap(tooSmall, 0, 0)).toThrow(/out of bounds/);
  });

  it('throws on negative or non-integer tocOffset', () => {
    const view = new DataView(new ArrayBuffer(USDC_BOOTSTRAP_SIZE));
    expect(() => writeBootstrap(view, 0, -1)).toThrow(/non-negative integer/);
    expect(() => writeBootstrap(view, 0, 1.5)).toThrow(/non-negative integer/);
  });
});

describe('USDC writer — TOC', () => {
  it('reports correct byte length for empty and non-empty TOCs', () => {
    expect(USDC_TOC_ENTRY_SIZE).toBe(32);
    expect(tocByteLength(0)).toBe(8);
    expect(tocByteLength(1)).toBe(8 + 32);
    expect(tocByteLength(7)).toBe(8 + 7 * 32);
  });

  it('rejects invalid section counts', () => {
    expect(() => tocByteLength(-1)).toThrow();
    expect(() => tocByteLength(1.5)).toThrow();
  });

  it('writes the section count as a little-endian uint64', () => {
    const sections = [
      { name: 'TOKENS', start: 100, size: 32 },
      { name: 'STRINGS', start: 132, size: 16 },
      { name: 'FIELDS', start: 148, size: 64 },
    ];
    const total = tocByteLength(sections.length);
    const view = new DataView(new ArrayBuffer(total));

    writeTOC(view, 0, sections);

    expect(view.getBigUint64(0, /* littleEndian */ true)).toBe(BigInt(sections.length));
  });

  it('encodes each section as { char[16] name, int64 start, int64 size } little-endian', () => {
    const sections = [
      { name: 'TOKENS', start: 0x1122_3344, size: 0x55 },
      { name: 'PATHS', start: 0x6677_8899, size: 0xaabb },
    ];
    const view = new DataView(new ArrayBuffer(tocByteLength(sections.length)));

    writeTOC(view, 0, sections);

    let cursor = 8;
    for (const expected of sections) {
      const nameBytes = new Uint8Array(view.buffer, cursor, USDC_SECTION_NAME_SIZE);
      const nullIdx = nameBytes.indexOf(0);
      const decodedName = new TextDecoder('ascii').decode(
        nameBytes.subarray(0, nullIdx === -1 ? USDC_SECTION_NAME_SIZE : nullIdx)
      );
      expect(decodedName).toBe(expected.name);

      // Bytes after the name terminator must be zero (zero-padded section).
      for (let i = expected.name.length; i < USDC_SECTION_NAME_SIZE; i++) {
        expect(nameBytes[i]).toBe(0);
      }
      cursor += USDC_SECTION_NAME_SIZE;

      expect(view.getBigInt64(cursor, true)).toBe(BigInt(expected.start));
      cursor += 8;

      expect(view.getBigInt64(cursor, true)).toBe(BigInt(expected.size));
      cursor += 8;
    }
  });

  it('truncates section names longer than 15 bytes and keeps a null terminator', () => {
    const longName = 'A_VERY_LONG_SECTION_NAME';
    const sections = [{ name: longName, start: 0, size: 0 }];
    const view = new DataView(new ArrayBuffer(tocByteLength(1)));

    writeTOC(view, 0, sections);

    const nameBytes = new Uint8Array(view.buffer, 8, USDC_SECTION_NAME_SIZE);
    expect(nameBytes[USDC_SECTION_NAME_SIZE - 1]).toBe(0);
    expect(new TextDecoder('ascii').decode(nameBytes.subarray(0, USDC_SECTION_NAME_SIZE - 1))).toBe(
      longName.slice(0, USDC_SECTION_NAME_SIZE - 1)
    );
  });

  it('rejects non-ASCII section names without writing any bytes', () => {
    const buf = new Uint8Array(tocByteLength(1)).fill(0xee);
    const view = new DataView(buf.buffer);

    expect(() =>
      writeTOC(view, 0, [{ name: 'ÜNICODE', start: 0, size: 0 }])
    ).toThrow(/non-ASCII/);

    // Buffer must remain entirely untouched on validation failure.
    for (const b of buf) {
      expect(b).toBe(0xee);
    }
  });

  it('rejects negative start or size', () => {
    const view = new DataView(new ArrayBuffer(tocByteLength(1)));
    expect(() => writeTOC(view, 0, [{ name: 'X', start: -1, size: 0 }])).toThrow(/invalid start/);
    expect(() => writeTOC(view, 0, [{ name: 'X', start: 0, size: -1 }])).toThrow(/invalid size/);
  });

  it('throws when the write would overflow the buffer', () => {
    const sections = [{ name: 'TOKENS', start: 0, size: 0 }];
    const tooSmall = new DataView(new ArrayBuffer(tocByteLength(sections.length) - 1));
    expect(() => writeTOC(tooSmall, 0, sections)).toThrow(/out of bounds/);
  });

  it('returns the byte offset immediately after the TOC', () => {
    const sections = [
      { name: 'TOKENS', start: 0, size: 0 },
      { name: 'PATHS', start: 0, size: 0 },
    ];
    const total = tocByteLength(sections.length);
    const view = new DataView(new ArrayBuffer(total + 16));

    expect(writeTOC(view, 0, sections)).toBe(total);
    expect(writeTOC(view, 16, sections)).toBe(16 + total);
  });
});

describe('USDC writer — bootstrap + TOC compose end-to-end', () => {
  it('produces a buffer whose tocOffset points at a readable TOC', () => {
    const sections = [
      { name: 'TOKENS', start: USDC_BOOTSTRAP_SIZE + 0, size: 0 },
      { name: 'STRINGS', start: USDC_BOOTSTRAP_SIZE + 0, size: 0 },
    ];
    const tocLen = tocByteLength(sections.length);
    const tocOffset = USDC_BOOTSTRAP_SIZE; // toc immediately follows bootstrap
    const buf = new Uint8Array(USDC_BOOTSTRAP_SIZE + tocLen);
    const view = new DataView(buf.buffer);

    writeBootstrap(view, 0, tocOffset);
    writeTOC(view, tocOffset, sections);

    // Re-read the tocOffset from the bootstrap and use it to find the count.
    const readTocOffset = Number(view.getBigInt64(16, true));
    expect(readTocOffset).toBe(tocOffset);
    expect(view.getBigUint64(readTocOffset, true)).toBe(BigInt(sections.length));
  });
});
