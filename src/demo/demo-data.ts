import * as THREE from "three";
import type { UnfoldData, UnfoldEdge, UnfoldNode, Vec3 } from "../lib";

// Procedural tree generator for the demo. Ported from the original explorer
// state machine (src/explorer/state.ts, full-tree mode) so the tracer-bullet
// demo renders the same shape the prototype did. It is intentionally INLINED
// here on the demo side — the library knows nothing about how data is
// produced; it only renders the UnfoldData it's handed. Output uses plain Vec3
// tuples so the public data never carries a THREE.Vector3.

// --- deterministic PRNG (mulberry32 + FNV-1a), copied from the explorer ---

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

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const tup = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];

interface GenNode {
  id: string;
  position: THREE.Vector3;
  kind: "stable" | "crisis";
  parentId: string | null;
  depth: number;
}

/** Build a full tree to `depth` levels and return it as UnfoldData. Mirrors
 *  the explorer's `createExplorer({ mode: "full-tree" })` + child-fanning.
 *
 *  `positioned` (default true) emits explicit `position` on every node and
 *  `controls` on every edge — the prototype's hand-placed 3D shape. Set it
 *  false to omit both so the library's layered auto-layout takes over; the
 *  cosmetic incoming stub edge is dropped in that mode since it's authored
 *  relative to a root-at-origin the auto-layout doesn't guarantee. */
export function buildDemoData(
  seed = 9143,
  depth = 4,
  { positioned = true }: { positioned?: boolean } = {},
): UnfoldData {
  const nodes = new Map<string, GenNode>();
  const edges: UnfoldEdge[] = [];

  const root: GenNode = {
    id: "0",
    position: new THREE.Vector3(0, 0, 0),
    kind: "stable",
    parentId: null,
    depth: 0,
  };
  nodes.set(root.id, root);

  // Stub edge flowing into the root from below, so the root has visible
  // incoming flow before its branches grow. Its `source` references no node,
  // so the library flags it as a stub and ramps its upstream end in.
  if (positioned) {
    edges.push({
      id: "__stub__->0",
      source: "__stub__",
      target: "0",
      controls: [
        [0.0, -1.5, 0],
        [0.08, -1.0, 0.03],
        [0.03, -0.45, -0.03],
        [0, 0, 0],
      ],
    });
  }

  const expand = (node: GenNode, remaining: number) => {
    if (remaining <= 0) return;
    const rng = mulberry32(hashString(node.id) ^ (seed * 0x9e3779b1));
    const count = 2 + Math.floor(rng() * 3); // 2-4 children

    const parent = node.parentId ? nodes.get(node.parentId) : null;
    const incoming =
      parent && node.position.distanceToSquared(parent.position) > 1e-6
        ? node.position.clone().sub(parent.position).normalize()
        : new THREE.Vector3(0, 1, 0);

    const refUp =
      Math.abs(incoming.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
    const side = new THREE.Vector3().crossVectors(incoming, refUp).normalize();
    const up = new THREE.Vector3().crossVectors(side, incoming).normalize();

    const children: GenNode[] = [];
    for (let i = 0; i < count; i++) {
      const spread =
        ((i - (count - 1) / 2) / Math.max(1, count - 1)) * Math.PI * 0.55;
      const jitter = (rng() - 0.5) * 0.25;
      const yawAngle = spread + jitter;
      const pitchAngle = (rng() - 0.5) * 0.5;

      const dir = incoming
        .clone()
        .applyAxisAngle(up, yawAngle)
        .applyAxisAngle(side, pitchAngle)
        .normalize();

      const length = 2.2 + rng() * 1.3;
      const childPos = node.position.clone().add(dir.multiplyScalar(length));
      const child: GenNode = {
        id: `${node.id}.${i}`,
        position: childPos,
        kind: rng() < 0.4 ? "crisis" : "stable",
        parentId: node.id,
        depth: node.depth + 1,
      };
      nodes.set(child.id, child);
      edges.push(makeBezierEdge(node, child, rng, positioned));
      children.push(child);
    }
    for (const c of children) expand(c, remaining - 1);
  };

  expand(root, depth);

  const outNodes: UnfoldNode[] = [...nodes.values()].map((n) => ({
    id: n.id,
    category: n.kind,
    ...(positioned ? { position: tup(n.position) } : {}),
  }));

  return { nodes: outNodes, edges };
}

function makeBezierEdge(
  a: GenNode,
  b: GenNode,
  rng: () => number,
  positioned: boolean,
): UnfoldEdge {
  const base = { id: `${a.id}->${b.id}`, source: a.id, target: b.id };
  // Auto-layout mode: hand back just the topology and let the library derive
  // both positions and bezier controls.
  if (!positioned) return base;

  const dir = b.position.clone().sub(a.position);
  const len = dir.length();
  const t1 = a.position.clone().addScaledVector(dir, 0.33);
  const t2 = a.position.clone().addScaledVector(dir, 0.66);

  const refUp =
    Math.abs(dir.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const perp = new THREE.Vector3().crossVectors(dir, refUp).normalize();
  const wob = 0.18 * len;
  t1.addScaledVector(perp, (rng() - 0.5) * wob);
  t2.addScaledVector(perp, (rng() - 0.5) * wob);
  t1.z += (rng() - 0.5) * 0.3;
  t2.z += (rng() - 0.5) * 0.3;

  return {
    ...base,
    controls: [tup(a.position), tup(t1), tup(t2), tup(b.position)],
  };
}
