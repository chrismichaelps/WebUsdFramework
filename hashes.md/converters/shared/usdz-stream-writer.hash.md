---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Converters.Shared.UsdzStreamWriter

/** WebUsdFramework.Converters.Shared.UsdzStreamWriter - WebUsdFramework.Converters.Shared.UsdzStreamWriter — streaming USDZ archive writer */

### [Signatures]
- `StreamingUsdzFile()`
- `StreamingUsdzOptions()`
- `writeUsdzToStream()`
- `writeUsdzToFile()`
- `getCrc32Table()`
- `crc32OfChunks()`
- `getDosTime()`
- `getDosDate()`
- `createLocalFileHeader()`
- `createCentralDirectoryHeader()`
- `createEndOfCentralDirectoryRecord()`
- `writeChunk()`
- `reject()`

### [Forensic Metadata]
- contract: "@root/hashes.md/converters/shared/.contract.json"
- logic: "@root/hashes.md/converters/shared/.logic.md"
- chronos: "@root/hashes.md/converters/shared/.chronos.json"

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
