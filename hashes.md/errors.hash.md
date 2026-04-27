---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Errors

/** WebUsdFramework.Errors - Typed error class hierarchy for framework failures */

### [Signatures]
- `class FrameworkError extends Error`
- `class ConversionError extends FrameworkError`
- `class ValidationError extends FrameworkError`
- `class UnsupportedFormatError extends FrameworkError`

### [Governance]
- Propagation_Law: All internal throws must be FrameworkError subclasses
- No raw JS Error leaks across shard boundaries

### [Semantic Hash]
- Inputs: message string, optional cause
- Outputs: typed Error instances

### [Forensic Metadata]
- contract: "@root/hashes.md/.contract.json"
- logic: "@root/hashes.md/.logic.md"
- chronos: "@root/hashes.md/.chronos.json"

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
- downstream: "@root/hashes.md/index.hash.md"
