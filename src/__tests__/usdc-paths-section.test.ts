/**
 * Tests for the USDC PATHS section encoder.
 *
 * The encoder walks a `PathNode` tree depth-first and emits three parallel
 * int32 arrays (pathIndexes, elementTokenIndexes, jumps) which are each
 * TfDelta-compressed on disk. Round-trip tests verify that decoding the
 * bytes and re-walking produces the original tree shape.
 *
 * NOTE: These tests verify round-trip correctness through our own decoder.
 * Byte-for-byte compatibility with OpenUSD-produced fixtures is gated
 * behind the pipeline-integration validation (#122).
 */
import { describe, it, expect } from 'vitest';
import {
  encodePathsSection,
  decodePathsSection,
  rebuildPathTree,
  type PathNode,
} from '../converters/shared/usdc/paths-section';

function makeLeaf(pathIndex: number, tokenIndex: number, isProperty = false): PathNode {
  return { pathIndex, elementTokenIndex: tokenIndex, isProperty, children: [] };
}

function treesEqual(a: PathNode, b: PathNode): boolean {
  if (a.pathIndex !== b.pathIndex) return false;
  if (a.elementTokenIndex !== b.elementTokenIndex) return false;
  if (a.isProperty !== b.isProperty) return false;
  if (a.children.length !== b.children.length) return false;
  for (let i = 0; i < a.children.length; i++) {
    if (!treesEqual(a.children[i], b.children[i])) return false;
  }
  return true;
}

describe('encodePathsSection — single-node tree', () => {
  it('emits one entry with jump = -1 for a leaf root', () => {
    const root = makeLeaf(0, 1);
    const enc = encodePathsSection(root);
    expect(enc.pathIndexes).toEqual(Int32Array.from([0]));
    expect(enc.elementTokenIndexes).toEqual(Int32Array.from([1]));
    expect(enc.jumps).toEqual(Int32Array.from([-1]));
  });

  it('section header records the path count and three compressedSizes', () => {
    const enc = encodePathsSection(makeLeaf(0, 1));
    const view = new DataView(enc.bytes.buffer, enc.bytes.byteOffset, enc.bytes.byteLength);
    expect(view.getBigUint64(0, true)).toBe(1n);
    // Each compressedSize should be > 0 (1 header byte + 1 byte payload).
    expect(view.getBigUint64(8, true)).toBeGreaterThan(0n);
    expect(view.getBigUint64(16, true)).toBeGreaterThan(0n);
    expect(view.getBigUint64(24, true)).toBeGreaterThan(0n);
  });
});

describe('encodePathsSection — jump semantics', () => {
  it('marks last sibling with children using jump = 0', () => {
    // Root has one child which is the last sibling and a leaf.
    const root: PathNode = {
      pathIndex: 0,
      elementTokenIndex: 1,
      isProperty: false,
      children: [makeLeaf(1, 2)],
    };
    const enc = encodePathsSection(root);
    expect(Array.from(enc.jumps)).toEqual([0, -1]);
  });

  it('marks intermediate sibling with no children using positive jump', () => {
    // Root with two children, both leaves; second is the last sibling.
    const root: PathNode = {
      pathIndex: 0,
      elementTokenIndex: 1,
      isProperty: false,
      children: [makeLeaf(1, 2), makeLeaf(2, 3)],
    };
    const enc = encodePathsSection(root);
    // Root has children → jump 0; first child has next sibling → jump 1
    // (offset to next path); second child is last sibling, leaf → jump -1.
    expect(Array.from(enc.jumps)).toEqual([0, 1, -1]);
  });

  it('marks an intermediate node with both children and sibling using jump = -2', () => {
    // Root has two children. First child has its own child and is NOT the
    // last sibling.
    const root: PathNode = {
      pathIndex: 0,
      elementTokenIndex: 1,
      isProperty: false,
      children: [
        {
          pathIndex: 1,
          elementTokenIndex: 2,
          isProperty: false,
          children: [makeLeaf(2, 3)],
        },
        makeLeaf(3, 4),
      ],
    };
    const enc = encodePathsSection(root);
    // jumps: root=0, child1=-2, child1's child=-1, child2=-1.
    expect(Array.from(enc.jumps)).toEqual([0, -2, -1, -1]);
  });

  it('encodes property paths with negative elementTokenIndexes', () => {
    const root: PathNode = {
      pathIndex: 0,
      elementTokenIndex: 1,
      isProperty: false,
      children: [makeLeaf(1, 5, /* isProperty */ true)],
    };
    const enc = encodePathsSection(root);
    expect(Array.from(enc.elementTokenIndexes)).toEqual([1, -5]);
  });
});

describe('encodePathsSection / decode round-trip', () => {
  function roundTrip(root: PathNode): PathNode {
    const enc = encodePathsSection(root);
    const dec = decodePathsSection(enc.bytes);
    expect(Array.from(dec.pathIndexes)).toEqual(Array.from(enc.pathIndexes));
    expect(Array.from(dec.elementTokenIndexes)).toEqual(Array.from(enc.elementTokenIndexes));
    expect(Array.from(dec.jumps)).toEqual(Array.from(enc.jumps));
    return rebuildPathTree(dec.pathIndexes, dec.elementTokenIndexes, dec.jumps);
  }

  it('round-trips a single leaf', () => {
    const root = makeLeaf(0, 1);
    expect(treesEqual(roundTrip(root), root)).toBe(true);
  });

  it('round-trips a parent with one child', () => {
    const root: PathNode = {
      pathIndex: 0,
      elementTokenIndex: 1,
      isProperty: false,
      children: [makeLeaf(1, 2)],
    };
    expect(treesEqual(roundTrip(root), root)).toBe(true);
  });

  it('round-trips a parent with multiple children', () => {
    const root: PathNode = {
      pathIndex: 0,
      elementTokenIndex: 1,
      isProperty: false,
      children: [makeLeaf(1, 2), makeLeaf(2, 3), makeLeaf(3, 4)],
    };
    expect(treesEqual(roundTrip(root), root)).toBe(true);
  });

  it('round-trips a representative scene (Root → Materials, Scene → Mesh + Points)', () => {
    const root: PathNode = {
      pathIndex: 0,
      elementTokenIndex: 1, // "Root"
      isProperty: false,
      children: [
        {
          pathIndex: 1,
          elementTokenIndex: 2, // "Materials"
          isProperty: false,
          children: [makeLeaf(2, 3) /* "PlyMaterial" */],
        },
        {
          pathIndex: 3,
          elementTokenIndex: 4, // "Scene"
          isProperty: false,
          children: [
            {
              pathIndex: 4,
              elementTokenIndex: 5, // "PlyPoints"
              isProperty: false,
              children: [
                makeLeaf(5, 6, true), // ".points"
                makeLeaf(6, 7, true), // ".widths"
              ],
            },
          ],
        },
      ],
    };
    expect(treesEqual(roundTrip(root), root)).toBe(true);
  });

  it('round-trips a deep linear chain', () => {
    let curr: PathNode = makeLeaf(10, 20);
    for (let depth = 9; depth >= 0; depth--) {
      curr = {
        pathIndex: depth,
        elementTokenIndex: depth + 1,
        isProperty: false,
        children: [curr],
      };
    }
    expect(treesEqual(roundTrip(curr), curr)).toBe(true);
  });
});

describe('decodePathsSection — error paths', () => {
  it('throws on truncated header', () => {
    expect(() => decodePathsSection(new Uint8Array(16))).toThrow();
  });

  it('throws when section is shorter than declared sizes', () => {
    const enc = encodePathsSection(makeLeaf(0, 1));
    expect(() => decodePathsSection(enc.bytes.slice(0, enc.bytes.length - 1))).toThrow();
  });
});
