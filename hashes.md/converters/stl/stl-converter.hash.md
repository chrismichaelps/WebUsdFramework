---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Converters.Stl.StlConverter

/** WebUsdFramework.Converters.Stl.StlConverter - Main orchestration class for ASCII/Binary STL to USDZ */

### [Signatures]
- `class StlConverter implements IConverter`
- `convert(input: string, options: IConverterOptions): Promise<IConversionResult>`

### [Forensic Metadata]
- contract: "@root/hashes.md/converters/stl/.contract.json"
- logic: "@root/hashes.md/converters/stl/.logic.md"
- chronos: "@root/hashes.md/converters/stl/.chronos.json"

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
- depends_on: "@root/hashes.md/converters/shared/usd-geometry-builder.hash.md"
- depends_on: "@root/hashes.md/converters/stl/stl-parser.hash.md"
