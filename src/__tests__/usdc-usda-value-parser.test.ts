/**
 * Tests for the USDA literal parser used by the UsdNode → USDC adapter.
 *
 * The converters store several property values as USDA-formatted strings
 * (e.g. `"(0.7, 0.7, 0.7)"` for color3f scalars, `"[(...), (...)]"` for
 * `float3[] extent`). These parsers turn them into the typed numeric
 * arrays the USDC encoders consume. The tests cover the happy paths plus
 * the malformed-input rejections.
 */
import { describe, it, expect } from 'vitest';
import {
  parseVec3fScalar,
  parseVec2fScalar,
  parseVec3fArray,
} from '../converters/shared/usdc/usda-value-parser';

describe('parseVec3fScalar', () => {
  it('parses a basic 3-tuple', () => {
    const out = parseVec3fScalar('(0.7, 0.7, 0.7)');
    expect(Array.from(out!)).toEqual([0.7, 0.7, 0.7].map((v) => Math.fround(v)));
  });

  it('tolerates whitespace and negative values', () => {
    const out = parseVec3fScalar('(  -1.0 ,  0 , 2.5 )');
    expect(Array.from(out!)).toEqual([-1.0, 0, 2.5]);
  });

  it('returns null when arity is wrong', () => {
    expect(parseVec3fScalar('(1, 2)')).toBeNull();
    expect(parseVec3fScalar('(1, 2, 3, 4)')).toBeNull();
  });

  it('returns null for non-numeric tokens', () => {
    expect(parseVec3fScalar('(1, foo, 3)')).toBeNull();
  });

  it('returns null when parens are missing', () => {
    expect(parseVec3fScalar('1, 2, 3')).toBeNull();
    expect(parseVec3fScalar('(1, 2, 3')).toBeNull();
    expect(parseVec3fScalar('1, 2, 3)')).toBeNull();
  });
});

describe('parseVec2fScalar', () => {
  it('parses a basic 2-tuple', () => {
    expect(Array.from(parseVec2fScalar('(0.5, 0.75)')!)).toEqual([0.5, 0.75]);
  });

  it('rejects 3-tuples', () => {
    expect(parseVec2fScalar('(1, 2, 3)')).toBeNull();
  });
});

describe('parseVec3fArray', () => {
  it('parses an empty array', () => {
    const out = parseVec3fArray('[]');
    expect(out).toBeInstanceOf(Float32Array);
    expect(out!.length).toBe(0);
  });

  it('parses a single 3-tuple', () => {
    expect(Array.from(parseVec3fArray('[(0, 0, 0)]')!)).toEqual([0, 0, 0]);
  });

  it('parses two tuples (the typical extent shape)', () => {
    const out = parseVec3fArray('[(-1, -2, -3), (4, 5, 6)]');
    expect(Array.from(out!)).toEqual([-1, -2, -3, 4, 5, 6]);
  });

  it('parses many tuples with mixed whitespace', () => {
    const out = parseVec3fArray('[ (0,0,0) , (1,2,3),(4,5,6) ]');
    expect(Array.from(out!)).toEqual([0, 0, 0, 1, 2, 3, 4, 5, 6]);
  });

  it('returns null when outer brackets are missing', () => {
    expect(parseVec3fArray('(1,2,3)')).toBeNull();
  });

  it('returns null when an inner tuple has wrong arity', () => {
    expect(parseVec3fArray('[(1,2,3), (4,5)]')).toBeNull();
  });

  it('returns null when parentheses are unbalanced', () => {
    expect(parseVec3fArray('[(1,2,3)')).toBeNull();
    expect(parseVec3fArray('[(1,2,3))]')).toBeNull();
  });

  it('returns null on non-numeric content', () => {
    expect(parseVec3fArray('[(a, b, c)]')).toBeNull();
  });
});
