/**
 * Byte-equivalence tests for the streaming USDZ writer.
 *
 * For the same input, the streaming writer (`writeUsdzToStream`) must produce
 * the *exact same bytes* as the buffered writer (`UsdzZipWriter.generate()`).
 * Both writers stamp the current `new Date()` into local + central directory
 * headers, so we pin the system clock with `vi.setSystemTime` to make the
 * comparison deterministic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Writable } from 'node:stream';
import { UsdzZipWriter } from '../converters/shared/usdz-zip-writer';
import {
  writeUsdzToStream,
  writeUsdzToFile,
  type StreamingUsdzFile,
} from '../converters/shared/usdz-stream-writer';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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
      // Copy the underlying bytes — Node may reuse the buffer.
      this.chunks.push(new Uint8Array(chunk.byteLength).fill(0).map((_, i) => chunk[i]));
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

function bufferedWrite(files: StreamingUsdzFile[]): Uint8Array {
  const w = new UsdzZipWriter();
  for (const f of files) w.addFile(f.name, f.data);
  return w.generate();
}

async function streamingWrite(files: StreamingUsdzFile[]): Promise<Uint8Array> {
  const sink = new CollectingWritable();
  await writeUsdzToStream(files, sink);
  return sink.toBytes();
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('Streaming USDZ writer — byte-equivalence with buffered writer', () => {
  beforeEach(() => {
    // Pin the clock so the DOS time/date stamped into local + central headers
    // is identical for both writers.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches for a single small USDA file', async () => {
    const files: StreamingUsdzFile[] = [
      { name: 'model.usda', data: utf8('#usda 1.0\n(\n)\n') },
    ];
    const bufferedBytes = bufferedWrite(files);
    const streamedBytes = await streamingWrite(files);
    expect(streamedBytes.length).toBe(bufferedBytes.length);
    expect(streamedBytes).toEqual(bufferedBytes);
  });

  it('matches for multiple files with varying names and sizes', async () => {
    const files: StreamingUsdzFile[] = [
      { name: 'model.usda', data: utf8('#usda 1.0\n(\n  defaultPrim = "Root"\n)\n') },
      { name: 'Geometries/geom_0.usda', data: utf8('#usda 1.0\nover "Mesh" {}\n') },
      { name: 'textures/diffuse.png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]).slice() },
      { name: 'textures/normal.jpg', data: new Uint8Array(64).fill(0xab) },
    ];
    const bufferedBytes = bufferedWrite(files);
    const streamedBytes = await streamingWrite(files);
    expect(streamedBytes).toEqual(bufferedBytes);
  });

  it('matches for chunked file data (Uint8Array[])', async () => {
    const chunks = [utf8('#usda 1.0\n'), utf8('def Xform "Root" {}\n')];
    const files: StreamingUsdzFile[] = [{ name: 'model.usda', data: chunks }];
    const bufferedBytes = bufferedWrite(files);
    const streamedBytes = await streamingWrite(files);
    expect(streamedBytes).toEqual(bufferedBytes);
  });

  it('matches across alignment-boundary edge cases', async () => {
    // Name lengths 1, 5, 31, 63 chosen to drive different `extraFieldLength`
    // padding values in the local file header.
    const cases: number[] = [1, 5, 31, 63];
    for (const len of cases) {
      const name = 'a'.repeat(Math.max(1, len)) + '.usda';
      const files: StreamingUsdzFile[] = [
        { name, data: utf8(`#usda 1.0\n# pad ${len}\n`) },
      ];
      const bufferedBytes = bufferedWrite(files);
      const streamedBytes = await streamingWrite(files);
      expect(streamedBytes, `length=${len}`).toEqual(bufferedBytes);
    }
  });

  it('matches when the data size happens to be a multiple of 64 bytes', async () => {
    const files: StreamingUsdzFile[] = [
      { name: 'a.usda', data: new Uint8Array(64).fill(0x23) },
      { name: 'b.usda', data: new Uint8Array(128).fill(0x45) },
    ];
    const bufferedBytes = bufferedWrite(files);
    const streamedBytes = await streamingWrite(files);
    expect(streamedBytes).toEqual(bufferedBytes);
  });

  it('emits a valid ZIP magic at byte 0 and EOCD signature near the end', async () => {
    const files: StreamingUsdzFile[] = [
      { name: 'model.usda', data: utf8('#usda 1.0\n') },
    ];
    const bytes = await streamingWrite(files);
    // ZIP local file header signature = 0x04034b50, little-endian.
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
    // EOCD record is 22 bytes long; signature is 0x06054b50 little-endian.
    const eocdStart = bytes.length - 22;
    expect(bytes[eocdStart]).toBe(0x50);
    expect(bytes[eocdStart + 1]).toBe(0x4b);
    expect(bytes[eocdStart + 2]).toBe(0x05);
    expect(bytes[eocdStart + 3]).toBe(0x06);
  });
});

describe('Streaming USDZ writer — file output and result metadata', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports total bytes and file count', async () => {
    const files: StreamingUsdzFile[] = [
      { name: 'a.usda', data: utf8('#usda 1.0\n') },
      { name: 'b.usda', data: utf8('#usda 1.0\n') },
    ];
    const sink = new CollectingWritable();
    const result = await writeUsdzToStream(files, sink);
    expect(result.fileCount).toBe(2);
    expect(result.totalBytes).toBe(sink.toBytes().length);
    expect(result.totalBytes).toBe(bufferedWrite(files).length);
  });

  it('writeUsdzToFile produces the same bytes on disk as the buffered writer', async () => {
    const files: StreamingUsdzFile[] = [
      { name: 'model.usda', data: utf8('#usda 1.0\n(\n  defaultPrim = "Root"\n)\n') },
      { name: 'Geometries/geom_0.usda', data: utf8('#usda 1.0\nover "Mesh" {}\n') },
    ];
    const tmpFile = path.join(os.tmpdir(), `webusd-stream-test-${process.pid}-${Date.now()}.usdz`);
    try {
      const result = await writeUsdzToFile(files, tmpFile);
      const onDisk = fs.readFileSync(tmpFile);
      expect(result.totalBytes).toBe(onDisk.length);
      const bufferedBytes = bufferedWrite(files);
      expect(onDisk.length).toBe(bufferedBytes.length);
      expect(Buffer.compare(onDisk, Buffer.from(bufferedBytes))).toBe(0);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* best-effort cleanup */ }
    }
  });
});
