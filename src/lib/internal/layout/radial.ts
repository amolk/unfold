import type { NodeId, UnfoldData, Vec3 } from "../../types";

// Flat radial concentric-rings layout. The root sits at origin; each
// successive depth lives on a circle of `depth × ringSpacing` radius.
// Each node receives an angular wedge proportional to the size of its
// subtree (Reingold-Tilford radial variant), so siblings with bigger
// subtrees fan wider and edges don't crisscross.
//
// The layout lives on the y/z plane (x = 0 for every node). The default
// camera at (9, 1.2, 0) is on the +x axis looking at origin, so it sees
// this disc face-on rather than edge-on.
//
// Multi-parent DAG nodes collapse to a primary-parent forest the same way
// `layered` does (min-depth parent, ties → input edge order).

export interface RadialLayoutOptions {
  /** Radius increment per depth level. Default 2.5. */
  ringSpacing?: number;
  /** Total angular span available to the layout, in radians. Default 2π
   *  (a full circle). Reduce for a fan rather than a disc. */
  span?: number;
}

export function layoutRadial(
  data: UnfoldData,
  opts: RadialLayoutOptions = {},
): Map<NodeId, Vec3> {
  const ringSpacing = opts.ringSpacing ?? 2.5;
  const span = opts.span ?? Math.PI * 2;

  const ids = data.nodes.map((n) => n.id);
  const idSet = new Set(ids);

  // Adjacency + in-degree over real edges only (stub edges with unknown
  // sources don't make their target a non-root).
  const allChildren = new Map<NodeId, NodeId[]>();
  const indeg = new Map<NodeId, number>();
  for (const id of ids) {
    allChildren.set(id, []);
    indeg.set(id, 0);
  }
  for (const e of data.edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    allChildren.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }

  // Roots = in-degree 0 (fully-cyclic graph falls back to the first node).
  let roots = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  if (roots.length === 0 && ids.length > 0) roots = [ids[0]];

  // BFS depth from any root.
  const depth = new Map<NodeId, number>();
  const queue: NodeId[] = [];
  for (const r of roots) {
    depth.set(r, 0);
    queue.push(r);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi];
    const d = depth.get(u)!;
    for (const v of allChildren.get(u)!) {
      if (!depth.has(v)) {
        depth.set(v, d + 1);
        queue.push(v);
      }
    }
  }
  for (const id of ids) if (!depth.has(id)) depth.set(id, 0);

  // Primary-parent forest so DAGs reduce to a tree for placement.
  const parentOf = new Map<NodeId, NodeId | null>();
  for (const id of ids) parentOf.set(id, null);
  for (const e of data.edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    const child = e.target;
    const cand = e.source;
    if (depth.get(cand)! >= depth.get(child)!) continue;
    const cur = parentOf.get(child) ?? null;
    if (cur === null || depth.get(cand)! < depth.get(cur)!) {
      parentOf.set(child, cand);
    }
  }
  const kids = new Map<NodeId, NodeId[]>();
  for (const id of ids) kids.set(id, []);
  for (const id of ids) {
    const p = parentOf.get(id);
    if (p != null) kids.get(p)!.push(id);
  }

  // Subtree leaf count = the angular weight of each node.
  const weight = new Map<NodeId, number>();
  const computeWeight = (id: NodeId): number => {
    const ch = kids.get(id) ?? [];
    if (ch.length === 0) {
      weight.set(id, 1);
      return 1;
    }
    let w = 0;
    for (const c of ch) w += computeWeight(c);
    weight.set(id, w);
    return w;
  };
  for (const r of roots) computeWeight(r);

  // Walk in pre-order, splitting each parent's wedge among its children in
  // proportion to subtree weight. Each node sits at the midpoint of its
  // wedge, on the ring for its depth.
  const pos = new Map<NodeId, Vec3>();
  const place = (id: NodeId, angleStart: number, angleEnd: number) => {
    const angle = (angleStart + angleEnd) / 2;
    const r = (depth.get(id) ?? 0) * ringSpacing;
    pos.set(id, [0, r * Math.cos(angle), r * Math.sin(angle)]);
    const ch = kids.get(id) ?? [];
    if (ch.length === 0) return;
    const w = weight.get(id) ?? 1;
    let acc = angleStart;
    for (const c of ch) {
      const cw = weight.get(c) ?? 1;
      const childSpan = (angleEnd - angleStart) * (cw / w);
      place(c, acc, acc + childSpan);
      acc += childSpan;
    }
  };

  // Divide the total angular `span` evenly across roots (single root gets
  // the whole span, no shift).
  if (roots.length === 1) {
    place(roots[0], -span / 2, span / 2);
  } else {
    const perRoot = span / roots.length;
    for (let i = 0; i < roots.length; i++) {
      const start = -span / 2 + i * perRoot;
      place(roots[i], start, start + perRoot);
    }
  }

  return pos;
}
