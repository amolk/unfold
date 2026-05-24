import * as THREE from "three";

export type NodeKind = "stable" | "crisis";

export interface TimelineNode {
  id: number;
  position: THREE.Vector3;
  kind: NodeKind;
  depth: number;
}

export interface TimelineEdge {
  id: number;
  from: number;
  to: number;
  // Cubic bezier control points (4 vec3s). Sampled into the curve texture.
  controls: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  // Visual weight — trunk edges get more particles than fine branches.
  weight: number;
  fromKind: NodeKind;
  toKind: NodeKind;
}

export interface Timeline {
  nodes: TimelineNode[];
  edges: TimelineEdge[];
}

// Tiny seeded PRNG (mulberry32) so the layout is stable across reloads.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenerateOptions {
  seed?: number;
  trunkLength?: number;     // total x-extent of the main trunk
  trunkSegments?: number;   // number of crisis points along the trunk
  branchProbability?: number;
  maxDepth?: number;
}

export function generateTimeline(opts: GenerateOptions = {}): Timeline {
  const {
    seed = 7,
    trunkLength = 14,
    trunkSegments = 6,
    branchProbability = 0.75,
    maxDepth = 3,
  } = opts;

  const rand = mulberry32(seed);
  const nodes: TimelineNode[] = [];
  const edges: TimelineEdge[] = [];
  let nodeId = 0;
  let edgeId = 0;

  const makeNode = (
    position: THREE.Vector3,
    kind: NodeKind,
    depth: number,
  ): TimelineNode => {
    const n: TimelineNode = { id: nodeId++, position, kind, depth };
    nodes.push(n);
    return n;
  };

  const makeEdge = (a: TimelineNode, b: TimelineNode, jitter: number, weight: number) => {
    // Cubic bezier: pull the two interior control points toward each other
    // and add some lateral wobble so the curve feels organic.
    const dir = b.position.clone().sub(a.position);
    const len = dir.length();
    const t1 = a.position.clone().add(dir.clone().multiplyScalar(0.33));
    const t2 = a.position.clone().add(dir.clone().multiplyScalar(0.66));
    const perp = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
    const wob = jitter * len;
    t1.add(perp.clone().multiplyScalar((rand() - 0.5) * wob));
    t2.add(perp.clone().multiplyScalar((rand() - 0.5) * wob));
    t1.z += (rand() - 0.5) * 0.4;
    t2.z += (rand() - 0.5) * 0.4;

    edges.push({
      id: edgeId++,
      from: a.id,
      to: b.id,
      controls: [a.position.clone(), t1, t2, b.position.clone()],
      weight,
      fromKind: a.kind,
      toKind: b.kind,
    });
  };

  // Trunk: straight along +X, slightly curved.
  const trunkStart = new THREE.Vector3(-trunkLength / 2, 0, 0);
  let prev = makeNode(trunkStart, "stable", 0);

  for (let i = 1; i <= trunkSegments; i++) {
    const t = i / trunkSegments;
    const x = trunkStart.x + t * trunkLength;
    const y = Math.sin(t * Math.PI * 1.2) * 0.25;
    // Every other interior node is a "crisis" point.
    const isCrisis = i < trunkSegments && i % 2 === 1;
    const node = makeNode(
      new THREE.Vector3(x, y, 0),
      isCrisis ? "crisis" : "stable",
      0,
    );
    makeEdge(prev, node, 0.18, 1.0);
    prev = node;

    if (isCrisis && rand() < branchProbability) {
      spawnBranches(node, 1, maxDepth, rand);
    }
  }

  function spawnBranches(parent: TimelineNode, depth: number, max: number, r: () => number) {
    if (depth > max) return;
    const count = 1 + Math.floor(r() * 2.2); // 1-3 branches
    for (let i = 0; i < count; i++) {
      const ang = (r() - 0.5) * Math.PI * 0.9; // spread vertically
      const len = 1.4 + r() * 2.2 - depth * 0.35;
      if (len <= 0.4) continue;
      const dir = new THREE.Vector3(Math.cos(ang) * 0.4 + 0.4, Math.sin(ang), (r() - 0.5) * 0.3)
        .normalize()
        .multiplyScalar(len);
      const pos = parent.position.clone().add(dir);
      // Branches that descend from a crisis stay crisis-colored until they "stabilize"
      // at the tip; this gives the red-blob look at the branching origin.
      const isCrisis = depth === 1 ? true : r() < 0.35;
      const child = makeNode(pos, isCrisis ? "crisis" : "stable", depth);
      makeEdge(parent, child, 0.35, Math.max(0.15, 0.8 - depth * 0.22));
      if (r() < 0.6) spawnBranches(child, depth + 1, max, r);
    }
  }

  return { nodes, edges };
}

// Sample a cubic bezier at parameter t in [0,1].
export function sampleBezier(
  c: TimelineEdge["controls"],
  t: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const it = 1 - t;
  const b0 = it * it * it;
  const b1 = 3 * it * it * t;
  const b2 = 3 * it * t * t;
  const b3 = t * t * t;
  out.set(
    c[0].x * b0 + c[1].x * b1 + c[2].x * b2 + c[3].x * b3,
    c[0].y * b0 + c[1].y * b1 + c[2].y * b2 + c[3].y * b3,
    c[0].z * b0 + c[1].z * b1 + c[2].z * b2 + c[3].z * b3,
  );
  return out;
}
