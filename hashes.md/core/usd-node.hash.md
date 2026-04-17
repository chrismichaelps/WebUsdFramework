---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Core.UsdNode

/** [Project].Core.UsdNode - Object-oriented USD stage graph abstraction */

### [Signatures]
- `class UsdNode`
- `addChild(child: UsdNode): void`
- `toString(): string`

### [Governance]
- Acts as the singular intermediary between input parser and USDA output formatting

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
- depends_on: "@root/hashes.md/utils/logger.hash.md"
- depends_on: "@root/hashes.md/constants/usd.hash.md"
