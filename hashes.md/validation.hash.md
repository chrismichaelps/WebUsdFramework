---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Validation

/** WebUsdFramework.Validation - Input format and option validation guards */

### [Signatures]
- `validateInputPath(p: string): void`
- `validateOptions(opts: unknown): FrameworkOptions`

### [Governance]
- Propagation_Law: Throws ValidationError on bad input; never returns null

### [Semantic Hash]
- Inputs: raw user-supplied strings and option objects
- Outputs: validated typed values or ValidationError

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
- depends_on: "@root/hashes.md/errors.hash.md"
