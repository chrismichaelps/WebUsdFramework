---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Converters.Obj.ObjConverter

/** WebUsdFramework.Converters.Obj.ObjConverter - Main OBJ to USDZ converter orchestra */

### [Signatures]
- `class ObjConverter implements IConverter`
- `convert(input: string, options: IConverterOptions): Promise<IConversionResult>`

### [Forensic Metadata]
- contract: "@root/hashes.md/converters/obj/.contract.json"
- logic: "@root/hashes.md/converters/obj/.logic.md"
- chronos: "@root/hashes.md/converters/obj/.chronos.json"

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
- depends_on: "@root/hashes.md/converters/shared/usd-geometry-builder.hash.md"
- depends_on: "@root/hashes.md/converters/shared/usd-material-builder.hash.md"
