# WebUsdFramework

A Node.js library for converting 3D model files to Apple-compatible USDZ format. Built on the [OpenUSD Core API](https://openusd.org/release/api/usd_page_front.html) specifications by Pixar Animation Studios.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.0.0-green.svg)](https://nodejs.org)
[![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://www.paypal.me/chrismperezsantiago)

> **Support the Project** -- To keep this library maintained and evolving, your contribution would be greatly appreciated.
> [Donate via PayPal](https://www.paypal.me/chrismperezsantiago)

## Supported Formats

| Input Format | Extensions | Features |
|---|---|---|
| **GLB / GLTF** | `.glb`, `.gltf` | Meshes, materials, textures, skeletal animations, blend shapes, skinning |
| **OBJ** | `.obj` | Vertices, normals, UVs, face groups, materials (`mtllib`), vertex colors |
| **FBX** | `.fbx` | Binary/ASCII, embedded textures, skeletal animations, skinning (via `fbx2gltf`) |
| **STL** | `.stl` | Binary/ASCII, vertex colors, batch folder conversion, Z-up to Y-up |
| **PLY** | `.ply` | Binary/ASCII, vertex colors, point clouds, mesh decimation via vertex clustering |

All outputs are packaged as `.usdz` with 64-byte alignment, validated against `usdchecker --arkit`.

## Prerequisites

- Node.js >= 22.0.0
- pnpm (or npm/yarn)
- `fbx2gltf` on PATH (only for FBX conversion)

## Installation

```shell
pnpm install
```

## Quick Start

```javascript
const { defineConfig } = require('webusdframework');
const fs = require('fs');

const usd = defineConfig();

const usdzBlob = await usd.convert('./model.glb');

const buffer = await usdzBlob.arrayBuffer();
fs.writeFileSync('output.usdz', Buffer.from(buffer));
```

The `convert()` method accepts a file path (string) or an `ArrayBuffer`. The file extension determines which converter is used.

```javascript
await usd.convert('./scene.glb');       // GLB
await usd.convert('./scene.gltf');      // GLTF (resolves external resources)
await usd.convert('./model.obj');       // OBJ
await usd.convert('./model.fbx');       // FBX
await usd.convert('./part.stl');        // STL (single file)
await usd.convert('./stl-folder/');     // STL (batch -- one USDZ per file)
await usd.convert('./scan.ply');        // PLY
```

You can also use the individual converter functions directly:

```javascript
const {
  convertGlbToUsdz,
  convertObjToUsdz,
  convertStlToUsdz,
  convertPlyToUsdz,
} = require('webusdframework');
```

## Configuration

```javascript
const usd = defineConfig({
  debug: true,
  debugOutputDir: './debug-output',
  upAxis: 'Y',           // 'Y' or 'Z'
  metersPerUnit: 1,
  preprocess: {
    dequantize: true,     // Remove mesh quantization for USDZ compatibility
    generateNormals: true,// Generate normals if missing
    weld: true,           // Merge identical vertices
    dedup: true,          // Remove duplicate resources
    prune: true,          // Remove unused resources
    logBounds: true,      // Log scene bounding box
    center: 'center',     // Center at origin ('center', 'above', 'below', or false)
    resample: true,       // Optimize animation keyframes
    unlit: true,          // Convert unlit materials to PBR
    flatten: false,       // Flatten scene graph (WARNING: breaks animations)
    metalRough: true,     // Convert spec/gloss to metal/rough PBR
    vertexColorSpace: 'srgb',  // 'srgb' or 'srgb-linear'
    join: false,          // Join compatible primitives
  },
  unified: {
    obj: {
      enableLogging: true,
      debugLogging: false,
    },
  },
});
```

Preprocessing options use `@gltf-transform/functions` and apply to GLB/GLTF/FBX inputs.

## PLY Converter

The PLY converter handles both meshes and point clouds, with support for vertex clustering decimation on large scans.

```javascript
const { convertPlyToUsdz } = require('webusdframework');
const fs = require('fs');

const plyBuffer = fs.readFileSync('./scan.ply');
const usdz = await convertPlyToUsdz(plyBuffer.buffer, {
  decimateTarget: 500000,   // Reduce to ~500K faces (0 = no decimation)
  maxPoints: 1000000,       // Downsample point clouds (0 = no limit)
  defaultColor: [0.7, 0.7, 0.7],  // Fallback color (linear RGB)
  defaultPointWidth: 0.005, // Point size in scene units
  upAxis: 'Y',
  metersPerUnit: 1,
});

const buffer = await usdz.arrayBuffer();
fs.writeFileSync('scan.usdz', Buffer.from(buffer));
```

**PLY features:**
- Binary (little/big endian) and ASCII format parsing
- Vertex colors (RGB, preserved through decimation)
- Triangle mesh and point cloud geometry
- Vertex clustering mesh decimation for large scans (millions of faces)

## Debug Output

When `debug: true` is set, the following files are written to `debugOutputDir`:

```
debug-output/
  model.usda          # Human-readable USD scene
  geometries/         # External geometry files
  textures/           # Texture files
  converted.usdz      # Final packaged output
```

## From ArrayBuffer

Useful for server-side or in-memory workflows:

```javascript
const fs = require('fs');
const { defineConfig } = require('webusdframework');

const usd = defineConfig();

const glbBuffer = fs.readFileSync('model.glb').buffer;
const usdzBlob = await usd.convert(glbBuffer);

const buffer = await usdzBlob.arrayBuffer();
fs.writeFileSync('output.usdz', Buffer.from(buffer));
```

## **:handshake: Contributing**

- Fork it!
- Create your feature branch: `git checkout -b my-new-feature`
- Commit your changes: `git commit -am 'Add some feature'`
- Push to the branch: `git push origin my-new-feature`
- Submit a pull request

---

### **:busts_in_silhouette: Credits**

- [Chris Michael](https://github.com/chrismichaelps) (Project Leader, and Developer)

---

### **:anger: Troubleshootings**

This is just a personal project created for study / demonstration purpose and to simplify my working life, it may or may
not be a good fit for your project(s).

---

### **:heart: Show your support**

Please :star: this repository if you like it or this project helped you!\
Feel free to open issues or submit pull-requests to help me improving my work.

---

### **:robot: Author**

_*Chris M. Perez*_

> You can follow me on
> [github](https://github.com/chrismichaelps)&nbsp;&middot;&nbsp;[twitter](https://twitter.com/Chris5855M)

---

Copyright ©2025 [WebUsdFramework](https://github.com/chrismichaelps/WebUsdFramework).
