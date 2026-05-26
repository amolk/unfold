import type { NodeId, UnfoldData, Vec3 } from "../../types";

// Layered layout for trees and DAGs. Depth = shortest path from a root
// (in-degree-0 node); siblings are spread along a second axis with each
// subtree owning a horizontal band proportional to its leaf count. Multi-parent
// DAG nodes collapse to a primary-parent forest (min-depth parent) for the
// horizontal placement — some cross edges are accepted, as the plan notes.

const AXIS = { x: 0, y: 1, z: 2 } as const;

export interface LayeredLayoutOptions {
  /** Axis node depth (distance from root) grows along. Default "y" (up). */
  depthAxis?: "x" | "y" | "z";
  /** Axis siblings spread along. Default "z". Phase 9 flips these for 2D. */
  spreadAxis?: "x" | "y" | "z";
  /** World units between adjacent depth layers. Default 2.6. */
  depthSpacing?: number;
  /** World units per unit of sibling spread. Default 1.6. */
  spreadSpacing?: number;
}

export function layoutLayered(
  data: UnfoldData,
  opts: LayeredLayoutOptions = {},
): Map<NodeId, Vec3> {
  const depthAxis = opts.depthAxis ?? "y";
  const spreadAxis = opts.spreadAxis ?? "z";
  const depthSpacing = opts.depthSpacing ?? 2.6;
  const spreadSpacing = opts.spreadSpacing ?? 1.6;

  const ids = data.nodes.map((n) => n.id);
  const idSet = new Set(ids);

  // Adjacency + in-degree over REAL edges only (stub edges, whose source isn't
  // a node, don't make their target a non-root or contribute to layout).
  const children = new Map<NodeId, NodeId[]>();
  const indeg = new Map<NodeId, number>();
  for (const id of ids) {
    children.set(id, []);
    indeg.set(id, 0);
  }
  for (const e of data.edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    children.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }

  // Roots = in-degree 0, in input order. A fully-cyclic graph has none —
  // fall back to the first node so we still produce a layout.
  let roots = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  if (roots.length === 0 && ids.length > 0) roots = [ids[0]];

  // BFS depth = shortest path from any root.
  const depth = new Map<NodeId, number>();
  const queue: NodeId[] = [];
  for (const r of roots) {
    depth.set(r, 0);
    queue.push(r);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi];
    const d = depth.get(u)!;
    for (const v of children.get(u)!) {
      if (!depth.has(v)) {
        depth.set(v, d + 1);
        queue.push(v);
      }
    }
  }
  for (const id of ids) if (!depth.has(id)) depth.set(id, 0); // unreachable

  // Primary-parent forest: each non-root picks its min-depth upward parent
  // (tie → input edge order) so DAGs collapse to a tree for placement.
  const parentOf = new Map<NodeId, NodeId | null>();
  for (const id of ids) parentOf.set(id, null);
  for (const e of data.edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    const child = e.target;
    const cand = e.source;
    if (depth.get(cand)! >= depth.get(child)!) continue; // upward edges only
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

  // Leaf count per node → band width.
  const leaves = new Map<NodeId, number>();
  const countLeaves = (u: NodeId): number => {
    const cs = kids.get(u)!;
    if (cs.length === 0) {
      leaves.set(u, 1);
      return 1;
    }
    let sum = 0;
    for (const c of cs) sum += countLeaves(c);
    leaves.set(u, sum);
    return sum;
  };
  for (const r of roots) countLeaves(r);

  // In-order placement: each subtree owns a contiguous band; a node sits at
  // the center of its children's span. Roots get adjacent bands.
  const spread = new Map<NodeId, number>();
  let cursor = 0;
  const place = (u: NodeId) => {
    const cs = kids.get(u)!;
    if (cs.length === 0) {
      spread.set(u, cursor);
      cursor += 1;
      return;
    }
    const start = cursor;
    for (const c of cs) place(c);
    spread.set(u, (start + cursor - 1) / 2);
  };
  for (const r of roots) place(r);

  // Center the spread axis around 0.
  const vals = [...spread.values()];
  const mid = vals.length ? (Math.min(...vals) + Math.max(...vals)) / 2 : 0;

  const out = new Map<NodeId, Vec3>();
  for (const id of ids) {
    const p: Vec3 = [0, 0, 0];
    p[AXIS[depthAxis]] = depth.get(id)! * depthSpacing;
    p[AXIS[spreadAxis]] = (spread.get(id)! - mid) * spreadSpacing;
    out.set(id, p);
  }
  return out;
}
