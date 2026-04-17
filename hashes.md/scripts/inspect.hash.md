---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/javascript.hash.md"
---

## @WebUsdFramework.Inspect

/** WebUsdFramework.Inspect - Testing oracle verifying content-preservation between source and USDA output */

### [Signatures]
- `$ node scripts/inspect.cjs <source> <outputUsda>`

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/javascript.hash.md"
- depends_on: "@root/hashes.md/scripts/convert.hash.md"
- downstream: "@root/hashes.md/scripts/validate-usdz.hash.md"
