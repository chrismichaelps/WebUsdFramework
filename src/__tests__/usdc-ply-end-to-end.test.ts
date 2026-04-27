/**
 * End-to-end PLY → USDZ tests with `layerFormat: 'usdc'`.
 *
 * The converter accepts the new `layerFormat` option and threads both the
 * serialized USDA text and the source `UsdNode` tree through to the
 * packager. The packager:
 *   - On `'usda'` (default): writes `model.usda` as today.
 *   - On `'usdc'`: tries the UsdNode → USDC adapter; if every property
 *     in the root tree is supported, writes `model.usdc`. If the tree
 *     contains shapes the adapter cannot encode yet (e.g. relationships,
 *     list-ops, attribute connections), the packager silently falls back
 *     to `model.usda` so output stays correct.
 *
 * These tests:
 *   - confirm the option is accepted by `convertPlyToUsdz`,
 *   - confirm the resulting archive is a valid USDZ in both modes,
 *   - record the current state (root layer falls back to USDA because
 *     the PLY scene includes material binding + connection + apiSchemas
 *     list-op — the adapter does not yet emit those types).
 */
import { describe, it, expect } from 'vitest';
import { convertPlyToUsdz } from '../converters/ply/ply-converter';

const MINIMAL_PLY_BUFFER: ArrayBuffer = new TextEncoder().encode(
  [
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
  ].join('\n')
).buffer as ArrayBuffer;

async function readArchiveNames(blob: Blob): Promise<string[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const names: string[] = [];
  let cursor = 0;
  while (cursor + 4 <= bytes.length) {
    const sig = view.getUint32(cursor, true);
    if (sig !== 0x04034b50) break;
    const nameLen = view.getUint16(cursor + 26, true);
    const extraLen = view.getUint16(cursor + 28, true);
    const compressedSize = view.getUint32(cursor + 18, true);
    const name = new TextDecoder().decode(
      bytes.subarray(cursor + 30, cursor + 30 + nameLen)
    );
    names.push(name);
    cursor += 30 + nameLen + extraLen + compressedSize;
  }
  return names;
}

describe('PLY → USDZ — layerFormat option', () => {
  it('default writes model.usda', async () => {
    const blob = await convertPlyToUsdz(MINIMAL_PLY_BUFFER);
    const names = await readArchiveNames(blob);
    expect(names).toContain('model.usda');
    expect(names).not.toContain('model.usdc');
  });

  it('explicit layerFormat: "usda" writes model.usda', async () => {
    const blob = await convertPlyToUsdz(MINIMAL_PLY_BUFFER, undefined, {
      layerFormat: 'usda',
    });
    const names = await readArchiveNames(blob);
    expect(names).toContain('model.usda');
  });

  it('layerFormat: "usdc" produces a valid USDZ archive (falls back to USDA when adapter cannot encode the full tree)', async () => {
    // The PLY converter currently emits material binding + outputs:surface
    // connection + prepend apiSchemas — none of which the adapter can yet
    // encode. The packager falls back to USDA, but the archive itself must
    // remain valid and readable.
    const blob = await convertPlyToUsdz(MINIMAL_PLY_BUFFER, undefined, {
      layerFormat: 'usdc',
    });
    const names = await readArchiveNames(blob);
    expect(names.length).toBeGreaterThan(0);
    // Either model.usdc (adapter succeeded) or model.usda (fallback) is fine;
    // both are valid USDZ contents. The point is that the option threads
    // through without crashing and the archive is well-formed.
    expect(names.some((n) => n === 'model.usdc' || n === 'model.usda')).toBe(true);

    // First file should always start with the ZIP local-file-header magic.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
  });
});
