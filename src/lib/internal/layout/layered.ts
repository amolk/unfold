import type { NodeId, UnfoldData, Vec3 } from "../../types";

// Layered 3D conical layout for trees and DAGs. Depth = shortest path from a
// root (in-degree-0 node); each parent's children radiate outward in a cone
// aligned with the parent's incoming growth direction, mirroring the
// prototype's procedural tree style (see src/demo/demo-data.ts) — but
// deterministic, no Math.random. Multi-parent DAG nodes collapse to a
// primary-parent forest (min-depth parent, tie → input edge order) so the
// cone placement has a single parent direction to fan around; the extra
// edges still render but won't influence position.

export interface LayeredLayoutOptions {
  /** World-space mean edge length between a parent and each child. Default
   *  2.85 (matches the prototype's 2.2..3.5 mean). Per-child variation is
   *  added on top by `lengthJitter`. */
  edgeLength?: number;
  /** Per-child world-space length variation, drawn deterministically from a
   *  per-id hash so a child's length doesn't shift if siblings come and go.
   *  Default 1.3 (matches the prototype's `rng()*1.3` range). 0 = constant. */
  lengthJitter?: number;
  /** Total angular SPAN (radians) of the yaw fan that spreads siblings
   *  around the growth axis — the formula `((i - (n-1)/2) / (n-1)) * span`
   *  produces values in [-span/2, +span/2], so default π·0.55 (≈99° total,
   *  ±49° at the edges) matches the prototype exactly. */
  fanAngle?: number;
  /** Per-child yaw jitter (radians) added on top of the even angular fan, so
   *  siblings don't sit on perfectly symmetric rays. Default 0.25 (matches
   *  the prototype's `(rng()-0.5)*0.25`). 0 = symmetric fan. */
  yawJitter?: number;
  /** Per-child pitch jitter (radians) bending the fan out of its yaw plane,
   *  so the tree looks 3D-bushy rather than flat-fan. Default 0.5 (matches
   *  the prototype). 0 = strictly planar fans. */
  pitchJitter?: number;
}

// --- pure Vec3 helpers (no THREE dependency in this file) ---

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const normalize = (v: Vec3): Vec3 => {
  const L = len(v) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
};
const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Rodrigues' rotation: rotate `v` by `theta` radians around unit axis `k`. */
function rotateAroundAxis(v: Vec3, k: Vec3, theta: number): Vec3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const kxv = cross(k, v);
  const kdotv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  return [
    v[0] * c + kxv[0] * s + k[0] * kdotv * (1 - c),
    v[1] * c + kxv[1] * s + k[1] * kdotv * (1 - c),
    v[2] * c + kxv[2] * s + k[2] * kdotv * (1 - c),
  ];
}

/** FNV-1a hash of a string into a 32-bit uint, used as the seed for the
 *  per-child PRNG below. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small deterministic PRNG returning values in [0, 1). One
 *  instance per child id gives us three independent draws (yaw jitter,
 *  pitch, length) without correlating them or shifting if siblings change.
 *  Matches the per-parent rng in src/demo/demo-data.ts; combined with the
 *  hash32 seed above, this is the exact same draw sequence the prototype's
 *  procedural generator uses for an equivalent node id. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function layoutLayered(
  data: UnfoldData,
  opts: LayeredLayoutOptions = {},
): Map<NodeId, Vec3> {
  const edgeLength = opts.edgeLength ?? 2.85;
  const lengthJitter = opts.lengthJitter ?? 1.3;
  const fanAngle = opts.fanAngle ?? Math.PI * 0.55;
  const yawJitter = opts.yawJitter ?? 0.25;
  const pitchJitter = opts.pitchJitter ?? 0.5;

  const ids = data.nodes.map((n) => n.id);
  const idSet = new Set(ids);

  // Adjacency + in-degree over REAL edges only (stub edges, whose source
  // isn't a node, don't make their target a non-root or affect placement).
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
  // (tie → input edge order) so DAG cone placement has a single parent.
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

  // --- recursive cone placement ---
  // Each node carries a world position AND an incoming-direction vector
  // (parent → self). That vector is the axis its own children's fan rotates
  // around. The root has no parent — seed its incoming as (0, 1, 0) so the
  // tree grows upward by default, matching the prototype's look.

  const pos = new Map<NodeId, Vec3>();
  const incomingOf = new Map<NodeId, Vec3>();

  // Roots: laid out left-to-right along X so a forest with multiple roots
  // doesn't pile up at the origin. Single-root case (the common one) is
  // unaffected — root sits at (0, 0, 0).
  const rootSpacing = edgeLength * 2;
  const rootOffset = ((roots.length - 1) * rootSpacing) / 2;
  roots.forEach((rId, i) => {
    pos.set(rId, [i * rootSpacing - rootOffset, 0, 0]);
    incomingOf.set(rId, [0, 1, 0]);
  });

  // BFS so each child is placed only after its primary parent has a position
  // and incoming direction. Same `queue` traversal as the depth BFS but over
  // the primary-parent tree (kids), not the full adjacency.
  const place: NodeId[] = [...roots];
  for (let qi = 0; qi < place.length; qi++) {
    const u = place[qi];
    const cs = kids.get(u)!;
    if (cs.length === 0) continue;
    const uPos = pos.get(u)!;
    const incoming = incomingOf.get(u)!;

    // Build an orthonormal frame around `incoming`:
    //   side = incoming × refUp  (perpendicular yaw axis)
    //   up   = side × incoming   (perpendicular pitch axis)
    // refUp flips to keep the cross product well-conditioned when `incoming`
    // is near-vertical — same trick as bezier.ts and demo-data.ts.
    const refUp: Vec3 =
      Math.abs(incoming[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const side = normalize(cross(incoming, refUp));
    const up = normalize(cross(side, incoming));

    const n = cs.length;
    for (let i = 0; i < n; i++) {
      const cId = cs[i];
      // Three independent draws from a per-child PRNG so yaw jitter, pitch,
      // and length variation are uncorrelated — and stay stable if siblings
      // are added or removed (each child's seed is its own id). Draws are
      // always taken (even when their multiplier is 0) so toggling one
      // jitter off doesn't shift the others' values.
      const rng = mulberry32(hash32(cId));
      const rYaw = rng();
      const rPitch = rng();
      const rLen = rng();
      const yawJit = (rYaw - 0.5) * yawJitter;
      const pitch = (rPitch - 0.5) * pitchJitter;
      const lenVar = rLen * lengthJitter;
      // Yaw: even angular fan around `up`, centered on `incoming`, plus the
      // per-child jitter. For a 1-child node we straight-shoot incoming
      // (no fan, but jitter still applies so a chain of single children
      // doesn't run perfectly straight).
      const yawFan = n === 1 ? 0 : ((i - (n - 1) / 2) / (n - 1)) * fanAngle;
      const yaw = yawFan + yawJit;

      const dir = rotateAroundAxis(
        rotateAroundAxis(incoming, up, yaw),
        side,
        pitch,
      );
      // Length = mean - half-jitter + drawn variation, so a 0 draw lands at
      // the low end (matching the prototype's `2.2 + rng()*1.3`) and a 1.0
      // draw lands at the high end.
      const length = edgeLength - lengthJitter * 0.5 + lenVar;
      const cPos = add(uPos, scale(dir, length));
      pos.set(cId, cPos);
      // Incoming for the child = its own (parent → child) direction. Use the
      // ACTUAL world displacement (not `dir`) so floating-point drift can't
      // accumulate across deep trees.
      const inc = normalize(sub(cPos, uPos));
      incomingOf.set(cId, inc);
      place.push(cId);
    }
  }

  // Unreachable nodes (cyclic or orphaned) — place at origin so they don't
  // disappear off the camera. Should be rare; flagged but not warned.
  const out = new Map<NodeId, Vec3>();
  for (const id of ids) {
    out.set(id, pos.get(id) ?? [0, 0, 0]);
  }
  return out;
}
