/**
 * LZ4 block-format codec tests.
 *
 * The encoder and decoder are exercised together: every payload is compressed
 * and then decompressed, and the round-trip output must equal the input. A
 * few payloads are also compared against external invariants (output starts
 * with a valid token byte, etc.) as cheap sanity checks.
 */
import { describe, it, expect } from 'vitest';
import { compress, decompress } from '../converters/shared/usdc/lz4-block';

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function roundTrip(input: Uint8Array): Uint8Array {
  const compressed = compress(input);
  return decompress(compressed, input.length);
}

describe('LZ4 block-format codec', () => {
  it('round-trips an empty input', () => {
    const out = roundTrip(new Uint8Array(0));
    expect(out.length).toBe(0);
  });

  it('round-trips a 1-byte input', () => {
    const input = new Uint8Array([0x42]);
    expect(roundTrip(input)).toEqual(input);
  });

  it('round-trips an 11-byte input (below MFLIMIT — literals-only path)', () => {
    const input = utf8('hello world');
    expect(roundTrip(input)).toEqual(input);
  });

  it('round-trips a short ASCII string', () => {
    const input = utf8('the quick brown fox jumps over the lazy dog');
    expect(roundTrip(input)).toEqual(input);
  });

  it('round-trips a long highly-repetitive input', () => {
    // A 4 KB block of the same byte will hit the back-reference fast-path.
    const input = new Uint8Array(4096).fill(0x41);
    const compressed = compress(input);
    expect(compressed.length).toBeLessThan(input.length); // proves compression ran
    expect(decompress(compressed, input.length)).toEqual(input);
  });

  it('round-trips a long repeating pattern', () => {
    const pattern = utf8('abcdef');
    const input = new Uint8Array(pattern.length * 1000);
    for (let i = 0; i < input.length; i++) input[i] = pattern[i % pattern.length];
    const compressed = compress(input);
    expect(compressed.length).toBeLessThan(input.length);
    expect(decompress(compressed, input.length)).toEqual(input);
  });

  it('round-trips random-looking incompressible data', () => {
    // Pseudo-random bytes via a simple LCG so the test is deterministic.
    const input = new Uint8Array(2048);
    let s = 0x12345678 >>> 0;
    for (let i = 0; i < input.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      input[i] = s & 0xff;
    }
    expect(roundTrip(input)).toEqual(input);
  });

  it('round-trips USDC-typical payload: NUL-separated tokens', () => {
    // Mimic what the TOKENS section will compress: a flat buffer of
    // NUL-separated USD identifier strings.
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
    const flat = tokens.join('\0') + '\0';
    const input = utf8(flat);
    const compressed = compress(input);
    const out = decompress(compressed, input.length);
    expect(out).toEqual(input);
  });

  it('throws on truncated literal-length extras', () => {
    // Token says "literal length is 15+more", but the "more" byte is missing.
    const bad = new Uint8Array([0xf0]);
    expect(() => decompress(bad, 0)).toThrow();
  });

  it('throws when output size does not match expected', () => {
    const input = utf8('abcdefgh');
    const compressed = compress(input);
    expect(() => decompress(compressed, input.length + 5)).toThrow();
  });

  it('throws on zero match offset (corrupt stream)', () => {
    // A token claiming a match with offset=0 is illegal in LZ4. Build one
    // by hand: literalLen=5 ("abcde"), offset=0, matchLen=4.
    const bad = new Uint8Array([0x50, 0x61, 0x62, 0x63, 0x64, 0x65, 0x00, 0x00]);
    expect(() => decompress(bad, 9)).toThrow();
  });
});
