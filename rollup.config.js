const typescript = require('@rollup/plugin-typescript');
const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const { dts } = require('rollup-plugin-dts');

const config = [
  // Main bundle
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'build/index.js',
        format: 'cjs',
        sourcemap: false,
      },
      {
        file: 'build/index.esm.js',
        format: 'esm',
        sourcemap: false,
      },
    ],
    external: [],
    plugins: [
      resolve({
        preferBuiltins: false,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
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
    plugins: [dts()],
  },
];

module.exports = config;
