---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Converters.Gltf.Helpers.AnimationProcessor

/** WebUsdFramework.Converters.Gltf.Helpers.AnimationProcessor - Orchestrates GLTF animation curves into USD SkelAnimation */

### [Signatures]
- `class AnimationProcessor`
- `processAnimations(): UsdNode[]`

### [Forensic Metadata]
- contract: "@root/hashes.md/converters/gltf/helpers/.contract.json"
- logic: "@root/hashes.md/converters/gltf/helpers/.logic.md"
- chronos: "@root/hashes.md/converters/gltf/helpers/.chronos.json"

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
- depends_on: "@root/hashes.md/utils/time-code-converter.hash.md"
- depends_on: "@root/hashes.md/core/usd-node.hash.md"
- downstream: "@root/hashes.md/converters/gltf/gltf-converter.hash.md"
