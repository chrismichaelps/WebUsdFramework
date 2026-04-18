/**
 * UsdNode unit tests
 *
 * Validates that the USD node serialization produces spec-compliant USDA.
 * These tests exist specifically to catch regressions like the half3→float3
 * scale type change (PR #88 / issue #89) that silently broke Apple Quick Look.
 */
import { describe, it, expect } from 'vitest';
import { UsdNode } from '../core/usd-node';

describe('UsdNode', () => {
  describe('serializeToUsda', () => {
    it('serializes properties with the declared type name', () => {
      const node = new UsdNode('/Root', 'Xform');
      node.setProperty('half3[] scales', '[(1, 1, 1)]', 'raw');

      const usda = node.serializeToUsda();
      expect(usda).toContain('half3[] scales = [(1, 1, 1)]');
      expect(usda).not.toContain('float3[] scales');
    });

    it('serializes time-sampled properties preserving their type key', () => {
      const node = new UsdNode('/Root/Anim', 'SkelAnimation');
      const timeSamples = new Map<number, string>();
      timeSamples.set(0, '[(1, 1, 1)]');
      timeSamples.set(4, '[(1, 1, 1)]');
      node.setTimeSampledProperty('half3[] scales', timeSamples, 'half3[]');

      const usda = node.serializeToUsda();
      expect(usda).toContain('half3[] scales.timeSamples');
      expect(usda).not.toContain('float3[] scales');
    });

    it('serializes quatf[] rotations type correctly', () => {
      const node = new UsdNode('/Root/Anim', 'SkelAnimation');
      node.setProperty('quatf[] rotations', '[(1, 0, 0, 0)]', 'raw');

      const usda = node.serializeToUsda();
      expect(usda).toContain('quatf[] rotations = [(1, 0, 0, 0)]');
    });

    it('serializes float3[] translations type correctly', () => {
      const node = new UsdNode('/Root/Anim', 'SkelAnimation');
      node.setProperty('float3[] translations', '[(0, 0, 0)]', 'raw');

      const usda = node.serializeToUsda();
      expect(usda).toContain('float3[] translations = [(0, 0, 0)]');
    });

    it('serializes matrix4d xformOp:transform correctly', () => {
      const node = new UsdNode('/Root/Mesh', 'Mesh');
      node.setProperty(
        'xformOp:transform',
        '( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1) )',
        'matrix4d'
      );
      node.setProperty('xformOpOrder', ['xformOp:transform'], 'token[]');

      const usda = node.serializeToUsda();
      expect(usda).toContain('matrix4d xformOp:transform');
      expect(usda).toContain('xformOpOrder');
    });
  });
});
