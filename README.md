# WebUsdFramework

Library for converting GLB/GLTF 3D models to USDZ format.

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

// Works with both GLB and GLTF files
const usdzBlob = await usd.convert('./model.glb'); // GLB file
const usdzBlob2 = await usd.convert('./model.gltf'); // GLTF file with external resources

// Save the result
const buffer = await usdzBlob.arrayBuffer();
fs.writeFileSync('output.usdz', Buffer.from(buffer));
```

...

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
