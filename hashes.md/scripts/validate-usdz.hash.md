---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/bash.hash.md"
---

## @WebUsdFramework.ValidateUsdz

/** WebUsdFramework.ValidateUsdz - E2E bash harness testing build, conversion, oracle inspection, and native toolkit loads */

### [Signatures]
- `$ scripts/validate-usdz.sh [input-model] [out-dir]`

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/bash.hash.md"
- depends_on: "@root/hashes.md/scripts/convert.hash.md"
- depends_on: "@root/hashes.md/scripts/inspect.hash.md"
