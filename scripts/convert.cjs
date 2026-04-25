#!/usr/bin/env node
/** WebUsdFramework.Convert - Node CLI delegator to test framework output */

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const projectRoot = path.resolve(__dirname, '..');

const input = process.argv[2];
const outDir = path.resolve(projectRoot, process.argv[3] || 'debug-output');

if (!input) {
  console.error('Usage: node scripts/convert.cjs <input> [out-dir]');
  process.exit(1);
}
if (!fs.existsSync(input)) {
  console.error(`[convert] input not found: ${input}`);
  process.exit(1);
}

const buildPath = path.join(projectRoot, 'build', 'index.js');
if (!fs.existsSync(buildPath)) {
  console.error(`[convert] missing ${buildPath}. Run: pnpm run build`);
  process.exit(1);
}

const { defineConfig } = require(buildPath);

fs.mkdirSync(outDir, { recursive: true });

const usd = defineConfig({
  debug: true,
  debugOutputDir: outDir,
  preprocess: {
    dequantize: true,
    generateNormals: true,
    weld: true,
    dedup: true,
    prune: true,
    logBounds: true,
    center: 'center',
    resample: true,
    unlit: false,
    flatten: false,
    metalRough: true,
    vertexColorSpace: 'srgb',
    join: false,
  },
  unified: {
    obj: { enableLogging: true, debugLogging: false },
  },
});

(async () => {
  const t0 = performance.now();
  console.log(`[convert] converting ${input}`);
  const blob = await usd.convert(path.resolve(input));

  const baseName = path.basename(input, path.extname(input));
  const outPath = path.join(outDir, `${baseName}.usdz`);

  // Stream the Blob directly to disk so its underlying buffer can be released
  // by the runtime as bytes are flushed, instead of materializing a full
  // ArrayBuffer + Node Buffer copy in process memory before the write.
  await pipeline(Readable.fromWeb(blob.stream()), fs.createWriteStream(outPath));

  const { size } = fs.statSync(outPath);
  const mb = (size / 1024 / 1024).toFixed(2);
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`[convert] wrote ${outPath}`);
  console.log(`[convert] size=${mb} MB time=${secs}s`);

  // Final line: absolute path, consumed by validate-usdz.sh
  console.log(outPath);
})().catch((err) => {
  console.error('[convert] error:', err);
  process.exit(1);
});
