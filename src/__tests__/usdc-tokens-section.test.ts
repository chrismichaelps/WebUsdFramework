/**
 * Tests for the USDC TOKENS section encoder + interning table.
 *
 * The TOKENS section is the foundation everything else in USDC depends on:
 * fields, paths, and string-typed values all reference the table by index.
 * These tests cover both the layout (24-byte header + LZ4 payload) and the
 * round-trip property of `encodeTokensSection` / `decodeTokensSection`.
 */
import { describe, it, expect } from 'vitest';
import {
  TokenTable,
  encodeTokensSection,
  decodeTokensSection,
  TOKENS_SECTION_HEADER_SIZE,
} from '../converters/shared/usdc/tokens-section';

describe('TokenTable interning', () => {
  it('returns 0 for the first interned token', () => {
    const t = new TokenTable();
    expect(t.intern('Root')).toBe(0);
  });

  it('returns the same index for repeated interns of the same string', () => {
    const t = new TokenTable();
    expect(t.intern('Root')).toBe(0);
    expect(t.intern('Materials')).toBe(1);
    expect(t.intern('Root')).toBe(0);
    expect(t.intern('Materials')).toBe(1);
  });

  it('preserves insertion order in toArray()', () => {
    const t = new TokenTable();
    t.intern('a');
    t.intern('b');
    t.intern('a');
    t.intern('c');
    expect(t.toArray()).toEqual(['a', 'b', 'c']);
    expect(t.count).toBe(3);
  });

  it('looks up tokens by index', () => {
    const t = new TokenTable();
    t.intern('Xform');
    t.intern('Material');
    expect(t.get(0)).toBe('Xform');
    expect(t.get(1)).toBe('Material');
    expect(t.get(2)).toBeUndefined();
  });
});

describe('encodeTokensSection — section layout', () => {
  it('emits a 24-byte header for an empty token list', () => {
    const out = encodeTokensSection([]);
    expect(out.length).toBe(TOKENS_SECTION_HEADER_SIZE);

    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getBigUint64(0, true)).toBe(0n);  // numTokens
    expect(view.getBigUint64(8, true)).toBe(0n);  // uncompressedSize
    expect(view.getBigUint64(16, true)).toBe(0n); // compressedSize
  });

  it('writes header fields in little-endian uint64', () => {
    const out = encodeTokensSection(['Root']);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getBigUint64(0, true)).toBe(1n);
    // "Root\0" = 5 bytes uncompressed.
    expect(view.getBigUint64(8, true)).toBe(5n);
    // For tiny inputs LZ4 expands, so we expect the fallback: compressed == uncompressed.
    expect(view.getBigUint64(16, true)).toBe(5n);
  });

  it('falls back to verbatim storage when LZ4 expands the input', () => {
    // A single tiny string compresses larger than the original.
    const out = encodeTokensSection(['x']);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const uncompressedSize = Number(view.getBigUint64(8, true));
    const compressedSize = Number(view.getBigUint64(16, true));
    expect(compressedSize).toBe(uncompressedSize);
  });

  it('uses LZ4 compression for inputs that compress', () => {
    // Build a payload that compresses well: 1000 copies of the same token.
    const tokens = new Array(1000).fill('Geometries/geom_0');
    const out = encodeTokensSection(tokens);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const uncompressedSize = Number(view.getBigUint64(8, true));
    const compressedSize = Number(view.getBigUint64(16, true));
    expect(compressedSize).toBeLessThan(uncompressedSize);
  });
});

describe('encodeTokensSection / decodeTokensSection round-trip', () => {
  function roundTrip(tokens: ReadonlyArray<string>): string[] {
    return decodeTokensSection(encodeTokensSection(tokens));
  }

  it('round-trips an empty list', () => {
    expect(roundTrip([])).toEqual([]);
  });

  it('round-trips a single ASCII identifier', () => {
    expect(roundTrip(['Root'])).toEqual(['Root']);
  });

  it('round-trips a list of typical USD identifiers', () => {
    const tokens = [
      'Root',
      'Materials',
      'Scene',
      'PlyPoints',
      'point3f[]',
      'points',
      'float[]',
      'widths',
      'color3f[]',
      'primvars:displayColor',
      'uniform token primvars:displayColor:interpolation',
      'vertex',
      'token outputs:surface',
      'UsdPreviewSurface',
      'inputs:diffuseColor',
      'inputs:roughness',
      'inputs:metallic',
      'inputs:opacity',
    ];
    expect(roundTrip(tokens)).toEqual(tokens);
  });

  it('round-trips multi-byte UTF-8 strings', () => {
    const tokens = ['Mëtěr', 'résumé', '日本語', '🚀rocket'];
    expect(roundTrip(tokens)).toEqual(tokens);
  });

  it('round-trips a TokenTable.encode() output', () => {
    const t = new TokenTable();
    t.intern('Root');
    t.intern('Materials');
    t.intern('Scene');
    t.intern('Root'); // duplicate — must not change the encoding
    expect(decodeTokensSection(t.encode())).toEqual(['Root', 'Materials', 'Scene']);
  });

  it('round-trips a large repetitive payload (LZ4 path)', () => {
    const tokens: string[] = [];
    for (let i = 0; i < 500; i++) tokens.push(`Geometries/geom_${i}`);
    expect(roundTrip(tokens)).toEqual(tokens);
  });
});

describe('decodeTokensSection — error paths', () => {
  it('throws on truncated header', () => {
    expect(() => decodeTokensSection(new Uint8Array(10))).toThrow();
  });

  it('throws when payload length disagrees with header', () => {
    const out = encodeTokensSection(['Root', 'Materials']);
    // Truncate the payload by one byte.
    expect(() => decodeTokensSection(out.slice(0, out.length - 1))).toThrow();
  });
});
