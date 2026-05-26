import * as THREE from "three";
import type { NodeKind } from "../timeline/types";

export type { NodeKind };

export interface ExplorerNode {
  id: string;
  position: THREE.Vector3;
  kind: NodeKind;
  parentId: string | null;
  childIds: string[] | null; // null until children are generated
  depth: number;
}

export interface ExplorerEdge {
  id: string;
  fromId: string;
  toId: string;
  controls: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  fromKind: NodeKind;
  toKind: NodeKind;
}

/** How the visible subset of the tree is chosen.
 *  - "single-path": only the root→focus chain and focus's direct children.
 *    Clicking a node moves focus, collapsing siblings that aren't on the new
 *    path. (Original behavior.)
 *  - "toggle":      every node whose ancestors are all in `expanded` is
 *    visible. Clicking a node toggles its own `expanded` membership —
 *    explored branches stay around until clicked again to hide.
 *  - "full-tree":   the whole pre-generated tree is visible at once; clicks
 *    only update focus for the camera. */
export type ExplorerMode = "single-path" | "toggle" | "full-tree";

export interface ExplorerState {
  nodes: Map<string, ExplorerNode>;
  edges: Map<string, ExplorerEdge>;
  rootId: string;
  focusId: string;
  rootSeed: number;
  mode: ExplorerMode;
  /** Used in "toggle" mode: ids of nodes whose children are revealed. A node
   *  is visible iff every ancestor (root excluded — it's always visible) is
   *  in this set. Empty in other modes. */
  expanded: Set<string>;
}

// --- deterministic PRNG ---------------------------------------------------

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

// FNV-1a 32-bit; combined with the root seed so different seeds give different
// children for the same path.
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function nodeRng(node: ExplorerNode, rootSeed: number): () => number {
  return mulberry32(hashString(node.id) ^ (rootSeed * 0x9e3779b1));
}

// --- creation / mutation -------------------------------------------------

export interface CreateOptions {
  seed?: number;
  mode?: ExplorerMode;
  /** Max depth for "full-tree" mode pre-generation. Ignored in other modes. */
  fullTreeDepth?: number;
}

/** Sentinel id for the synthetic upstream end of the root's stub edge. No
 *  ExplorerNode exists with this id — the stub edge only contributes a Bezier
 *  curve for particles to flow along, so the root has visible incoming flow
 *  before it's expanded. */
export const STUB_FROM_ID = "__stub__";

export function createExplorer({
  seed = 7,
  mode = "single-path",
  fullTreeDepth = 4,
}: CreateOptions = {}): ExplorerState {
  const root: ExplorerNode = {
    id: "0",
    position: new THREE.Vector3(0, 0, 0),
    kind: "stable",
    parentId: null,
    childIds: null,
    depth: 0,
  };
  // Stub edge flowing into the root from below. Without it the initial scene
  // has no edges, so no particles render and the (invisible) root sphere has
  // no bulge to mark its position.
  const stubEdge: ExplorerEdge = {
    id: `${STUB_FROM_ID}->${root.id}`,
    fromId: STUB_FROM_ID,
    toId: root.id,
    controls: [
      new THREE.Vector3(0.0, -1.5, 0),
      new THREE.Vector3(0.08, -1.0, 0.03),
      new THREE.Vector3(0.03, -0.45, -0.03),
      root.position.clone(),
    ],
    fromKind: "stable",
    toKind: root.kind,
  };
  const state: ExplorerState = {
    nodes: new Map([[root.id, root]]),
    edges: new Map([[stubEdge.id, stubEdge]]),
    rootId: root.id,
    focusId: root.id,
    rootSeed: seed,
    mode,
    expanded: new Set(),
  };
  if (mode === "full-tree") {
    // Pre-generate the whole tree to a fixed depth so the user sees the full
    // shape from the first frame. (Lazy generation here would force a click.)
    expandSubtree(state, root.id, fullTreeDepth);
  }
  // Don't auto-expand the root in single-path or toggle mode — start with
  // just the root + its incoming stream. The user expands it by clicking.
  return state;
}

/** Recursively generate children down to (and including) `depth` levels below
 *  `nodeId`. Used to materialize the whole tree for full-tree mode. */
function expandSubtree(state: ExplorerState, nodeId: string, depth: number) {
  if (depth <= 0) return;
  ensureChildren(state, nodeId);
  const node = state.nodes.get(nodeId);
  if (!node?.childIds) return;
  for (const cid of node.childIds) expandSubtree(state, cid, depth - 1);
}

/** Focus a node. Generates its children lazily on first focus. Returns a new
 *  state object (shallow — internal maps are shared/mutated, but components
 *  observe identity via the wrapper). */
export function withFocus(state: ExplorerState, nodeId: string): ExplorerState {
  if (!state.nodes.has(nodeId)) return state;
  const node = state.nodes.get(nodeId)!;
  const wasUnexpanded = node.childIds === null;
  ensureChildren(state, nodeId);
  if (nodeId === state.focusId) {
    // Clicking the focus: re-render only if we just expanded it.
    return wasUnexpanded ? { ...state } : state;
  }
  return { ...state, focusId: nodeId };
}

/** Toggle "toggle" mode's expansion of a node. Adds to `expanded` if absent
 *  (generating children if needed) and removes otherwise. Also moves focus
 *  to the clicked node so the camera tracks the user's last interaction. */
export function toggleExpanded(state: ExplorerState, nodeId: string): ExplorerState {
  if (!state.nodes.has(nodeId)) return state;
  ensureChildren(state, nodeId);
  const expanded = new Set(state.expanded);
  if (expanded.has(nodeId)) expanded.delete(nodeId);
  else expanded.add(nodeId);
  return { ...state, expanded, focusId: nodeId };
}

function ensureChildren(state: ExplorerState, nodeId: string) {
  const node = state.nodes.get(nodeId);
  if (!node || node.childIds !== null) return;

  const rng = nodeRng(node, state.rootSeed);
  // 2-4 candidates per node.
  const count = 2 + Math.floor(rng() * 3);

  // Direction the parent "arrived from" — children fan forward from that.
  // For the root we fall back to +y so children fan upward, matching the
  // stub edge that arrives from below.
  const parent = node.parentId ? state.nodes.get(node.parentId) : null;
  const incoming =
    parent && node.position.distanceToSquared(parent.position) > 1e-6
      ? node.position.clone().sub(parent.position).normalize()
      : new THREE.Vector3(0, 1, 0);

  // Build an orthonormal frame around the incoming direction.
  const refUp =
    Math.abs(incoming.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const side = new THREE.Vector3().crossVectors(incoming, refUp).normalize();
  const up = new THREE.Vector3().crossVectors(side, incoming).normalize();

  const childIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const spread = ((i - (count - 1) / 2) / Math.max(1, count - 1)) * Math.PI * 0.55;
    const jitter = (rng() - 0.5) * 0.25;
    const yawAngle = spread + jitter;
    const pitchAngle = (rng() - 0.5) * 0.5;

    const dir = incoming.clone().applyAxisAngle(up, yawAngle).applyAxisAngle(side, pitchAngle);
    dir.normalize();

    const length = 2.2 + rng() * 1.3;
    const childPos = node.position.clone().add(dir.multiplyScalar(length));
    const childKind: NodeKind = rng() < 0.4 ? "crisis" : "stable";
    const childId = `${node.id}.${i}`;

    const child: ExplorerNode = {
      id: childId,
      position: childPos,
      kind: childKind,
      parentId: node.id,
      childIds: null,
      depth: node.depth + 1,
    };
    state.nodes.set(childId, child);

    const edge = makeBezierEdge(node, child, rng);
    state.edges.set(edge.id, edge);

    childIds.push(childId);
  }
  node.childIds = childIds;
}

function makeBezierEdge(
  a: ExplorerNode,
  b: ExplorerNode,
  rng: () => number,
): ExplorerEdge {
  const dir = b.position.clone().sub(a.position);
  const len = dir.length();
  const t1 = a.position.clone().addScaledVector(dir, 0.33);
  const t2 = a.position.clone().addScaledVector(dir, 0.66);

  const refUp = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const perp = new THREE.Vector3().crossVectors(dir, refUp).normalize();
  const wob = 0.18 * len;
  t1.addScaledVector(perp, (rng() - 0.5) * wob);
  t2.addScaledVector(perp, (rng() - 0.5) * wob);
  t1.z += (rng() - 0.5) * 0.3;
  t2.z += (rng() - 0.5) * 0.3;

  return {
    id: `${a.id}->${b.id}`,
    fromId: a.id,
    toId: b.id,
    controls: [a.position.clone(), t1, t2, b.position.clone()],
    fromKind: a.kind,
    toKind: b.kind,
  };
}

// --- queries -------------------------------------------------------------

export function getPath(state: ExplorerState): ExplorerNode[] {
  const path: ExplorerNode[] = [];
  let cur: ExplorerNode | undefined = state.nodes.get(state.focusId);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? state.nodes.get(cur.parentId) : undefined;
  }
  return path;
}

export function getCandidates(state: ExplorerState): ExplorerNode[] {
  const focus = state.nodes.get(state.focusId);
  if (!focus || !focus.childIds) return [];
  return focus.childIds.map((id) => state.nodes.get(id)!).filter(Boolean);
}

export interface VisibleScene {
  pathNodes: ExplorerNode[];        // root → focus
  candidateNodes: ExplorerNode[];   // focus's children
  pathEdges: ExplorerEdge[];        // edges along the path
  candidateEdges: ExplorerEdge[];   // focus → each candidate
  focusId: string;
}

export function getVisibleScene(state: ExplorerState): VisibleScene {
  // The pathNodes/candidateNodes/pathEdges/candidateEdges split is purely a
  // historical labeling — Scene treats both node buckets and both edge
  // buckets the same way. We keep the split so future code can re-introduce a
  // distinction; for toggle/full-tree modes we just dump everything into the
  // "path" buckets.
  const stub = state.edges.get(`${STUB_FROM_ID}->${state.rootId}`);

  if (state.mode === "single-path") {
    const pathNodes = getPath(state);
    const candidateNodes = getCandidates(state);
    const pathEdges: ExplorerEdge[] = [];
    if (stub) pathEdges.push(stub);
    for (let i = 1; i < pathNodes.length; i++) {
      const e = state.edges.get(`${pathNodes[i - 1].id}->${pathNodes[i].id}`);
      if (e) pathEdges.push(e);
    }
    const focus = state.nodes.get(state.focusId)!;
    const candidateEdges: ExplorerEdge[] = [];
    for (const cid of focus.childIds ?? []) {
      const e = state.edges.get(`${focus.id}->${cid}`);
      if (e) candidateEdges.push(e);
    }
    return { pathNodes, candidateNodes, pathEdges, candidateEdges, focusId: state.focusId };
  }

  // toggle + full-tree: walk the tree, including every node reachable via
  // the mode's inclusion rule, plus the edges between them. The root is
  // always visible; the question is just how far we descend at each node.
  const includeChildren = (node: ExplorerNode): boolean => {
    if (state.mode === "full-tree") return true;
    // toggle: descend only if the node has been expanded by the user.
    return state.expanded.has(node.id);
  };

  const nodes: ExplorerNode[] = [];
  const edges: ExplorerEdge[] = [];
  if (stub) edges.push(stub);

  const root = state.nodes.get(state.rootId);
  if (root) {
    const stack: ExplorerNode[] = [root];
    while (stack.length) {
      const n = stack.pop()!;
      nodes.push(n);
      if (!includeChildren(n) || !n.childIds) continue;
      for (const cid of n.childIds) {
        const child = state.nodes.get(cid);
        if (!child) continue;
        const edge = state.edges.get(`${n.id}->${cid}`);
        if (edge) edges.push(edge);
        stack.push(child);
      }
    }
  }

  return {
    pathNodes: nodes,
    candidateNodes: [],
    pathEdges: edges,
    candidateEdges: [],
    focusId: state.focusId,
  };
}
