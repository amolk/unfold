import type {
  NodeId,
  UnfoldData,
  UnfoldEdge,
  UnfoldNode,
  Vec3,
} from "../lib";
import * as THREE from "three";

// Demo-side explorer state machine, ported from the pre-extraction
// src/explorer/state.ts. The library is mode-agnostic; this file holds the
// "modes" that the original prototype shipped, expressed as transformations
// over the public UnfoldData. The library only consumes the produced
// UnfoldData and the demo-owned expandedNodeIds.
//
// Modes:
//   - "single-path": only the root → focus chain and focus's direct children.
//     Clicking a node moves focus, collapsing siblings off the new path.
//   - "toggle":      every node whose ancestor chain is all "expanded" is
//     visible. Clicking a node toggles its membership in `expanded`.
//   - "full-tree":   the whole pre-generated tree is visible. Clicks only
//     update focus for the camera.
//
// All three are now demo concerns. The library treats UnfoldData as a flat
// "the caller decided what's visible" payload and fires onNodeClick /
// onNodeExpand as user-intent signals. The demo's reducer turns those
// signals into new UnfoldData.

export type ExplorerMode = "single-path" | "toggle" | "full-tree";

// --- internal explorer graph (demo-private) -------------------------------

type Kind = "stable" | "crisis";

interface ExplorerNode {
  id: string;
  position: THREE.Vector3;
  kind: Kind;
  parentId: string | null;
  childIds: string[] | null; // null until ensureChildren() is called
  depth: number;
}

interface ExplorerEdge {
  id: string;
  fromId: string;
  toId: string;
  controls: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  fromKind: Kind;
  toKind: Kind;
}

const STUB_FROM_ID = "__stub__";

export interface ExplorerState {
  mode: ExplorerMode;
  rootId: string;
  focusId: string;
  rootSeed: number;
  nodes: Map<string, ExplorerNode>;
  edges: Map<string, ExplorerEdge>;
  /** "toggle" mode: ids of nodes whose children are revealed. */
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
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
const nodeRng = (n: ExplorerNode, seed: number) =>
  mulberry32(hashString(n.id) ^ (seed * 0x9e3779b1));

// --- construction ---------------------------------------------------------

export function createExplorer(opts: {
  seed?: number;
  mode?: ExplorerMode;
  /** Pre-generation depth for full-tree mode. */
  fullTreeDepth?: number;
} = {}): ExplorerState {
  const { seed = 9143, mode = "single-path", fullTreeDepth = 4 } = opts;
  const root: ExplorerNode = {
    id: "0",
    position: new THREE.Vector3(0, 0, 0),
    kind: "stable",
    parentId: null,
    childIds: null,
    depth: 0,
  };
  const stub: ExplorerEdge = {
    id: `${STUB_FROM_ID}->${root.id}`,
    fromId: STUB_FROM_ID,
    toId: root.id,
    controls: [
      new THREE.Vector3(0, -1.5, 0),
      new THREE.Vector3(0.08, -1.0, 0.03),
      new THREE.Vector3(0.03, -0.45, -0.03),
      root.position.clone(),
    ],
    fromKind: "stable",
    toKind: root.kind,
  };
  const state: ExplorerState = {
    mode,
    rootId: root.id,
    focusId: root.id,
    rootSeed: seed,
    nodes: new Map([[root.id, root]]),
    edges: new Map([[stub.id, stub]]),
    expanded: new Set(),
  };
  if (mode === "full-tree") {
    // Pre-generate the whole tree so the user sees the full shape on first
    // paint — that's the defining property of full-tree mode.
    expandSubtree(state, root.id, fullTreeDepth);
  }
  return state;
}

function expandSubtree(s: ExplorerState, id: string, depth: number) {
  if (depth <= 0) return;
  ensureChildren(s, id);
  const node = s.nodes.get(id);
  if (!node?.childIds) return;
  for (const cid of node.childIds) expandSubtree(s, cid, depth - 1);
}

function ensureChildren(state: ExplorerState, nodeId: string) {
  const node = state.nodes.get(nodeId);
  if (!node || node.childIds !== null) return;

  const rng = nodeRng(node, state.rootSeed);
  const count = 2 + Math.floor(rng() * 3); // 2-4
  const parent = node.parentId ? state.nodes.get(node.parentId) : null;
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

  const childIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const spread =
      ((i - (count - 1) / 2) / Math.max(1, count - 1)) * Math.PI * 0.55;
    const yawAngle = spread + (rng() - 0.5) * 0.25;
    const pitchAngle = (rng() - 0.5) * 0.5;
    const dir = incoming
      .clone()
      .applyAxisAngle(up, yawAngle)
      .applyAxisAngle(side, pitchAngle)
      .normalize();
    const length = 2.2 + rng() * 1.3;
    const childPos = node.position.clone().add(dir.multiplyScalar(length));
    const kind: Kind = rng() < 0.4 ? "crisis" : "stable";
    const childId = `${node.id}.${i}`;
    const child: ExplorerNode = {
      id: childId,
      position: childPos,
      kind,
      parentId: node.id,
      childIds: null,
      depth: node.depth + 1,
    };
    state.nodes.set(childId, child);
    state.edges.set(`${node.id}->${childId}`, makeBezierEdge(node, child, rng));
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
    id: `${a.id}->${b.id}`,
    fromId: a.id,
    toId: b.id,
    controls: [a.position.clone(), t1, t2, b.position.clone()],
    fromKind: a.kind,
    toKind: b.kind,
  };
}

// --- transitions (reducer-ish) -------------------------------------------

/** Move focus to `nodeId`. In "single-path" and "toggle" modes this also
 *  lazily generates the focused node's children if they haven't been yet,
 *  so the next visible scene includes the candidate fan. */
export function withFocus(state: ExplorerState, nodeId: NodeId): ExplorerState {
  if (!state.nodes.has(nodeId)) return state;
  const node = state.nodes.get(nodeId)!;
  const wasUnexpanded = node.childIds === null;
  ensureChildren(state, nodeId);
  if (nodeId === state.focusId) {
    return wasUnexpanded ? { ...state } : state;
  }
  return { ...state, focusId: nodeId };
}

/** Toggle a node's expanded membership (used in "toggle" mode). Also moves
 *  focus to the toggled node so the camera tracks the user's last action. */
export function toggleExpanded(
  state: ExplorerState,
  nodeId: NodeId,
): ExplorerState {
  if (!state.nodes.has(nodeId)) return state;
  ensureChildren(state, nodeId);
  const expanded = new Set(state.expanded);
  if (expanded.has(nodeId)) expanded.delete(nodeId);
  else expanded.add(nodeId);
  return { ...state, expanded, focusId: nodeId };
}

/** Mark a node "expanded" without toggling (used for the onNodeExpand
 *  affordance click). Generates children lazily. */
export function expandNode(
  state: ExplorerState,
  nodeId: NodeId,
): ExplorerState {
  if (!state.nodes.has(nodeId)) return state;
  ensureChildren(state, nodeId);
  if (state.expanded.has(nodeId)) return state;
  const expanded = new Set(state.expanded);
  expanded.add(nodeId);
  return { ...state, expanded };
}

// --- projection to UnfoldData --------------------------------------------

const tup = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];

interface ToUnfoldOptions {
  /** When set, every emitted edge gets this `flow` (so the demo's flowPreset
   *  selector can recolor the streams). */
  flow?: UnfoldEdge["flow"];
  /** Marks any node whose subtree hasn't been fully traversed (i.e. has
   *  children we won't render this frame) as `expandable: true`. */
  markExpandable?: boolean;
}

/** Convert the explorer state into a UnfoldData snapshot matching the
 *  mode's visibility rule. Includes the stub edge (source: "__stub__") that
 *  feeds particles into the root. */
export function toUnfoldData(
  state: ExplorerState,
  opts: ToUnfoldOptions = {},
): UnfoldData {
  const visibleNodes = new Map<string, ExplorerNode>();
  const visibleEdges: ExplorerEdge[] = [];

  const stub = state.edges.get(`${STUB_FROM_ID}->${state.rootId}`);
  if (stub) visibleEdges.push(stub);

  if (state.mode === "single-path") {
    // Walk root → focus, pushing each node and the edge into it.
    let cur: ExplorerNode | undefined = state.nodes.get(state.focusId);
    const path: ExplorerNode[] = [];
    while (cur) {
      path.unshift(cur);
      cur = cur.parentId ? state.nodes.get(cur.parentId) : undefined;
    }
    for (let i = 0; i < path.length; i++) {
      visibleNodes.set(path[i].id, path[i]);
      if (i > 0) {
        const e = state.edges.get(`${path[i - 1].id}->${path[i].id}`);
        if (e) visibleEdges.push(e);
      }
    }
    // Then the focus's direct children (the candidate fan).
    const focus = state.nodes.get(state.focusId);
    if (focus?.childIds) {
      for (const cid of focus.childIds) {
        const child = state.nodes.get(cid);
        if (!child) continue;
        visibleNodes.set(child.id, child);
        const e = state.edges.get(`${focus.id}->${cid}`);
        if (e) visibleEdges.push(e);
      }
    }
  } else {
    // toggle + full-tree: descend until the mode's inclusion rule says no.
    const includeChildren = (n: ExplorerNode): boolean =>
      state.mode === "full-tree" ? true : state.expanded.has(n.id);
    const root = state.nodes.get(state.rootId);
    if (root) {
      const stack: ExplorerNode[] = [root];
      while (stack.length) {
        const n = stack.pop()!;
        visibleNodes.set(n.id, n);
        if (!includeChildren(n) || !n.childIds) continue;
        for (const cid of n.childIds) {
          const child = state.nodes.get(cid);
          if (!child) continue;
          const edge = state.edges.get(`${n.id}->${cid}`);
          if (edge) visibleEdges.push(edge);
          stack.push(child);
        }
      }
    }
  }

  // For the affordance: a node is "expandable" iff it has children we're
  // NOT rendering this frame OR its children haven't been generated yet
  // (i.e. clicking the affordance would yield more content). In full-tree
  // mode no node is expandable — everything's already on screen.
  const isExpandable = (n: ExplorerNode): boolean => {
    if (!opts.markExpandable) return false;
    if (state.mode === "full-tree") return false;
    // If children haven't been generated, they're latent expandable content.
    if (n.childIds === null) return true;
    // Otherwise: expandable iff at least one child isn't currently visible.
    return n.childIds.some((cid) => !visibleNodes.has(cid));
  };

  const outNodes: UnfoldNode[] = [];
  for (const n of visibleNodes.values()) {
    outNodes.push({
      id: n.id,
      position: tup(n.position),
      category: n.kind,
      expandable: isExpandable(n),
    });
  }
  const outEdges: UnfoldEdge[] = visibleEdges.map((e) => ({
    id: e.id,
    source: e.fromId,
    target: e.toId,
    controls: [
      tup(e.controls[0]),
      tup(e.controls[1]),
      tup(e.controls[2]),
      tup(e.controls[3]),
    ],
    flow: opts.flow,
  }));
  return { nodes: outNodes, edges: outEdges };
}

/** The set of node ids that are currently expanded — the value the demo
 *  hands to <Unfold expandedNodeIds={...}>. In single-path mode every node
 *  on the focus path is implicitly expanded (its children are visible);
 *  in toggle mode it's exactly state.expanded; in full-tree mode everything
 *  is expanded. */
export function expandedIds(state: ExplorerState): NodeId[] {
  if (state.mode === "full-tree") return [...state.nodes.keys()];
  if (state.mode === "toggle") return [...state.expanded];
  // single-path: walk root → focus and mark each as expanded.
  const out: NodeId[] = [];
  let cur: ExplorerNode | undefined = state.nodes.get(state.focusId);
  while (cur) {
    out.push(cur.id);
    cur = cur.parentId ? state.nodes.get(cur.parentId) : undefined;
  }
  return out;
}
