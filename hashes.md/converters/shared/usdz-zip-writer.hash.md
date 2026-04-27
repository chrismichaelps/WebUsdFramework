---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Converters.Shared.UsdzZipWriter

/** WebUsdFramework.Converters.Shared.UsdzZipWriter - Domain-specific wrapper over zip-writer for USDZ rules */

### [Signatures]
- `class UsdzZipWriterWrapper`
- `addAsset(name: string, data: Uint8Array): void`

### [Forensic Metadata]
- contract: "@root/hashes.md/converters/shared/.contract.json"
- logic: "@root/hashes.md/converters/shared/.logic.md"
- chronos: "@root/hashes.md/converters/shared/.chronos.json"

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
- depends_on: "@root/hashes.md/schemas/zip-writer.hash.md"
- downstream: "@root/hashes.md/converters/shared/usd-packaging.hash.md"
