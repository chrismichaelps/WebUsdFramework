---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Converters.Gltf.Helpers.SkeletonProcessor

/** WebUsdFramework.Converters.Gltf.Helpers.SkeletonProcessor - Maps GLTF skinning joints to USD SkelRoot and Skeleton nodes */

### [Signatures]
- `class SkeletonProcessor`
- `process(skin: Skin): { skelRoot: UsdNode, skeleton: UsdNode }`

### [Forensic Metadata]
- contract: "@root/hashes.md/converters/gltf/helpers/.contract.json"
- logic: "@root/hashes.md/converters/gltf/helpers/.logic.md"
- chronos: "@root/hashes.md/converters/gltf/helpers/.chronos.json"

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
- depends_on: "@root/hashes.md/constants/skeleton.hash.md"
- depends_on: "@root/hashes.md/core/usd-node.hash.md"
- downstream: "@root/hashes.md/converters/gltf/gltf-converter.hash.md"
