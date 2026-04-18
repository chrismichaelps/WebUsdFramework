/**
 * GLB→USDZ converter integration tests
 *
 * Converts real GLB files and asserts structural invariants on the USDA output.
 * These tests catch regressions that silently break rendering in Quick Look,
 * AR Quick Look, or usdview — even when usdchecker reports "Success!".
 *
 * Key invariants tested:
 * - SkelAnimation scales use half3[] (not float3[]) per USD spec
 * - SkelAnimation rotations use quatf[]
 * - SkelAnimation translations use float3[]
 * - defaultPrim exists and is valid
 * - skel:animationSource paths resolve within the stage
 * - skel:skeleton paths resolve within the stage
 * - Meshes with skeleton bindings have skel:geomBindTransform
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { convertGlbToUsdz } from '../converters/gltf';
import * as fs from 'fs';
import * as path from 'path';

const BUTTERFLY_GLB = path.resolve(__dirname, '../../models/glb/12_animated_butterflies.glb');

/**
 * Extract USDA text from a USDZ blob.
 * USDZ is an uncompressed zip; the first .usda or .usdc file is the root layer.
 * Our framework always writes ASCII USDA, so we can find it by scanning for the header.
 */
async function extractUsda(blob: Blob): Promise<string> {
  const buffer = Buffer.from(await blob.arrayBuffer());
  // The USDA content starts with "#usda 1.0" somewhere in the USDZ zip
  const marker = Buffer.from('#usda 1.0');
  const startIdx = buffer.indexOf(marker);
  if (startIdx === -1) {
    throw new Error('No USDA content found in USDZ blob');
  }

  // Find the end — look for the zip local file header signature (PK\x03\x04)
  // after the USDA start, or use end of buffer
  const pkSig = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  let endIdx = buffer.length;
  const nextPk = buffer.indexOf(pkSig, startIdx + 1);
  if (nextPk !== -1) {
    endIdx = nextPk;
  }

  // Trim trailing nulls (USDZ pads to 64-byte alignment)
  let usda = buffer.slice(startIdx, endIdx).toString('utf-8');
  usda = usda.replace(/\0+$/, '');
  return usda;
}

// Only run if the test GLB exists
const hasButterfly = fs.existsSync(BUTTERFLY_GLB);

describe.skipIf(!hasButterfly)('GLB → USDZ Converter', () => {
  let usda: string;

  beforeAll(async () => {
    const glbBuffer = fs.readFileSync(BUTTERFLY_GLB);
    const blob = await convertGlbToUsdz(glbBuffer.buffer as ArrayBuffer);
    usda = await extractUsda(blob);
    expect(usda.length).toBeGreaterThan(1000);
  }, 60_000);

  describe('USD header', () => {
    it('has a valid defaultPrim', () => {
      const match = usda.match(/defaultPrim\s*=\s*"(\w+)"/);
      expect(match).not.toBeNull();
      const defaultPrim = match![1];
      // The defaultPrim must exist as a top-level def
      expect(usda).toContain(`def Xform "${defaultPrim}"`);
    });

    it('has animation timing metadata', () => {
      expect(usda).toMatch(/startTimeCode\s*=/);
      expect(usda).toMatch(/endTimeCode\s*=/);
      expect(usda).toMatch(/timeCodesPerSecond\s*=/);
    });

    it('has autoPlay enabled', () => {
      expect(usda).toMatch(/autoPlay\s*=\s*true/);
    });

    it('has playbackMode loop', () => {
      expect(usda).toMatch(/playbackMode\s*=\s*"loop"/);
    });
  });

  describe('SkelAnimation schema compliance', () => {
    it('uses half3[] for scales (not float3[])', () => {
      // This is THE regression test for issue #89 / PR #88.
      // Apple Quick Look silently ignores skeleton animations when scales
      // use float3[] instead of the spec-required half3[].
      const scaleLines = usda.split('\n').filter(
        (l) => l.includes('scales') && !l.trim().startsWith('//')
      );

      // Must have at least one scales declaration (the model has skeletons)
      expect(scaleLines.length).toBeGreaterThan(0);

      // Every scales reference must be half3, never float3
      for (const line of scaleLines) {
        if (line.includes('float3[] scales')) {
          throw new Error(
            `SkelAnimation scales must use half3[], not float3[]. ` +
            `float3 silently breaks Apple Quick Look animation.\n` +
            `  Found: ${line.trim()}`
          );
        }
      }
      expect(usda).toContain('half3[] scales');
    });

    it('uses quatf[] for rotations', () => {
      expect(usda).toContain('quatf[] rotations');
      expect(usda).not.toMatch(/float4\[\]\s*rotations/);
    });

    it('uses float3[] for translations', () => {
      expect(usda).toContain('float3[] translations');
    });
  });

  describe('skeleton binding integrity', () => {
    it('every skel:animationSource path points to an existing prim', () => {
      const animSourceRe = /skel:animationSource\s*=\s*<([^>]+)>/g;
      let match;
      const paths: string[] = [];
      while ((match = animSourceRe.exec(usda)) !== null) {
        paths.push(match[1]);
      }

      expect(paths.length).toBeGreaterThan(0);

      for (const animPath of paths) {
        // The prim name is the last segment of the path
        const primName = animPath.split('/').pop()!;
        // It should appear as a def SkelAnimation "PrimName" in the USDA
        expect(usda).toContain(`"${primName}"`);
      }
    });

    it('every skel:skeleton path points to an existing prim', () => {
      const skelRe = /skel:skeleton\s*=\s*<([^>]+)>/g;
      let match;
      const paths: string[] = [];
      while ((match = skelRe.exec(usda)) !== null) {
        paths.push(match[1]);
      }

      expect(paths.length).toBeGreaterThan(0);

      for (const skelPath of paths) {
        const primName = skelPath.split('/').pop()!;
        expect(usda).toContain(`"${primName}"`);
      }
    });

    it('skinned meshes have skel:geomBindTransform', () => {
      // Every mesh that references skel:skeleton should have geomBindTransform
      const skelBindingRe = /rel skel:skeleton/g;
      const geomBindRe = /skel:geomBindTransform/g;

      const skelBindings = usda.match(skelBindingRe) || [];
      const geomBinds = usda.match(geomBindRe) || [];

      expect(skelBindings.length).toBeGreaterThan(0);
      // Each skeleton binding should have a corresponding geomBindTransform
      expect(geomBinds.length).toBe(skelBindings.length);
    });
  });

  describe('material bindings', () => {
    it('has material bindings on meshes', () => {
      expect(usda).toContain('material:binding');
    });

    it('material bindings reference existing materials', () => {
      const bindingRe = /material:binding\s*=\s*<([^>]+)>/g;
      let match;
      const materialPaths: Set<string> = new Set();
      while ((match = bindingRe.exec(usda)) !== null) {
        materialPaths.add(match[1]);
      }

      expect(materialPaths.size).toBeGreaterThan(0);

      for (const matPath of materialPaths) {
        const matName = matPath.split('/').pop()!;
        expect(usda).toContain(`def Material "${matName}"`);
      }
    });
  });

  describe('mesh geometry', () => {
    it('all meshes have doubleSided set', () => {
      const meshBlocks = usda.split(/def Mesh/).slice(1); // skip first (before any mesh)
      expect(meshBlocks.length).toBeGreaterThan(0);

      for (const block of meshBlocks) {
        // Only check up to the next def (don't bleed into children)
        const upToNextDef = block.split(/\ndef /)[0];
        expect(upToNextDef).toContain('doubleSided');
      }
    });
  });
});
