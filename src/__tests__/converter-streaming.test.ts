/**
 * Per-converter byte-equivalence tests for the streaming output path.
 *
 * For each supported format (GLB, PLY, OBJ, STL) the streaming call
 *   convertXxxToUsdz(input, config, { outputPath })
 * must write bytes that are byte-for-byte identical to the in-memory buffered
 * call
 *   convertXxxToUsdz(input, config)  // → Blob
 *
 * Both invocations stamp `new Date()` into ZIP local/central-directory headers.
 * The system clock is pinned with `vi.setSystemTime` so those timestamps
 * are identical across both calls.
 *
 * GLB tests require the butterfly fixture; they are skipped automatically when
 * the file is absent (CI environments without large fixtures).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { convertGlbToUsdz } from '../converters/gltf';
import { convertPlyToUsdz } from '../converters/ply/ply-converter';
import { convertObjToUsdz } from '../converters/obj/obj-converter';
import { convertStlToUsdz } from '../converters/stl/stl-converter';

const BUTTERFLY_GLB = path.resolve(__dirname, '../../models/glb/12_animated_butterflies.glb');
const hasButterfly = fs.existsSync(BUTTERFLY_GLB);

/** ASCII PLY point cloud — 3 vertices, no faces. */
function makeMinimalPly(): ArrayBuffer {
  const text = [
    'ply',
    'format ascii 1.0',
    'element vertex 3',
    'property float x',
    'property float y',
    'property float z',
    'end_header',
    '0.0 0.0 0.0',
    '1.0 0.0 0.0',
    '0.0 1.0 0.0',
    '',
  ].join('\n');
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

/** OBJ mesh — single triangle. */
function makeMinimalObj(): ArrayBuffer {
  const text = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

/**
 * Binary STL — one triangle.
 * Layout: 80-byte header | uint32 count=1 | normal(f32×3) | v0,v1,v2(f32×3 each) | attr(u16)
 */
function makeMinimalStl(): ArrayBuffer {
  const buf = new ArrayBuffer(134); // 80 + 4 + 50
  const v = new DataView(buf);
  v.setUint32(80, 1, true);        // triangle count
  v.setFloat32(84, 0, true);       // normal x
  v.setFloat32(88, 0, true);       // normal y
  v.setFloat32(92, 1, true);       // normal z
  v.setFloat32(96, 0, true);       // v0 x
  v.setFloat32(100, 0, true);      // v0 y
  v.setFloat32(104, 0, true);      // v0 z
  v.setFloat32(108, 1, true);      // v1 x
  v.setFloat32(112, 0, true);      // v1 y
  v.setFloat32(116, 0, true);      // v1 z
  v.setFloat32(120, 0, true);      // v2 x
  v.setFloat32(124, 1, true);      // v2 y
  v.setFloat32(128, 0, true);      // v2 z
  v.setUint16(132, 0, true);       // attribute byte count
  return buf;
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Create a temp file path, run `fn`, then unlink regardless of outcome.
 * Uses Math.random() so the name is unique even with a pinned fake clock.
 */
async function withTmp(fn: (p: string) => Promise<void>): Promise<void> {
  const p = path.join(
    os.tmpdir(),
    `webusd-conv-streaming-${process.pid}-${Math.random().toString(36).slice(2)}.usdz`
  );
  try {
    await fn(p);
  } finally {
    try { fs.unlinkSync(p); } catch { /* best-effort */ }
  }
}


describe('Converter streaming — byte-equivalence with buffered output', () => {

  describe.skipIf(!hasButterfly)('GLB → USDZ', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
    });
    afterEach(() => { vi.useRealTimers(); });

    it('streaming output is byte-identical to buffered output', async () => {
      const buffer = fs.readFileSync(BUTTERFLY_GLB).buffer as ArrayBuffer;
      const buffered = await blobToBytes(await convertGlbToUsdz(buffer));

      await withTmp(async (tmpPath) => {
        const result = await convertGlbToUsdz(buffer, undefined, { outputPath: tmpPath });
        const onDisk = fs.readFileSync(tmpPath);

        expect(result.totalBytes, 'totalBytes matches on-disk size').toBe(onDisk.length);
        expect(onDisk.length, 'on-disk size matches buffered size').toBe(buffered.length);
        expect(Buffer.compare(onDisk, Buffer.from(buffered)), 'byte content is identical').toBe(0);
      });
    });

    it('result metadata is consistent', async () => {
      const buffer = fs.readFileSync(BUTTERFLY_GLB).buffer as ArrayBuffer;

      await withTmp(async (tmpPath) => {
        const result = await convertGlbToUsdz(buffer, undefined, { outputPath: tmpPath });
        const onDisk = fs.readFileSync(tmpPath);

        expect(result.totalBytes).toBe(onDisk.length);
        expect(result.fileCount).toBeGreaterThan(0);
        // The output is a valid USDZ: starts with ZIP local-file-header magic.
        expect(onDisk[0]).toBe(0x50);
        expect(onDisk[1]).toBe(0x4b);
        expect(onDisk[2]).toBe(0x03);
        expect(onDisk[3]).toBe(0x04);
      });
    });
  });

  describe('PLY → USDZ', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
    });
    afterEach(() => { vi.useRealTimers(); });

    it('streaming output is byte-identical to buffered output', async () => {
      const buffer = makeMinimalPly();
      const buffered = await blobToBytes(await convertPlyToUsdz(buffer));

      await withTmp(async (tmpPath) => {
        const result = await convertPlyToUsdz(buffer, undefined, { outputPath: tmpPath });
        const onDisk = fs.readFileSync(tmpPath);

        expect(result.totalBytes).toBe(onDisk.length);
        expect(onDisk.length).toBe(buffered.length);
        expect(Buffer.compare(onDisk, Buffer.from(buffered))).toBe(0);
      });
    });

    it('result metadata is consistent', async () => {
      await withTmp(async (tmpPath) => {
        const result = await convertPlyToUsdz(makeMinimalPly(), undefined, { outputPath: tmpPath });
        const onDisk = fs.readFileSync(tmpPath);

        expect(result.totalBytes).toBe(onDisk.length);
        expect(result.fileCount).toBeGreaterThan(0);
        expect(onDisk[0]).toBe(0x50);
        expect(onDisk[1]).toBe(0x4b);
      });
    });
  });

  describe('OBJ → USDZ', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
    });
    afterEach(() => { vi.useRealTimers(); });

    it('streaming output is byte-identical to buffered output', async () => {
      const buffer = makeMinimalObj();
      const buffered = await blobToBytes(await convertObjToUsdz(buffer));

      await withTmp(async (tmpPath) => {
        const result = await convertObjToUsdz(buffer, undefined, { outputPath: tmpPath });
        const onDisk = fs.readFileSync(tmpPath);

        expect(result.totalBytes).toBe(onDisk.length);
        expect(onDisk.length).toBe(buffered.length);
        expect(Buffer.compare(onDisk, Buffer.from(buffered))).toBe(0);
      });
    });

    it('result metadata is consistent', async () => {
      await withTmp(async (tmpPath) => {
        const result = await convertObjToUsdz(makeMinimalObj(), undefined, { outputPath: tmpPath });
        const onDisk = fs.readFileSync(tmpPath);

        expect(result.totalBytes).toBe(onDisk.length);
        expect(result.fileCount).toBeGreaterThan(0);
        expect(onDisk[0]).toBe(0x50);
        expect(onDisk[1]).toBe(0x4b);
      });
    });
  });

  describe('STL → USDZ', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
    });
    afterEach(() => { vi.useRealTimers(); });

    it('streaming output is byte-identical to buffered output', async () => {
      const buffer = makeMinimalStl();
      const buffered = await blobToBytes(await convertStlToUsdz(buffer));

      await withTmp(async (tmpPath) => {
        const result = await convertStlToUsdz(buffer, undefined, { outputPath: tmpPath });
        const onDisk = fs.readFileSync(tmpPath);

        expect(result.totalBytes).toBe(onDisk.length);
        expect(onDisk.length).toBe(buffered.length);
        expect(Buffer.compare(onDisk, Buffer.from(buffered))).toBe(0);
      });
    });

    it('result metadata is consistent', async () => {
      await withTmp(async (tmpPath) => {
        const result = await convertStlToUsdz(makeMinimalStl(), undefined, { outputPath: tmpPath });
        const onDisk = fs.readFileSync(tmpPath);

        expect(result.totalBytes).toBe(onDisk.length);
        expect(result.fileCount).toBeGreaterThan(0);
        expect(onDisk[0]).toBe(0x50);
        expect(onDisk[1]).toBe(0x4b);
      });
    });
  });
});
