/**
 * Tests for the USDC ValueRep packer + inlined-value helpers.
 *
 * These cover the bit layout (encode → decode round-trip), the per-type
 * inlined helpers (Bool / Int / Float / Token / Specifier / Variability /
 * Permission), the external-offset path, and the bounds-check error paths.
 */
import { describe, it, expect } from 'vitest';
import {
  CrateDataType,
  SdfSpecifier,
  SdfVariability,
  SdfPermission,
  encodeValueRep,
  decodeValueRep,
  inlineBool,
  inlineInt,
  inlineFloat,
  extractInlineFloat,
  inlineToken,
  inlineSpecifier,
  inlineVariability,
  inlinePermission,
  externalValueRep,
} from '../converters/shared/usdc/value-rep';

describe('encodeValueRep / decodeValueRep round-trip', () => {
  it('round-trips an inlined Bool true', () => {
    const v = encodeValueRep({
      type: CrateDataType.Bool,
      isArray: false,
      isInlined: true,
      isCompressed: false,
      payload: 1n,
    });
    const fields = decodeValueRep(v);
    expect(fields.type).toBe(CrateDataType.Bool);
    expect(fields.isArray).toBe(false);
    expect(fields.isInlined).toBe(true);
    expect(fields.isCompressed).toBe(false);
    expect(fields.payload).toBe(1n);
  });

  it('round-trips an array, compressed external Vec3f at a high offset', () => {
    const v = encodeValueRep({
      type: CrateDataType.Vec3f,
      isArray: true,
      isInlined: false,
      isCompressed: true,
      payload: 0xabcdef123456n,
    });
    const fields = decodeValueRep(v);
    expect(fields.type).toBe(CrateDataType.Vec3f);
    expect(fields.isArray).toBe(true);
    expect(fields.isInlined).toBe(false);
    expect(fields.isCompressed).toBe(true);
    expect(fields.payload).toBe(0xabcdef123456n);
  });

  it('places type at bits 48–55 (verified by isolating the type byte)', () => {
    const v = encodeValueRep({
      type: CrateDataType.Token,
      isArray: false,
      isInlined: false,
      isCompressed: false,
      payload: 0n,
    });
    // Token = 11. Type byte should appear at byte 6 of the little-endian
    // uint64 representation (bits 48–55).
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigUint64(0, v, true);
    const typeByte = new Uint8Array(buf)[6];
    expect(typeByte).toBe(CrateDataType.Token);
  });

  it('places isArray at bit 63, isInlined at 62, isCompressed at 61', () => {
    const v = encodeValueRep({
      type: CrateDataType.Invalid,
      isArray: true,
      isInlined: true,
      isCompressed: true,
      payload: 0n,
    });
    expect(v & (1n << 63n)).not.toBe(0n);
    expect(v & (1n << 62n)).not.toBe(0n);
    expect(v & (1n << 61n)).not.toBe(0n);
  });

  it('rejects payload > 48 bits', () => {
    expect(() =>
      encodeValueRep({
        type: CrateDataType.Float,
        isArray: false,
        isInlined: true,
        isCompressed: false,
        payload: 1n << 48n,
      })
    ).toThrow(RangeError);
  });

  it('rejects type > uint8', () => {
    expect(() =>
      encodeValueRep({
        type: 256 as CrateDataType,
        isArray: false,
        isInlined: false,
        isCompressed: false,
        payload: 0n,
      })
    ).toThrow(RangeError);
  });
});

describe('inlined-value helpers', () => {
  it('inlineBool — true / false produce different ValueReps with the Bool tag', () => {
    const t = inlineBool(true);
    const f = inlineBool(false);
    expect(decodeValueRep(t).type).toBe(CrateDataType.Bool);
    expect(decodeValueRep(f).type).toBe(CrateDataType.Bool);
    expect(decodeValueRep(t).payload).toBe(1n);
    expect(decodeValueRep(f).payload).toBe(0n);
  });

  it('inlineInt — round-trips 0, positive, negative, and int32 limits', () => {
    for (const n of [0, 1, -1, 42, -42, 0x7fffffff, -0x80000000]) {
      const v = inlineInt(n);
      const fields = decodeValueRep(v);
      expect(fields.type).toBe(CrateDataType.Int);
      expect(fields.isInlined).toBe(true);
      // Recover the int32 from the low 32 bits of the payload.
      const low32 = Number(fields.payload & 0xffffffffn);
      const recovered = (low32 << 0); // uint32 → int32
      // For non-negative round-trips, it's straightforward; for negative
      // values we must sign-extend.
      const expected = n < 0 ? n + 0 : n; // identity, kept for clarity
      const actual = recovered | 0; // force int32 reinterpretation
      expect(actual).toBe(expected);
    }
  });

  it('inlineInt — rejects non-integers and out-of-range values', () => {
    expect(() => inlineInt(1.5)).toThrow(RangeError);
    expect(() => inlineInt(0x100000000)).toThrow(RangeError);
    expect(() => inlineInt(-0x80000001)).toThrow(RangeError);
  });

  it('inlineFloat / extractInlineFloat — round-trips representative values', () => {
    for (const f of [0.0, 1.0, -1.0, 0.5, -0.5, 3.14, Math.PI, Number.EPSILON]) {
      expect(extractInlineFloat(inlineFloat(f))).toBeCloseTo(f, 6);
    }
  });

  it('inlineFloat — preserves +0 / -0 distinction', () => {
    const pos = inlineFloat(0);
    const neg = inlineFloat(-0);
    // -0 has the sign bit set; positive zero does not.
    expect(pos).not.toBe(neg);
  });

  it('inlineToken — round-trips a TokenIndex in payload', () => {
    const v = inlineToken(7);
    const fields = decodeValueRep(v);
    expect(fields.type).toBe(CrateDataType.Token);
    expect(fields.isInlined).toBe(true);
    expect(fields.payload).toBe(7n);
  });

  it('inlineToken — rejects out-of-range indices', () => {
    expect(() => inlineToken(-1)).toThrow(RangeError);
    expect(() => inlineToken(0x100000000)).toThrow(RangeError);
    expect(() => inlineToken(1.5)).toThrow(RangeError);
  });

  it('inlineSpecifier — encodes def/over/class', () => {
    expect(decodeValueRep(inlineSpecifier(SdfSpecifier.Def)).payload).toBe(0n);
    expect(decodeValueRep(inlineSpecifier(SdfSpecifier.Over)).payload).toBe(1n);
    expect(decodeValueRep(inlineSpecifier(SdfSpecifier.Class)).payload).toBe(2n);
    expect(decodeValueRep(inlineSpecifier(SdfSpecifier.Def)).type).toBe(CrateDataType.Specifier);
  });

  it('inlineVariability — encodes varying/uniform', () => {
    expect(decodeValueRep(inlineVariability(SdfVariability.Varying)).payload).toBe(0n);
    expect(decodeValueRep(inlineVariability(SdfVariability.Uniform)).payload).toBe(1n);
    expect(decodeValueRep(inlineVariability(SdfVariability.Varying)).type).toBe(
      CrateDataType.Variability
    );
  });

  it('inlinePermission — encodes public/private', () => {
    expect(decodeValueRep(inlinePermission(SdfPermission.Public)).payload).toBe(0n);
    expect(decodeValueRep(inlinePermission(SdfPermission.Private)).payload).toBe(1n);
    expect(decodeValueRep(inlinePermission(SdfPermission.Public)).type).toBe(
      CrateDataType.Permission
    );
  });
});

describe('externalValueRep', () => {
  it('encodes a non-inlined array reference at a small offset', () => {
    const v = externalValueRep({
      type: CrateDataType.Vec3f,
      isArray: true,
      isCompressed: false,
      fileOffset: 1024,
    });
    const fields = decodeValueRep(v);
    expect(fields.type).toBe(CrateDataType.Vec3f);
    expect(fields.isArray).toBe(true);
    expect(fields.isInlined).toBe(false);
    expect(fields.isCompressed).toBe(false);
    expect(fields.payload).toBe(1024n);
  });

  it('encodes a compressed array reference at a multi-gigabyte offset', () => {
    const offset = 0x1234567890n;
    const v = externalValueRep({
      type: CrateDataType.Float,
      isArray: true,
      isCompressed: true,
      fileOffset: offset,
    });
    const fields = decodeValueRep(v);
    expect(fields.payload).toBe(offset);
    expect(fields.isCompressed).toBe(true);
  });

  it('rejects negative file offsets', () => {
    expect(() =>
      externalValueRep({
        type: CrateDataType.Vec3f,
        isArray: true,
        isCompressed: false,
        fileOffset: -1,
      })
    ).toThrow(RangeError);
  });

  it('rejects file offsets that do not fit in 48 bits', () => {
    expect(() =>
      externalValueRep({
        type: CrateDataType.Vec3f,
        isArray: true,
        isCompressed: false,
        fileOffset: 1n << 48n,
      })
    ).toThrow(RangeError);
  });
});
