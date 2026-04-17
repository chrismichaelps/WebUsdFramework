# USD Binary Toolkit Documentation (Bin Updates)

This document catalogs the built-in command-line tools (bins) provided with the Pixar USD distribution you have in your environment, along with their usage, options, and typical configurations. It also notes deprecations and recommended workflows for ARKit/USDZ validation.

Note: This doc reflects the Pixar USD binaries under /usr/local/USD/bin and the system-provided USD tools where applicable.

Table of contents:
- Bins overview
- Full reference per binary
- ARKit deprecation and recommended workflow
- Examples

## Bins Overview
- usdview: GUI viewer for USD files.
- usdcat: Convert USD files between textual (usda) and binary (usdc) forms.
- usdstitch: Stitch multiple USD assets into a single stage.
- usdstitchclips: Stitch animation clips across multiple USD files.
- usdtree: Emit a text representation of the USD stage hierarchy.
- usdzip: Create or inspect USDZ packages.
- usddiff: Compare two USD files with configurable diff behavior.
- usdchecker: Validate USD content; ARKit support has historically existed but has been deprecated in newer Pixar USD releases.
- usdresolve: Resolve asset paths in a configured USD Asset Resolver.
- usdedit: Edit USD files using an external editor (via a temporary copy).
- usdrecord: Render USD content to image outputs.
- sdfdump: Dump raw data from Sdf layers for inspection.
- sdffilter: Filter and report on Sdf layer contents.
- usddumpcrate: Dump information about a USD crate (.usdc).
- usdfixbrokenpixarschemas: Fix broken Pixar schemas in USD files.
- usdBakeMaterialX: Bake MaterialX materials into textures.
- usdGenSchema / usdInitSchema: Generate schema stubs; updates vary by version.
- usdmeasureperformance: Instrument performance measurements.
- testusdview: Test harness for usdview (system-provided and project-specific).

The following sections document detailed usage and options.

## Full Reference: Binary-by-Binary Reference

The references below reflect the commonly available options surfaced by the binaries in your current USD installation.

---

## usdview

- Usage: /usr/local/USD/bin/usdview [options] usdFile
- Short synopsis: Graphical viewer for USD stages.
- Common options:
```sh
  -h, --help: show help
  --renderer, -r {Storm,GL}: select render backend (Storm or GL) [Storm alias]
  --select PRIMPATH: initial frame focus on a prim path
  --camera, -cam CAMERA: initial camera to use
  --mask PRIMPATH[,PRIMPATH...]: limit stage population to specific prims
  --clearsettings: reset viewer preferences
  --config {}: load/save viewer state from a config
  --defaultsettings: launch with default UI settings
  --norender: display only hierarchy browser (no rendering)
  --noplugins: do not load USDX plugins
  --unloaded: do not load payloads
  --bboxStandin: display unloaded prims as bounding boxes
  --timing: print timing stats
  --allow-async: enable async processing in the viewer
  --traceToFile TRACETOFILE: trace startup events to a file
  --traceFormat {chrome,trace}: trace output format
  --tracePython: enable Python tracing (requires --traceToFile)
  --memstats {none,stage,stageAndImaging}: memory accounting settings
  --dumpFirstImage DUMPFIRSTIMAGE: dump first rendered image to file
  --numThreads NUMTHREADS: thread count (0 = max)
  --ff FIRSTFRAME; --lf LASTFRAME; --cf CURRENTFRAME: frame range/selection
  --complexity {low,medium,high,veryhigh}: initial mesh refinement
  --quitAfterStartup: quit USDView immediately after start
  --sessionLayer SESSIONLAYER: open with a persistent session layer
  --mute MUTELAYERSRE: mute layers matching regex
 Detached Layers options: --detachLayers, --detachLayersInclude, --detachLayersExclude
```

Example:
```sh
usdview /path/to/scene.usd
```

---

## usdcat

- Usage: usdcat [OPTIONS] inputFiles...
- Summary: Convert USD to text (usdformat) or write to a file.
- Key options:
```sh
  -h, --help
  -o, --out file: output to a file instead of stdout
  --usdFormat usda|usdc: force underlying format for output
  -l, --loadOnly: validate loading of input files
  -f, --flatten: flatten the stage into a single root; writes composition
  --flattenLayerStack: flatten the layer stack without modifying children
  --skipSourceFileComment: skip writing a source comment in flatten
  --mask: limit stage population when flattening
  --layerMetadata: load only layer metadata (no content)
  --version: show version
```

Example:
```sh
usdcat scene.usd -o scene.usda --usdFormat usda
```

---

## usdstitch

- Usage: usdstitch [OPTIONS] usdFiles...
- synopsis: Stitch multiple USD assets into one file.
- Options:
```sh
  -h, --help
  -o, --out OUT: output file name
  (other options include time code handling and template metadata)
```

Example:
```sh
usdstitch a.usd b.usd -o merged.usd
```

---

## usdstitchclips

- Usage: usdstitchclips [options] usdFiles...
- Purpose: Stitch animation clips across multiple USD files with template metadata.
- Key options:
```sh
  -o, --out OUT
  -c, --clipPath CLIPPATH
  -s, --startTimeCode
  -r, --stride
  -e, --endTimeCode
  -t, --templateMetadata
  -p, --templatePath
  --clipSet CLIPSET
  --activeOffset ACTIVEOFFSET
  --interpolateMissingClipValues
  -n, --noComment
```

Examples:
```sh
usdstitchclips --out result.usd clip1.usd clip2.usd
```

---

## usdtree

- Usage: usdtree [OPTIONS] inputPath
- Purpose: Output the hierarchical tree of a USD stage, with optional metadata.
- Key options:
```sh
  -h, --help
  --unloaded
  -a, --attributes
  -m, --metadata
  -s, --simple
  -f, --flatten
  --flattenLayerStack
  --mask
```

Example:
```sh
usdtree scene.usd
```

---

## usdzip

- Usage: usdzip [-h] [-r] [-a ASSET] [--arkitAsset ARKITASSET] [-c] [-l [LISTTARGET]] [-d [DUMPTARGET]] [-v] [usdzFile] [inputFiles...]
- Purpose: Create or inspect USDZ packages.
- Key options:
```sh
  -h, --help
  -r, --recurse
  -a, --asset ASSET
  --arkitAsset ARKITASSET
  -c, --checkCompliance
  -l, --list [LISTTARGET]
  -d, --dump [DUMPTARGET]
  -v, --verbose
```

Note: ARKit-specific packaging and validation options are available where supported.

---

## usddiff

- Usage: usddiff [-h] [-n] [-f] [-q] files [files ...]
- Purpose: Compare two USD data files; uses system diff by default.
- Key options:
```sh
  -h, --help
  -n, --noeffect
  -f, --flatten
  -q, --brief
```

Example:
```sh
usddiff a.usd b.usd
```

---

## usdchecker

- Usage: usdchecker [OPTIONS] [inputFile]
- Purpose: Validate USD content across many validators.
- Options (highlights):
```sh
  -h, --help
  -s, --skipVariants
  -p, --rootPackageOnly
  -o, --out FILE
  --noAssetChecks
  -d, --dumpRules
  -v, --verbose
  -t, --strict
  --variantSets, --variants
  --disableVariantValidationLimit
  --useOldComplianceCheckerInterface
```

Note: The ARKit flag (--arkit) was removed in the Pixar USD mainline. ARKit validation is now handled via packaging and the Validation Framework, not usdchecker flags.

---

## Migration notes: ARKit removal
- The historical ARKit flag in usdchecker was deprecated and then removed around March 2026 in the Pixar USD development cycle.
- Recommended ARKit workflow now relies on:
  - usdzip --arkitAsset to package ARKit-friendly USDZ assets, and
  - The general Validation Framework validators to catch issues, rather than a dedicated ARKit check in usdchecker.
- Update CI and docs to reflect this change.

---

## Build & Configuration Notes
- The binaries are typically invoked from /usr/local/USD/bin.
- Environment: set PYTHONPATH and PATH to use the installed USD.
- Example:
```sh
export PYTHONPATH=/Users/you/usd-install/lib/python
export PATH=/Users/you/usd-install/bin:$PATH
```
