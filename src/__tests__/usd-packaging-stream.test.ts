/**
 * Byte-equivalence tests for the streaming USDZ packaging APIs.
 *
 * `createUsdzPackageToStream` / `createUsdzPackageToFile` must produce output
 * that is byte-for-byte identical to `createUsdzPackage` for the same input.
 * Both writers stamp the current `new Date()` into local + central directory
 * headers, so the system clock is pinned with `vi.setSystemTime`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Writable } from 'node:stream';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createUsdzPackage,
  createUsdzPackageToStream,
  createUsdzPackageToFile,
  type PackageContent,
} from '../converters/shared/usd-packaging';

class CollectingWritable extends Writable {
  public chunks: Uint8Array[] = [];

  override _write(
    chunk: Buffer | Uint8Array | string,
    _encoding: BufferEncoding,
    cb: (error?: Error | null) => void
  ): void {
    if (typeof chunk === 'string') {
      this.chunks.push(new TextEncoder().encode(chunk));
    } else if (chunk instanceof Buffer) {
      // Copy: Node may reuse the underlying buffer.
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      this.chunks.push(copy);
    } else {
      this.chunks.push(chunk);
    }
    cb();
  }

  toBytes(): Uint8Array {
    const total = this.chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
}

function makeContent(): PackageContent {
  // Deliberately use a string here (not a generator) so the same content can
  // be packaged twice without regenerating it.
  return {
    usdContent: '#usda 1.0\n(\n  defaultPrim = "Root"\n)\n\ndef Xform "Root" {}\n',
    geometryFiles: new Map<string, ArrayBuffer>([
      ['Geometries/geom_0.usda', new TextEncoder().encode('#usda 1.0\nover "Mesh" { float3[] points = [(0,0,0),(1,0,0),(0,1,0)] }\n').buffer as ArrayBuffer],
      ['Geometries/geom_1.usda', new TextEncoder().encode('#usda 1.0\nover "Mesh" { float3[] points = [(2,0,0),(3,0,0),(2,1,0)] }\n').buffer as ArrayBuffer],
    ]),
    textureFiles: new Map<string, ArrayBuffer>([
      // Same bytes under two different IDs to exercise dedup; only one entry
      // should appear in the archive (matching createUsdzPackage's behaviour).
      [
        'abc123_diffuse',
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]).buffer as ArrayBuffer,
      ],
      [
        'abc123_emissive',
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]).buffer as ArrayBuffer,
      ],
    ]),
  };
}

describe('USDZ packaging — streaming vs buffered byte equivalence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('createUsdzPackageToStream produces the same bytes as createUsdzPackage', async () => {
    const bufferedBlob = await createUsdzPackage(makeContent());
    const bufferedBytes = new Uint8Array(await bufferedBlob.arrayBuffer());

    const sink = new CollectingWritable();
    const result = await createUsdzPackageToStream(makeContent(), sink);
    const streamedBytes = sink.toBytes();

    expect(result.totalBytes).toBe(bufferedBytes.length);
    expect(streamedBytes.length).toBe(bufferedBytes.length);
    expect(streamedBytes).toEqual(bufferedBytes);
  });

  it('createUsdzPackageToFile produces the same bytes on disk as createUsdzPackage in memory', async () => {
    const bufferedBlob = await createUsdzPackage(makeContent());
    const bufferedBytes = Buffer.from(await bufferedBlob.arrayBuffer());

    const tmpFile = path.join(
      os.tmpdir(),
      `webusd-pkg-stream-${process.pid}-${Date.now()}.usdz`
    );
    try {
      const result = await createUsdzPackageToFile(makeContent(), tmpFile);
      const onDisk = fs.readFileSync(tmpFile);
      expect(result.totalBytes).toBe(onDisk.length);
      expect(onDisk.length).toBe(bufferedBytes.length);
      expect(Buffer.compare(onDisk, bufferedBytes)).toBe(0);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* best-effort */ }
    }
  });

  it('reports a fileCount that excludes deduplicated texture entries', async () => {
    // makeContent() includes two texture IDs that share the same bytes; only
    // one entry should land in the archive.
    const sink = new CollectingWritable();
    const result = await createUsdzPackageToStream(makeContent(), sink);
    // 1 root usda + 2 geometry layers + 1 deduped texture = 4 files.
    expect(result.fileCount).toBe(4);
  });

  it('the streamed archive starts with the ZIP magic and ends with the EOCD signature', async () => {
    const sink = new CollectingWritable();
    await createUsdzPackageToStream(makeContent(), sink);
    const bytes = sink.toBytes();
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const eocd = bytes.length - 22;
    expect([bytes[eocd], bytes[eocd + 1], bytes[eocd + 2], bytes[eocd + 3]]).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });
});
