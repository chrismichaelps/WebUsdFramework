#!/usr/bin/env node
/** WebUsdFramework.Convert - Node CLI delegator to test framework output */

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

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

  const baseName = path.basename(input, path.extname(input));
  const outPath = path.join(outDir, `${baseName}.usdz`);

  // Use the framework's streaming output path. The archive is streamed
  // directly to disk inside the converter — peak memory is bounded by the
  // largest single file in the archive instead of the total archive size,
  // and the script never materializes a full Blob.
  const result = await usd.convert(path.resolve(input), { outputPath: outPath });

  const mb = (result.totalBytes / 1024 / 1024).toFixed(2);
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`[convert] wrote ${outPath}`);
  console.log(`[convert] size=${mb} MB time=${secs}s files=${result.fileCount}`);

  // Final line: absolute path, consumed by validate-usdz.sh
  console.log(outPath);
})().catch((err) => {
  console.error('[convert] error:', err);
  process.exit(1);
});
