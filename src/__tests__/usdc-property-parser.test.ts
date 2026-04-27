/**
 * Tests for the UsdNode property-key parser.
 *
 * UsdNode property keys use a USDA-style line head; the parser splits them
 * into a structured descriptor the USDC encoder can switch on. These tests
 * cover the typical scalar / array / qualified-attribute shapes the live
 * converters emit, plus the common non-attribute keys (relationships,
 * connections, list-ops) that are routed back to the USDA fallback.
 */
import { describe, it, expect } from 'vitest';
import { parsePropertyKey } from '../converters/shared/usdc/property-parser';
import { CrateDataType } from '../converters/shared/usdc/value-rep';

describe('parsePropertyKey — scalar attributes', () => {
  it('parses a float scalar', () => {
    const r = parsePropertyKey('float inputs:roughness');
    expect(r).toEqual({
      kind: 'attribute',
      name: 'inputs:roughness',
      type: CrateDataType.Float,
      isArray: false,
      isUniform: false,
    });
  });

  it('parses a token scalar', () => {
    const r = parsePropertyKey('token outputs:surface');
    expect(r).toEqual({
      kind: 'attribute',
      name: 'outputs:surface',
      type: CrateDataType.Token,
      isArray: false,
      isUniform: false,
    });
  });

  it('parses a uniform-qualified token', () => {
    const r = parsePropertyKey('uniform token info:id');
    expect(r).toEqual({
      kind: 'attribute',
      name: 'info:id',
      type: CrateDataType.Token,
      isArray: false,
      isUniform: true,
    });
  });

  it('parses a uniform-qualified primvar token', () => {
    const r = parsePropertyKey('uniform token primvars:displayColor:interpolation');
    if (r.kind !== 'attribute') throw new Error('expected attribute');
    expect(r.name).toBe('primvars:displayColor:interpolation');
    expect(r.type).toBe(CrateDataType.Token);
    expect(r.isUniform).toBe(true);
  });

  it('parses an int scalar', () => {
    const r = parsePropertyKey('int someCount');
    expect(r.kind).toBe('attribute');
    if (r.kind !== 'attribute') return;
    expect(r.type).toBe(CrateDataType.Int);
  });

  it('parses a color3f scalar (Vec3f)', () => {
    const r = parsePropertyKey('color3f inputs:diffuseColor');
    if (r.kind !== 'attribute') throw new Error('expected attribute');
    expect(r.type).toBe(CrateDataType.Vec3f);
    expect(r.isArray).toBe(false);
  });
});

describe('parsePropertyKey — array attributes', () => {
  it('parses point3f[] points', () => {
    const r = parsePropertyKey('point3f[] points');
    expect(r).toEqual({
      kind: 'attribute',
      name: 'points',
      type: CrateDataType.Vec3f,
      isArray: true,
      isUniform: false,
    });
  });

  it('parses normal3f[] normals', () => {
    const r = parsePropertyKey('normal3f[] normals');
    if (r.kind !== 'attribute') throw new Error('expected attribute');
    expect(r.type).toBe(CrateDataType.Vec3f);
    expect(r.isArray).toBe(true);
  });

  it('parses color3f[] primvars:displayColor', () => {
    const r = parsePropertyKey('color3f[] primvars:displayColor');
    if (r.kind !== 'attribute') throw new Error('expected attribute');
    expect(r.name).toBe('primvars:displayColor');
    expect(r.type).toBe(CrateDataType.Vec3f);
    expect(r.isArray).toBe(true);
  });

  it('parses float[] widths', () => {
    const r = parsePropertyKey('float[] widths');
    if (r.kind !== 'attribute') throw new Error('expected attribute');
    expect(r.type).toBe(CrateDataType.Float);
    expect(r.isArray).toBe(true);
  });

  it('parses int[] faceVertexIndices', () => {
    const r = parsePropertyKey('int[] faceVertexIndices');
    if (r.kind !== 'attribute') throw new Error('expected attribute');
    expect(r.type).toBe(CrateDataType.Int);
    expect(r.isArray).toBe(true);
  });

  it('parses float3[] extent (treated as Vec3f[])', () => {
    const r = parsePropertyKey('float3[] extent');
    if (r.kind !== 'attribute') throw new Error('expected attribute');
    expect(r.type).toBe(CrateDataType.Vec3f);
    expect(r.isArray).toBe(true);
  });

  it('parses texCoord2f[] (Vec2f[])', () => {
    const r = parsePropertyKey('texCoord2f[] primvars:st');
    if (r.kind !== 'attribute') throw new Error('expected attribute');
    expect(r.type).toBe(CrateDataType.Vec2f);
    expect(r.isArray).toBe(true);
  });
});

describe('parsePropertyKey — list-op metadata', () => {
  it('parses prepend xxx as a prepended list-op', () => {
    const r = parsePropertyKey('prepend apiSchemas');
    expect(r).toEqual({ kind: 'list-op', name: 'apiSchemas', opcode: 'prepended' });
  });

  it('parses append xxx as an appended list-op', () => {
    const r = parsePropertyKey('append apiSchemas');
    expect(r).toEqual({ kind: 'list-op', name: 'apiSchemas', opcode: 'appended' });
  });

  it('parses prepend references as a list-op key', () => {
    const r = parsePropertyKey('prepend references');
    expect(r).toEqual({ kind: 'list-op', name: 'references', opcode: 'prepended' });
  });

  it('parses delete xxx as a deleted list-op', () => {
    const r = parsePropertyKey('delete apiSchemas');
    expect(r).toEqual({ kind: 'list-op', name: 'apiSchemas', opcode: 'deleted' });
  });

  it('returns unsupported when the list-op key is missing a name', () => {
    expect(parsePropertyKey('prepend ').kind).toBe('unsupported');
  });
});

describe('parsePropertyKey — relationship keys', () => {
  it('parses material:binding as a relationship', () => {
    const r = parsePropertyKey('material:binding');
    expect(r).toEqual({ kind: 'relationship', name: 'material:binding' });
  });

  it('parses material:binding:collection:foo as a relationship', () => {
    const r = parsePropertyKey('material:binding:collection:foo');
    expect(r).toEqual({
      kind: 'relationship',
      name: 'material:binding:collection:foo',
    });
  });

  it('parses an explicit `rel myRel` declaration', () => {
    const r = parsePropertyKey('rel myRel');
    expect(r).toEqual({ kind: 'relationship', name: 'myRel' });
  });

  it('returns unsupported when `rel` is missing a name', () => {
    expect(parsePropertyKey('rel ').kind).toBe('unsupported');
  });
});

describe('parsePropertyKey — non-attribute keys (unsupported)', () => {
  it('returns unsupported for connection (.connect suffix)', () => {
    const r = parsePropertyKey('token outputs:surface.connect');
    expect(r.kind).toBe('unsupported');
  });

  it('returns unsupported for an unknown type token', () => {
    const r = parsePropertyKey('matrix4d someXform');
    expect(r.kind).toBe('unsupported');
    if (r.kind === 'unsupported') {
      expect(r.reason).toContain('matrix4d');
    }
  });
});

describe('parsePropertyKey — malformed input', () => {
  it('returns unsupported for an empty string', () => {
    expect(parsePropertyKey('').kind).toBe('unsupported');
  });

  it('returns unsupported for whitespace only', () => {
    expect(parsePropertyKey('   ').kind).toBe('unsupported');
  });

  it('returns unsupported for a type token without a name', () => {
    expect(parsePropertyKey('float').kind).toBe('unsupported');
  });
});
