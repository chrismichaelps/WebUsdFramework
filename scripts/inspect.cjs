#!/usr/bin/env node
/** WebUsdFramework.Inspect - Testing oracle verifying content-preservation between source and USDA output */

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const wantJson = process.argv.includes('--json');

if (args.length < 2) {
  console.error('Usage: node scripts/inspect.cjs <source> <outputUsda> [--json]');
  process.exit(1);
}
const [srcPath, outPath] = args;
if (!fs.existsSync(srcPath)) { console.error(`source not found: ${srcPath}`); process.exit(1); }
if (!fs.existsSync(outPath)) { console.error(`output usda not found: ${outPath}`); process.exit(1); }

/**
 * Normalizes input source metadata (nodes, geometry, skins) for comparison against output data.
 */

/** Base shape returned by every front-end. */
function emptySrc() {
  return {
    format: null,
    nodes: 0,
    meshes: 0,
    primitives: 0,
    skins: 0,
    skinnedNodes: 0,       // node indices that have both mesh+skin
    joints: 0,             // total joints across all skins
    animations: 0,
    animationChannels: 0,
    animatedTargetNodes: 0,// distinct node indices referenced by any animation channel
    morphTargets: 0,
    materials: 0,
    textures: 0,           // unique texture indices
    images: 0,             // unique image indices
    vertexTotal: 0,
    triangleTotal: 0,
    warnings: [],
  };
}

async function inspectGltfLike(p) {
  // Lazy-require so non-gltf paths don't need @gltf-transform loaded.
  const { NodeIO } = require('@gltf-transform/core');
  const { KHRONOS_EXTENSIONS } = require('@gltf-transform/extensions');
  const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
  const doc = await io.read(p);
  const root = doc.getRoot();

  const s = emptySrc();
  s.format = p.toLowerCase().endsWith('.glb') ? 'glb' : 'gltf';
  s.nodes = root.listNodes().length;
  s.meshes = root.listMeshes().length;
  s.materials = root.listMaterials().length;
  s.textures = root.listTextures().length;
  s.images = s.textures; // gltf-transform collapses image+texture
  s.skins = root.listSkins().length;
  s.animations = root.listAnimations().length;

  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      s.primitives += 1;
      const pos = prim.getAttribute('POSITION');
      if (pos) s.vertexTotal += pos.getCount();
      const idx = prim.getIndices();
      const count = idx ? idx.getCount() : (pos ? pos.getCount() : 0);
      s.triangleTotal += Math.floor(count / 3);
      s.morphTargets += prim.listTargets().length;
    }
  }

  for (const skin of root.listSkins()) {
    s.joints += skin.listJoints().length;
  }
  for (const node of root.listNodes()) {
    if (node.getMesh() && node.getSkin()) s.skinnedNodes += 1;
  }

  const animatedTargets = new Set();
  for (const anim of root.listAnimations()) {
    for (const ch of anim.listChannels()) {
      s.animationChannels += 1;
      const target = ch.getTargetNode();
      if (target) animatedTargets.add(target);
    }
  }
  s.animatedTargetNodes = animatedTargets.size;

  return s;
}

function inspectObj(p) {
  const s = emptySrc();
  s.format = 'obj';
  const text = fs.readFileSync(p, 'utf8');
  const lines = text.split('\n');
  const mats = new Set();
  const mtllibs = new Set();
  let triangles = 0;
  let polys = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    if (line.startsWith('v ')) s.vertexTotal += 1;
    else if (line.startsWith('f ')) {
      const n = line.split(/\s+/).length - 1;
      if (n === 3) triangles += 1;
      else if (n > 3) { triangles += n - 2; polys += 1; }
    }
    else if (line.startsWith('o ')) s.nodes += 1;
    else if (line.startsWith('g ')) s.meshes += 1; // approx
    else if (line.startsWith('usemtl ')) mats.add(line.slice(7).trim());
    else if (line.startsWith('mtllib ')) mtllibs.add(line.slice(7).trim());
  }
  s.triangleTotal = triangles;
  s.materials = mats.size;
  s.primitives = s.meshes || 1;
  if (polys) s.warnings.push(`${polys} n-gons were triangulated during counting`);
  return s;
}

function inspectStl(p) {
  const s = emptySrc();
  s.format = 'stl';
  const buf = fs.readFileSync(p);
  // ASCII heuristic: starts with "solid " and contains "facet normal"
  const head = buf.slice(0, Math.min(256, buf.length)).toString('ascii');
  if (head.startsWith('solid ') && buf.includes(Buffer.from('facet normal'))) {
    const text = buf.toString('ascii');
    const triMatches = text.match(/facet normal/g);
    s.triangleTotal = triMatches ? triMatches.length : 0;
    s.vertexTotal = s.triangleTotal * 3;
  } else {
    // Binary STL: 80-byte header + uint32 tri count + 50 bytes/tri
    if (buf.length >= 84) {
      s.triangleTotal = buf.readUInt32LE(80);
      s.vertexTotal = s.triangleTotal * 3;
    }
  }
  s.meshes = 1;
  s.primitives = 1;
  return s;
}

async function inspectFbx(p) {
  // FBX is converted to GLB first by the framework via fbx2gltf. Rather than
  // re-parse FBX (complex binary), we look for an intermediate .glb next to
  // the input produced by the pipeline; if absent, mark as unsupported for
  // P0 and let the caller continue.
  const s = emptySrc();
  s.format = 'fbx';
  s.warnings.push('FBX source inspection not implemented in P0; only output side is validated.');
  return s;
}

async function inspectSource(p) {
  const ext = path.extname(p).toLowerCase();
  switch (ext) {
    case '.glb':
    case '.gltf': return inspectGltfLike(p);
    case '.obj':  return inspectObj(p);
    case '.stl':  return inspectStl(p);
    case '.fbx':  return inspectFbx(p);
    default:
      throw new Error(`Unsupported source extension: ${ext}`);
  }
}

/**
 * Textually parses the intermediate USDA file to extract prim counts and API schema applications.
 */

/**
 * Finds Skeleton/SkelAnimation pairs where the `joints` arrays disagree.
 *
 * USD binds SkelAnimation outputs to skeleton joints positionally by the
 * `joints` token array. If the Skeleton's joints and the child
 * SkelAnimation's joints differ in length or order, the animation silently
 * refuses to bind at runtime — the stage still loads but the skeleton
 * renders frozen in its rest pose. `usdcat --loadOnly` does not catch this.
 *
 * The parser is intentionally lightweight: we locate each `def Skeleton`
 * block via brace-depth walking, grab its first `joints` array (the
 * Skeleton's own), then grab the first `joints` array that appears after
 * the child `def SkelAnimation` marker (the animation's). Multi-line joint
 * arrays are tolerated.
 */

function parseJointsArray(inner) {
  return (inner.match(/"([^"]+)"/g) || []).map(s => s.slice(1, -1));
}

function findClosingBrace(text, openBraceIdx) {
  // Given text[openBraceIdx] === '{', returns the index of the matching '}'.
  // Returns text.length if no match (defensive — shouldn't happen on valid USDA).
  let depth = 1;
  let i = openBraceIdx + 1;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return i - 1;
}

function findSkelJointMismatches(text) {
  const mismatches = [];
  // Match `def Skeleton "NAME" (...)? { ...` with an optional metadata
  // paren-block between the name and the body open-brace.
  const skeletonHeader = /def\s+Skeleton\s+"([^"]+)"\s*(?:\([^)]*\)\s*)?\{/g;
  const skelJointsRe = /uniform\s+token\[\]\s+joints\s*=\s*\[([\s\S]*?)\]/;

  for (const m of text.matchAll(skeletonHeader)) {
    const skeletonName = m[1];
    const braceOpenIdx = m.index + m[0].length - 1;
    const endIdx = findClosingBrace(text, braceOpenIdx);
    const body = text.substring(braceOpenIdx + 1, endIdx);

    const skelJointsMatch = body.match(skelJointsRe);
    if (!skelJointsMatch) continue; // Skeleton with no joints — separate concern
    const skeletonJoints = parseJointsArray(skelJointsMatch[1]);

    // Each child SkelAnimation must use the same joints array (same length
    // and order). USD binds positionally.
    const animHeader = /def\s+SkelAnimation\s+"([^"]+)"\s*(?:\([^)]*\)\s*)?\{/g;
    for (const a of body.matchAll(animHeader)) {
      const animName = a[1];
      const animBraceIdx = a.index + a[0].length - 1;
      const animEndIdx = findClosingBrace(body, animBraceIdx);
      const animBody = body.substring(animBraceIdx + 1, animEndIdx);

      const animJointsMatch = animBody.match(skelJointsRe);
      if (!animJointsMatch) {
        mismatches.push({
          skeleton: skeletonName,
          animation: animName,
          reason: 'SkelAnimation has no joints array',
        });
        continue;
      }
      const animJoints = parseJointsArray(animJointsMatch[1]);

      if (animJoints.length !== skeletonJoints.length) {
        mismatches.push({
          skeleton: skeletonName,
          animation: animName,
          reason: `joints length mismatch (Skeleton ${skeletonJoints.length}, SkelAnimation ${animJoints.length})`,
        });
        continue;
      }
      for (let j = 0; j < skeletonJoints.length; j++) {
        if (skeletonJoints[j] !== animJoints[j]) {
          mismatches.push({
            skeleton: skeletonName,
            animation: animName,
            reason: `joint[${j}] differs (Skeleton "${skeletonJoints[j]}" vs SkelAnimation "${animJoints[j]}")`,
          });
          break;
        }
      }
    }
  }
  return mismatches;
}

function inspectUsda(p) {
  const text = fs.readFileSync(p, 'utf8');
  const o = {
    format: 'usda',
    meshes:           (text.match(/^\s*def\s+Mesh\b/gm) || []).length,
    xforms:           (text.match(/^\s*def\s+Xform\b/gm) || []).length,
    skelRoots:        (text.match(/^\s*def\s+SkelRoot\b/gm) || []).length,
    skeletons:        (text.match(/^\s*def\s+Skeleton\b/gm) || []).length,
    skelAnimations:   (text.match(/^\s*def\s+SkelAnimation\b/gm) || []).length,
    materials:        (text.match(/^\s*def\s+Material\b/gm) || []).length,
    shaders:          (text.match(/^\s*def\s+Shader\b/gm) || []).length,
    scopes:           (text.match(/^\s*def\s+Scope\b/gm) || []).length,
    pointInstancers:  (text.match(/^\s*def\s+PointInstancer\b/gm) || []).length,
    basisCurves:      (text.match(/^\s*def\s+BasisCurves\b/gm) || []).length,
    points:           (text.match(/^\s*def\s+Points\b/gm) || []).length,
    cameras:          (text.match(/^\s*def\s+Camera\b/gm) || []).length,
    lights:           (text.match(/^\s*def\s+(Sphere|Disk|Rect|Distant|Dome|Cylinder)Light\b/gm) || []).length,
    skelBindingApi:   (text.match(/SkelBindingAPI/g) || []).length,
    materialBindingApi:(text.match(/MaterialBindingAPI/g) || []).length,
    textureAssets:    new Set(
                        (text.match(/asset\s+inputs:file\s*=\s*@([^@]+)@/g) || [])
                          .map(m => m.match(/@([^@]+)@/)[1])
                      ).size,
    pointsAttribute:  (text.match(/\bpoint3f\[\]\s+points\b/g) || []).length,
    hasUpAxis:        /upAxis\s*=\s*"[YZ]"/.test(text),
    hasMetersPerUnit: /metersPerUnit\s*=\s*/.test(text),
    hasDefaultPrim:   /defaultPrim\s*=\s*"/.test(text),
    hasTimeCodes:     /startTimeCode\s*=/.test(text) && /endTimeCode\s*=/.test(text),
    skelJointMismatches: findSkelJointMismatches(text),
  };
  return o;
}

/**
 * Executes a semantic comparison between source intent and USDA output, flagging drops or regressions.
 */

function compare(src, out) {
  const findings = [];
  const note = (sev, tag, msg) => findings.push({ sev, tag, msg });

  // Stage metadata
  if (!out.hasUpAxis)        note('warn', 'meta', 'stage missing upAxis metadata');
  if (!out.hasMetersPerUnit) note('warn', 'meta', 'stage missing metersPerUnit metadata');
  if (!out.hasDefaultPrim)   note('warn', 'meta', 'stage missing defaultPrim metadata');

  // Geometry
  if (src.primitives > 0) {
    // The framework may emit one Mesh per primitive OR one per source mesh.
    // Require at least one USD Mesh (or PointInstancer for instanced meshes).
    const geomPrimCount = out.meshes + out.pointInstancers + out.points + out.basisCurves;
    if (geomPrimCount === 0) note('fail', 'geom', 'source has geometry but output has zero Mesh/Points/BasisCurves/PointInstancer prims');
    if (geomPrimCount < src.primitives) {
      note('fail', 'geom', `source has ${src.primitives} primitives but output has only ${geomPrimCount} geometry prims — parts may be missing`);
    }
  }

  // Skinning
  if (src.skins > 0) {
    if (out.skelRoots === 0) note('fail', 'skel', `source has ${src.skins} skins but output has no SkelRoot prims`);
    else if (out.skelRoots < src.skins) note('warn', 'skel', `source has ${src.skins} skins but output has ${out.skelRoots} SkelRoot prims (could be valid if skins share a root)`);
    if (out.skeletons === 0) note('fail', 'skel', 'source has skins but output has no Skeleton prims');
    if (out.skelBindingApi === 0) note('fail', 'skel', 'output never applies SkelBindingAPI; skinning will not bind');
  }

  // Animation — the central bug we need to catch.
  if (src.animations > 0 && src.skins > 0) {
    if (out.skelAnimations === 0) {
      note('fail', 'anim', `source has ${src.animations} animation(s) and ${src.skins} skin(s) but output has zero SkelAnimation prims`);
    } else if (out.skelAnimations < out.skelRoots) {
      note('fail', 'anim',
        `output has ${out.skelRoots} SkelRoot prims but only ${out.skelAnimations} SkelAnimation prims — ` +
        `${out.skelRoots - out.skelAnimations} skinned prim(s) will not animate`);
    }
    if (src.animationChannels > 0 && !out.hasTimeCodes) {
      note('warn', 'anim', 'source has animation channels but stage lacks startTimeCode/endTimeCode');
    }
  }

  // SkelAnimation joints must align with their parent Skeleton's joints.
  // USD binds positionally by the `joints` token array; any divergence
  // silently drops the animation binding at runtime even though the stage
  // still loads cleanly in usdcat.
  if (out.skelJointMismatches && out.skelJointMismatches.length > 0) {
    for (const mm of out.skelJointMismatches) {
      note('fail', 'anim',
        `Skeleton "${mm.skeleton}" <> SkelAnimation "${mm.animation}": ${mm.reason}`);
    }
  }

  // Materials
  if (src.materials > 0) {
    if (out.materials === 0) note('fail', 'mat', `source has ${src.materials} material(s) but output has zero Material prims`);
    else if (out.materials < src.materials) note('warn', 'mat', `source had ${src.materials} material(s), output has ${out.materials}`);
    if (src.materials > 0 && out.materialBindingApi === 0) note('warn', 'mat', 'no MaterialBindingAPI applied anywhere in output');
  }

  // Textures
  if (src.textures > 0 && out.textureAssets === 0) {
    note('fail', 'tex', `source has ${src.textures} texture(s) but output references zero texture assets`);
  } else if (src.textures > out.textureAssets) {
    note('warn', 'tex', `source has ${src.textures} unique texture(s), output references ${out.textureAssets}`);
  }

  // Source-side warnings surfaced by inspector
  for (const w of src.warnings) note('warn', 'src', w);

  return findings;
}

/**
 * Orchestrates the full inspection lifecycle and exits with failure if regressions are detected.
 */

(async () => {
  const src = await inspectSource(srcPath);
  const out = inspectUsda(outPath);
  const findings = compare(src, out);

  if (wantJson) {
    console.log(JSON.stringify({ src, out, findings }, null, 2));
  } else {
    const line = s => `  ${s}`;
    console.log('# source inventory');
    console.log(line(`format             : ${src.format}`));
    console.log(line(`nodes              : ${src.nodes}`));
    console.log(line(`meshes             : ${src.meshes}`));
    console.log(line(`primitives         : ${src.primitives}`));
    console.log(line(`vertex total       : ${src.vertexTotal}`));
    console.log(line(`triangle total     : ${src.triangleTotal}`));
    console.log(line(`skins              : ${src.skins}`));
    console.log(line(`skinned nodes      : ${src.skinnedNodes}`));
    console.log(line(`joints (total)     : ${src.joints}`));
    console.log(line(`animations         : ${src.animations}`));
    console.log(line(`animation channels : ${src.animationChannels}`));
    console.log(line(`animated targets   : ${src.animatedTargetNodes}`));
    console.log(line(`morph targets      : ${src.morphTargets}`));
    console.log(line(`materials          : ${src.materials}`));
    console.log(line(`textures           : ${src.textures}`));
    console.log('');
    console.log('# output inventory');
    for (const [k, v] of Object.entries(out)) {
      // Arrays/objects are printed as their count to keep the report scannable;
      // the underlying details are surfaced via the findings section below.
      const display = Array.isArray(v) ? `${v.length} item(s)` : v;
      console.log(line(`${k.padEnd(20)}: ${display}`));
    }
    console.log('');
    console.log('# findings');
    if (findings.length === 0) {
      console.log(line('(no discrepancies)'));
    } else {
      for (const f of findings) {
        const tag = `[${f.sev.toUpperCase()}:${f.tag}]`.padEnd(14);
        console.log(line(`${tag} ${f.msg}`));
      }
    }
  }

  const failed = findings.some(f => f.sev === 'fail');
  process.exit(failed ? 2 : 0);
})().catch(err => {
  console.error('[inspect] error:', err);
  process.exit(1);
});
