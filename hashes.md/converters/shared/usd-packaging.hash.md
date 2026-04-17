---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Converters.Shared.UsdPackaging

/** WebUsdFramework.Converters.Shared.UsdPackaging - Orchestrates USDA and payloads into final USDZ archive */

### [Signatures]
- `packUsdz(usda: string, assets: AssetRecord[]): Promise<Blob>`

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
- depends_on: "@root/hashes.md/converters/shared/usdz-zip-writer.hash.md"
