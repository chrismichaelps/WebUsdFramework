---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Index

/** WebUsdFramework.Index - Public API surface and defineConfig entry point */

### [Signatures]
- `defineConfig(options: FrameworkOptions): FrameworkInstance`
- `convert(inputPath: string): Promise<Blob>`

### [Governance]
- Export_Law: Single opaque re-export barrel; all internal shards hidden
- Propagation_Law: Errors bubble as typed FrameworkError instances

### [Semantic Hash]
- Inputs: FrameworkOptions
- Outputs: Blob (USDZ binary)

### [Forensic Metadata]
- contract: "@root/hashes.md/.contract.json"
- logic: "@root/hashes.md/.logic.md"
- chronos: "@root/hashes.md/.chronos.json"

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
- downstream: build/index.js
- depends_on: "@root/hashes.md/schemas/index.hash.md"
- depends_on: "@root/hashes.md/converters/gltf/index.hash.md"
- depends_on: "@root/hashes.md/converters/ply/ply-converter.hash.md"
- depends_on: "@root/hashes.md/converters/obj/index.hash.md"
- depends_on: "@root/hashes.md/converters/stl/index.hash.md"

### [Module Boundaries]
- Entry Point: Yes (Public API)
- Barrel File: Yes
- Internal Access: No (all internal modules hidden)

### [Type Signatures]
```typescript
type FrameworkOptions = {
  debug?: boolean;
  debugOutputDir?: string;
  upAxis?: 'Y' | 'Z';
  metersPerUnit?: number;
}

type FrameworkInstance = {
  convert(input: string | ArrayBuffer, config?: ConverterConfig): Promise<Blob>;
}
```
