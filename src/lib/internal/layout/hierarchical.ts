import type { NodeId, UnfoldData, Vec3 } from "../../types";

// Sugiyama-style hierarchical DAG layout.
//
//   1. Layer assignment:        longest path from any root → layer index.
//                               All parents live in strictly earlier layers,
//                               so edges always travel forward.
//   2. Crossing minimization:   alternating top-down / bottom-up sweeps that
//                               reorder each layer by the barycenter (mean
//                               adjacent-layer index) of each node's
//                               neighbors. 4 round-trips is enough to settle
//                               most graphs; further iterations have
//                               diminishing returns.
//   3. Coordinate assignment:   evenly-spaced 1D within each layer.
//
// 3D placement: layers along z (horizontal on screen so distinct ranks are
// visible side-by-side), within-layer position along y, and a small
// deterministic per-id x perturbation so the layout reads as a 3D cloud
// instead of a flat sheet from every orbit angle.
//
// Cycle handling: nodes left over after topological layering (a SCC) are
// stacked at layer 0. This isn't ideal for cyclic graphs — Unfold's data
// model is DAG-shaped, so we don't try to be clever about it.

export interface HierarchicalLayoutOptions {
  /** World-space distance between adjacent layers (z axis). Default 5.5. */
  layerSpacing?: number;
  /** World-space distance between adjacent nodes within a layer (y axis).
   *  Default 1.5. */
  nodeSpacing?: number;
  /** Half-amplitude of the per-node x perturbation that gives the layout a
   *  3D feel. 0 = strictly planar. Default 0.6. */
  depthJitter?: number;
  /** Number of barycenter sweep round-trips (top-down + bottom-up = 1
   *  round-trip). Default 4. */
  iterations?: number;
}

export function layoutHierarchical(
  data: UnfoldData,
  opts: HierarchicalLayoutOptions = {},
): Map<NodeId, Vec3> {
  const layerSpacing = opts.layerSpacing ?? 5.5;
  const nodeSpacing = opts.nodeSpacing ?? 1.5;
  const depthJitter = opts.depthJitter ?? 0.6;
  const iterations = opts.iterations ?? 4;

  const ids = data.nodes.map((n) => n.id);
  const idSet = new Set(ids);

  // Adjacency over real edges only.
  const outgoing = new Map<NodeId, NodeId[]>();
  const incoming = new Map<NodeId, NodeId[]>();
  for (const id of ids) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }
  for (const e of data.edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    outgoing.get(e.source)!.push(e.target);
    incoming.get(e.target)!.push(e.source);
  }

  // --- 1. Layer assignment via Kahn topological sort.
  // layer[u] = max(layer[parent]) + 1 across all DAG parents; sources start
  // at 0. Nodes that never become in-degree-0 are part of a cycle and get
  // pinned to layer 0 at the end.
  const layer = new Map<NodeId, number>();
  const indeg = new Map<NodeId, number>();
  for (const id of ids) indeg.set(id, incoming.get(id)!.length);
  const queue: NodeId[] = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  for (const id of queue) layer.set(id, 0);
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi];
    const uLayer = layer.get(u)!;
    for (const v of outgoing.get(u)!) {
      const next = Math.max(layer.get(v) ?? 0, uLayer + 1);
      layer.set(v, next);
      indeg.set(v, (indeg.get(v) ?? 0) - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }
  for (const id of ids) if (!layer.has(id)) layer.set(id, 0);

  const maxLayer = ids.length === 0 ? 0 : Math.max(...layer.values());
  const layers: NodeId[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const id of ids) layers[layer.get(id)!].push(id);

  // --- 2. Barycenter crossing minimization.
  // For each layer, replace each node with the mean index of its
  // neighbors in the reference layer, then sort by that mean. Alternating
  // up / down keeps both sides of every layer consistent.
  const indexIn = (arr: NodeId[]) => {
    const m = new Map<NodeId, number>();
    arr.forEach((id, i) => m.set(id, i));
    return m;
  };

  const barycenter = (
    neighbors: NodeId[],
    idx: Map<NodeId, number>,
    fallback: number,
  ): number => {
    if (neighbors.length === 0) return fallback;
    let sum = 0;
    let count = 0;
    for (const n of neighbors) {
      const i = idx.get(n);
      if (i !== undefined) {
        sum += i;
        count++;
      }
    }
    return count === 0 ? fallback : sum / count;
  };

  for (let iter = 0; iter < iterations; iter++) {
    // Top-down: each layer reorders by the position of its parents.
    for (let li = 1; li <= maxLayer; li++) {
      const prevIdx = indexIn(layers[li - 1]);
      const selfIdx = indexIn(layers[li]);
      layers[li].sort((a, b) => {
        const aB = barycenter(incoming.get(a)!, prevIdx, selfIdx.get(a) ?? 0);
        const bB = barycenter(incoming.get(b)!, prevIdx, selfIdx.get(b) ?? 0);
        return aB - bB;
      });
    }
    // Bottom-up: each layer reorders by the position of its children.
    for (let li = maxLayer - 1; li >= 0; li--) {
      const nextIdx = indexIn(layers[li + 1]);
      const selfIdx = indexIn(layers[li]);
      layers[li].sort((a, b) => {
        const aB = barycenter(outgoing.get(a)!, nextIdx, selfIdx.get(a) ?? 0);
        const bB = barycenter(outgoing.get(b)!, nextIdx, selfIdx.get(b) ?? 0);
        return aB - bB;
      });
    }
  }

  // --- 3. Coordinate assignment.
  // Center each layer around y = 0 so the whole layout sits around origin.
  // x gets a small hash-deterministic perturbation so the cloud isn't flat.
  const pos = new Map<NodeId, Vec3>();
  const zMid = maxLayer / 2;
  for (let li = 0; li <= maxLayer; li++) {
    const nodes = layers[li];
    const n = nodes.length;
    const yOffset = (n - 1) / 2;
    for (let i = 0; i < n; i++) {
      const id = nodes[i];
      const z = (li - zMid) * layerSpacing;
      const y = (i - yOffset) * nodeSpacing;
      // Hash-based x in [-1, 1], scaled. Deterministic per id so the same
      // graph re-lays out identically.
      const h = hash32(id) / 0xffffffff;
      const x = (h * 2 - 1) * depthJitter;
      pos.set(id, [x, y, z]);
    }
  }
  return pos;
}

// FNV-1a 32-bit; matches the hash used in layered.ts so the codebase has a
// single per-id PRNG seed convention.
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
