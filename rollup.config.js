const typescript = require('@rollup/plugin-typescript');
const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const { dts } = require('rollup-plugin-dts');

// External dependencies that should not be bundled
const external = [
  // Node.js built-ins
  'fs',
  'path',
  'stream',
  'util',
  'crypto',
  'buffer',
  'events',
  'os',
  'url',
  'querystring',
  'http',
  'https',
  'zlib',
  // Third-party dependencies (only the ones actually used)
  '@gltf-transform/core',
  '@gltf-transform/extensions',
  '@gltf-transform/functions',
  'jszip',
  'zod',
];

const config = [
  // Main bundle - CommonJS (for Node.js)
  {
    input: 'src/index.ts',
    output: {
      file: 'build/index.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
      banner: '#!/usr/bin/env node',
    },
    external,
    plugins: [
      resolve({
        preferBuiltins: true,
        browser: false,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
        sourceMap: true,
      }),
    ],
  },
  // Main bundle - ESM (for modern bundlers)
  {
    input: 'src/index.ts',
    output: {
      file: 'build/index.esm.js',
      format: 'esm',
      sourcemap: true,
      exports: 'named',
    },
    external,
    plugins: [
      resolve({
        preferBuiltins: true,
        browser: false,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
        sourceMap: true,
      }),
    ],
  },
  // UMD bundle (Node.js only - this library requires Node.js APIs)
  {
    input: 'src/index.ts',
    output: {
      file: 'build/index.umd.js',
      format: 'umd',
      name: 'WebUsdFramework',
      sourcemap: true,
      globals: {
        '@gltf-transform/core': 'GLTFTransformCore',
        '@gltf-transform/extensions': 'GLTFTransformExtensions',
        '@gltf-transform/functions': 'GLTFTransformFunctions',
        jszip: 'JSZip',
        zod: 'z',
        // Node.js built-ins
        fs: 'fs',
        path: 'path',
        stream: 'stream',
        util: 'util',
        crypto: 'crypto',
        buffer: 'buffer',
        events: 'events',
        os: 'os',
        url: 'url',
        querystring: 'querystring',
        http: 'http',
        https: 'https',
        zlib: 'zlib',
      },
    },
    external: [
      '@gltf-transform/core',
      '@gltf-transform/extensions',
      '@gltf-transform/functions',
      'jszip',
      'zod',
      // Node.js built-ins
      'fs',
      'path',
      'stream',
      'util',
      'crypto',
      'buffer',
      'events',
      'os',
      'url',
      'querystring',
      'http',
      'https',
      'zlib',
    ],
    plugins: [
      resolve({
        preferBuiltins: true,
        browser: false,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
        sourceMap: true,
      }),
    ],
  },
  // TypeScript declarations
  {
    input: 'src/index.ts',
    output: {
      file: 'build/index.d.ts',
      format: 'esm',
    },
    external,
    plugins: [dts()],
  },
];

module.exports = config;
