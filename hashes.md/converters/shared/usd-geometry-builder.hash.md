---
State_ID: BigInt(0x1)
Git_SHA: HEAD_SHA
Grammar_Lock: "@root/hashes.md/grammar/typescript.hash.md"
---

## @WebUsdFramework.Converters.Shared.UsdGeometryBuilder

/** WebUsdFramework.Converters.Shared.UsdGeometryBuilder - Generic agnostic mesh-to-USD translation layer */

### [Signatures]
- `class UsdGeometryBuilder`
- `buildMesh(data: MeshData): UsdNode`

### [Governance]
- Must delegate all USDA raw string building to core UsdNode hierarchy

### [Forensic Metadata]
- contract: "@root/hashes.md/converters/shared/.contract.json"
- logic: "@root/hashes.md/converters/shared/.logic.md"
- chronos: "@root/hashes.md/converters/shared/.chronos.json"

### [Linkage]
- grammar_ref: "@root/hashes.md/grammar/typescript.hash.md"
- depends_on: "@root/hashes.md/core/usd-node.hash.md"
- downstream: "@root/hashes.md/converters/gltf/gltf-converter.hash.md"
- downstream: "@root/hashes.md/converters/obj/obj-converter.hash.md"
