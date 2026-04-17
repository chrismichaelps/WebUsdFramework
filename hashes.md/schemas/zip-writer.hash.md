---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Schemas.ZipWriter

/** WebUsdFramework.Schemas.ZipWriter - Uncompressed 64-byte aligned ZIP archive encoder for USDZ */

### [Signatures]
- `class UsdzZipWriter`
- `addFile(filename: string, data: Uint8Array): void`
- `generate(): Uint8Array`

### [Governance]
- Must maintain 64-byte alignment for uncompressed USDA and asset payload data

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
- depends_on: "@root/hashes.md/constants/zip.hash.md"
- downstream: "@root/hashes.md/converters/shared/usdz-zip-writer.hash.md"
