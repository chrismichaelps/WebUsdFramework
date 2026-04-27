---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Utils.Logger

/** WebUsdFramework.Utils.Logger - Hierarchical scoped logging facility */

### [Signatures]
- `class Logger`
- `info(msg: string): void`
- `warn(msg: string): void`
- `error(msg: string): void`

### [Governance]
- Debug tracing only active when config.debug is true

### [Forensic Metadata]
- contract: "@root/hashes.md/utils/.contract.json"
- logic: "@root/hashes.md/utils/.logic.md"
- chronos: "@root/hashes.md/utils/.chronos.json"

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
- downstream: "@root/hashes.md/core/usd-node.hash.md"
