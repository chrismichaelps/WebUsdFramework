---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Converters.Gltf.GltfConverter

/** [Project].Converters.Gltf.GltfConverter - Main orchestration class for GLTF/GLB to USDZ conversion */

### [Signatures]
- `class GltfConverter implements IConverter`
- `convert(input: string, options: IConverterOptions): Promise<IConversionResult>`

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
- depends_on: "@root/hashes.md/converters/shared/usd-geometry-builder.hash.md"
- depends_on: "@root/hashes.md/converters/shared/usd-material-builder.hash.md"
- depends_on: "@root/hashes.md/converters/gltf/helpers/skeleton-processor.hash.md"
- depends_on: "@root/hashes.md/converters/gltf/helpers/animation-processor.hash.md"
