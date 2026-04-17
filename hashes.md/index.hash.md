---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Index

/** [Project].Src.Index - Public API surface and defineConfig entry point */

### [Signatures]
- `defineConfig(options: FrameworkOptions): FrameworkInstance`
- `convert(inputPath: string): Promise<Blob>`

### [Governance]
- Export_Law: Single opaque re-export barrel; all internal shards hidden
- Propagation_Law: Errors bubble as typed FrameworkError instances

### [Semantic Hash]
- Inputs: FrameworkOptions
- Outputs: Blob (USDZ binary)

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
- downstream: build/index.js
