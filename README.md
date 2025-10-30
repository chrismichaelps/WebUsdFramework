# WebUsdFramework

Library for converting GLB/GLTF/OBJ 3D models to USDZ format.

This library builds USD schemas based on the [OpenUSD Core API](https://openusd.org/release/api/usd_page_front.html) specifications. The USD schema implementation follows the Universal Scene Description standards developed by Pixar Animation Studios.

### Current Status

⚠️ **This is a proof of concept (POC)** - The library is currently in active development and should be used for experimental purposes. While functional, it may not be production-ready for all use cases.

## Prerequisites

- [x] `Node.js >= 22.0.0`
- [x] `Yarn >= 1.x`

# 📚 Documentation

## **:package: Installation**

```shell
pnpm install
```

### Basic Usage

```javascript
const { defineConfig } = require('./build/index.js');

// Create framework instance
const usd = defineConfig();

// Convert GLB file to USDZ
const usdzBlob = await usd.convert('./model.glb');

// Convert GLTF file to USDZ
const usdzBlob2 = await usd.convert('./model.gltf');

// Convert OBJ file to USDZ
const usdzBlob3 = await usd.convert('./model.obj');

// Save the result
const fs = require('fs');
const buffer = await usdzBlob.arrayBuffer();
fs.writeFileSync('output.usdz', Buffer.from(buffer));
```

### With Debug Output

```javascript
const { defineConfig } = require('./build/index.js');

// Enable debug mode for inspection
const usd = defineConfig({
  debug: true,
  debugOutputDir: './debug-output',
});

// Convert with detailed logging
const usdzBlob = await usd.convert('./model.glb');

// Debug files will be created in ./debug-output/
// - model.usda (main USD file)
// - geometries/ (external geometry files)
// - textures/ (texture files)
// - converted.usdz (final package)
```

### From ArrayBuffer

```javascript
const { defineConfig } = require('./build/index.js');
const fs = require('fs');

const usd = defineConfig();

// From file system (Node.js) - GLB files
const glbBuffer = fs.readFileSync('model.glb').buffer;
const usdzBlob = await usd.convert(glbBuffer);

// From file path - GLTF files
const usdzBlob2 = await usd.convert('./model.gltf');

// From file path - OBJ files
const usdzBlob3 = await usd.convert('./model.obj');

// Save the result
const buffer = await usdzBlob.arrayBuffer();
fs.writeFileSync('output.usdz', Buffer.from(buffer));
```

### Advanced Configuration

```javascript
const { defineConfig } = require('./build/index.js');
const fs = require('fs');

const config = {
  debug: true,
  debugOutputDir: './output',
  upAxis: 'Y',
  metersPerUnit: 1,
};

const usd = defineConfig(config);

// Works with GLB, GLTF, and OBJ files
const usdzBlob = await usd.convert('./model.glb'); // GLB file
const usdzBlob2 = await usd.convert('./model.gltf'); // GLTF file with external resources
const usdzBlob3 = await usd.convert('./model.obj'); // OBJ file

// Save the result
const buffer = await usdzBlob.arrayBuffer();
fs.writeFileSync('output.usdz', Buffer.from(buffer));
```

### OBJ File Support

The framework includes comprehensive support for OBJ (Wavefront Object) files:

```javascript
const { defineConfig } = require('./build/index.js');

const usd = defineConfig({
  debug: true,
  debugOutputDir: './debug-output',
});

// Convert OBJ file to USDZ
const usdzBlob = await usd.convert('./model.obj');

// OBJ-specific features:
// - Vertex positions, normals, and UV coordinates
// - Face definitions (triangles and polygons)
// - Material groups and smoothing groups
// - Color space conversion (sRGB to linear)
// - Automatic mesh centering and scaling
// - Embedded geometry approach for optimal USDZ compatibility
```

**Supported OBJ Features:**

- Vertex positions (`v`)
- Texture coordinates (`vt`)
- Normal vectors (`vn`)
- Face definitions (`f`)
- Groups (`g`)
- Objects (`o`)
- Materials (`usemtl`, `mtllib`)
- Smoothing groups (`s`)
- Vertex colors (RGB values)

**OBJ Conversion Process:**

1. Parse OBJ file format
2. Extract geometric data (vertices, faces, normals, UVs)
3. Convert colors from sRGB to linear space
4. Generate USD mesh nodes with embedded geometry
5. Apply transformations for proper scaling and centering
6. Package as USDZ with 64-byte alignment


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
