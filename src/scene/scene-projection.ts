import * as THREE from "three";
import type {
  ExplorerEdge,
  ExplorerNode,
  VisibleScene,
} from "../explorer/state";
import { STUB_FROM_ID } from "../explorer/state";
import type { Timeline, TimelineEdge, TimelineNode } from "../timeline/types";
import {
  createMirroredAttribute,
  createMirroredTexture,
  type MirroredAttribute,
  type MirroredTexture,
} from "./gpu-mirror";

// "Active" = currently visible OR mid-fade-out. Lingering target=0 entries
// stay in the set with fade decaying toward 0; they're pruned on the next
// sync (not in tickFades) so the geometry rebuild lands during a user-driven
// transition rather than as a surprise particle re-shuffle the moment a fade
// happens to finish.
interface NodeEntry {
  node: ExplorerNode;
  target: 0 | 1;
  fade: number;
  /** Position in the current Built's nodeFadeArray. -1 until first build. */
  index: number;
}
interface EdgeEntry {
  edge: ExplorerEdge;
  target: 0 | 1;
  fade: number;
  index: number;
}

/** Per-node data fed to the particle vertex shader so each node "bulges" the
 *  particle field around its world position. Allocated once at projection
 *  construction and reused across every build(); the typed-array payload
 *  inside the MirroredTextures is mutated each frame and uploaded via
 *  markDirty(). Contrast with the per-build node/edge fade mirrors in
 *  `SceneProjectionBuilt` below, which ARE re-allocated on each topology
 *  change because their size tracks the active entry count. */
export interface NodeBulgeData {
  /** xyz = world position, w = per-node fade. */
  posFade: MirroredTexture;
  /** rgb = color, w = focus emphasis (0 or 1). */
  colorEmph: MirroredTexture;
  /** Number of valid entries written this frame (capped at texHeight). */
  count: { value: number };
  /** Height of the data textures — used by the shader to convert i → uv.y. */
  texHeight: number;
}

/** The renderable bundle for a single active-set topology. Recreated when an
 *  entry is added or removed (or the focused id changes). Does NOT carry the
 *  fade mirrors — those are one-shot on the projection and consumed directly
 *  by the children via projection.nodeFade.attribute / projection.edgeFade.texture. */
export interface SceneProjectionBuilt {
  timeline: Timeline;
  /** Maps the integer indices used in `timeline` back to the ExplorerNode ids
   *  the click handler dispatches against. */
  nodeIds: string[];
  focusIndex: number;
}

/** Projects an ExplorerState's visible scene into the GPU-friendly Timeline
 *  + fade buffers + per-node bulge data that the particle/node shaders consume.
 *
 *  Responsibilities, separated from React lifecycle:
 *    1. Active set bookkeeping (sync + lingering-prune scheduling).
 *    2. Per-frame fade animation toward each entry's target, written through
 *       to the GPU mirror buffers.
 *    3. Per-frame writes of the node-bulge data texture from the current
 *       active entries.
 *    4. Building the renderable bundle on topology / focus change.
 *
 *  React surface: construct once, then call reset / sync / build / tickFades
 *  / writeBulgeData / dispose from effects + useFrame. See Scene.tsx for
 *  the wiring.
 *
 *  All GPU mirrors are one-shot: allocated in the constructor at fixed
 *  capacity (nodeTexHeight / edgeTexHeight) and reused across every build().
 *  Active entries occupy the first N rows; the shader reads only that range.
 *  This trades a bounded steady-state allocation for never having to dispose
 *  a still-bound texture during render. */
export class SceneProjection {
  private nodes = new Map<string, NodeEntry>();
  private edges = new Map<string, EdgeEntry>();

  readonly nodeBulge: NodeBulgeData;
  /** Per-node fade attribute, fixed capacity. Active entries occupy slots
   *  0..nodes.size-1; tickFades / build write the same buffer. Exposed as
   *  the bound attribute on Nodes' InstancedMesh. */
  readonly nodeFade: MirroredAttribute;
  /** Per-edge fade texture, fixed capacity. Same layout convention as
   *  nodeFade. RGBA = (fade, stub-entry-ramp flag, _, 1.0). */
  readonly edgeFade: MirroredTexture;
  readonly edgeTexHeight: number;

  constructor(nodeTexHeight: number, edgeTexHeight: number) {
    this.nodeBulge = {
      posFade: createMirroredTexture(nodeTexHeight),
      colorEmph: createMirroredTexture(nodeTexHeight),
      count: { value: 0 },
      texHeight: nodeTexHeight,
    };
    this.nodeFade = createMirroredAttribute(nodeTexHeight, 1);
    this.edgeFade = createMirroredTexture(edgeTexHeight);
    this.edgeTexHeight = edgeTexHeight;
  }

  /** Drop all entries. Used on seed/mode change in Scene. GPU mirrors are
   *  one-shot and stay allocated; they get repopulated on the next build(). */
  reset() {
    this.nodes.clear();
    this.edges.clear();
  }

  /** Sync the active set to match `visible`. Returns true iff the set of
   *  ids changed (entries added or pruned), signaling the caller to rebuild
   *  the Built bundle.
   *
   *  Pruning happens here — at user-interaction time — so the next Built
   *  rebuild lands inside a transition the user already expects motion in,
   *  instead of as a sudden re-shuffle the moment a fade-out happens to
   *  cross the visibility threshold. */
  sync(visible: VisibleScene): boolean {
    const visNodeIds = new Set<string>();
    for (const n of visible.nodes) visNodeIds.add(n.id);
    const visEdgeIds = new Set<string>();
    for (const e of visible.edges) visEdgeIds.add(e.id);

    let topologyChanged = false;

    for (const [id, entry] of this.nodes) {
      if (entry.target === 0 && entry.fade < 0.005) {
        this.nodes.delete(id);
        topologyChanged = true;
      }
    }
    for (const [id, entry] of this.edges) {
      if (entry.target === 0 && entry.fade < 0.005) {
        this.edges.delete(id);
        topologyChanged = true;
      }
    }

    for (const n of visible.nodes) {
      const existing = this.nodes.get(n.id);
      if (existing) {
        existing.target = 1;
        existing.node = n;
      } else {
        // Spheres pop in at full size — initial fade = 1 so the vertex
        // shader's `position * aInstanceScale * aInstanceFade` lands at full
        // radius on the first frame. Departure still works (target=0 ramps
        // fade 1→0 and the sphere shrinks out).
        this.nodes.set(n.id, { node: n, target: 1, fade: 1, index: -1 });
        topologyChanged = true;
      }
    }
    for (const entry of this.nodes.values()) {
      if (!visNodeIds.has(entry.node.id)) entry.target = 0;
    }

    for (const e of visible.edges) {
      const existing = this.edges.get(e.id);
      if (existing) {
        existing.target = 1;
        existing.edge = e;
      } else {
        this.edges.set(e.id, { edge: e, target: 1, fade: 0, index: -1 });
        topologyChanged = true;
      }
    }
    for (const entry of this.edges.values()) {
      if (!visEdgeIds.has(entry.edge.id)) entry.target = 0;
    }

    return topologyChanged;
  }

  /** Build the renderable bundle from the current active entries. Writes
   *  fade + per-edge G-channel flag into the one-shot mirrors (first N
   *  slots); the children's bindings to `nodeFade`/`edgeFade` are stable
   *  across builds, so there's no GPU resource to dispose. */
  build(focusId: string): SceneProjectionBuilt {
    const nodeEntries = Array.from(this.nodes.values());
    const edgeEntries = Array.from(this.edges.values());

    const nodeIndex = new Map<string, number>();
    const tlNodes: TimelineNode[] = nodeEntries.map((entry, i) => {
      entry.index = i;
      nodeIndex.set(entry.node.id, i);
      return {
        id: i,
        position: entry.node.position,
        kind: entry.node.kind,
        depth: entry.node.depth,
      };
    });

    const tlEdges: TimelineEdge[] = edgeEntries.map((entry, i) => {
      entry.index = i;
      const from = nodeIndex.get(entry.edge.fromId) ?? 0;
      const to = nodeIndex.get(entry.edge.toId) ?? 0;
      return {
        id: i,
        from,
        to,
        controls: entry.edge.controls,
        weight: 1.0,
        fromKind: entry.edge.fromKind,
        toKind: entry.edge.toKind,
      };
    });

    // Seed the one-shot fade buffers for the new entry layout. Slots beyond
    // nodeEntries.length / edgeEntries.length keep their stale values, but
    // the shader never samples them (it reads only the first N rows).
    nodeEntries.forEach((e, i) => {
      this.nodeFade.data[i] = e.fade;
    });
    this.nodeFade.markDirty();

    // Edge fade texture: 1×N RGBA float, first N rows in use.
    //   R = current per-edge fade (mutated each frame by tickFades).
    //   G = entry-ramp flag (1 = particle alpha ramps in along the curve from
    //       life=0 → life≈0.6, used by the root's incoming stub so its
    //       upstream end dissolves into the background).
    edgeEntries.forEach((e, i) => {
      const p4 = i * 4;
      this.edgeFade.data[p4 + 0] = e.fade;
      this.edgeFade.data[p4 + 1] = e.edge.fromId === STUB_FROM_ID ? 1 : 0;
      this.edgeFade.data[p4 + 3] = 1;
    });
    this.edgeFade.markDirty();

    const nodeIds = nodeEntries.map((e) => e.node.id);
    const focusIndex = nodeIndex.get(focusId) ?? 0;

    return {
      timeline: { nodes: tlNodes, edges: tlEdges },
      nodeIds,
      focusIndex,
    };
  }

  /** Advance fade toward each entry's target, writing the new value through
   *  to the GPU mirrors in the slot assigned by the last build(). `k` is the
   *  per-tick lerp factor (`1 - exp(-dt * fadeSpeed)`). */
  tickFades(k: number) {
    this.nodes.forEach((entry) => {
      entry.fade += (entry.target - entry.fade) * k;
      if (entry.index >= 0 && entry.index < this.nodeFade.data.length) {
        this.nodeFade.data[entry.index] = entry.fade;
      }
    });
    this.nodeFade.markDirty();

    this.edges.forEach((entry) => {
      entry.fade += (entry.target - entry.fade) * k;
      if (entry.index >= 0 && entry.index * 4 < this.edgeFade.data.length) {
        this.edgeFade.data[entry.index * 4] = entry.fade;
      }
    });
    this.edgeFade.markDirty();
  }

  /** Repopulate the node-bulge mirrored textures for the shader. Skips
   *  lingering dead entries (fade < 0.005) so they don't consume one of the
   *  texHeight slots. */
  writeBulgeData(focusId: string, stableColor: THREE.Color, crisisColor: THREE.Color) {
    const { posFade, colorEmph, count, texHeight } = this.nodeBulge;
    let bi = 0;
    for (const entry of this.nodes.values()) {
      if (bi >= texHeight) break;
      if (entry.fade < 0.005) continue;
      const p4 = bi * 4;
      const c = entry.node.kind === "crisis" ? crisisColor : stableColor;
      posFade.data[p4 + 0] = entry.node.position.x;
      posFade.data[p4 + 1] = entry.node.position.y;
      posFade.data[p4 + 2] = entry.node.position.z;
      posFade.data[p4 + 3] = entry.fade;
      colorEmph.data[p4 + 0] = c.r;
      colorEmph.data[p4 + 1] = c.g;
      colorEmph.data[p4 + 2] = c.b;
      colorEmph.data[p4 + 3] = entry.node.id === focusId ? 1 : 0;
      bi++;
    }
    count.value = bi;
    posFade.markDirty();
    colorEmph.markDirty();
  }

  /** Release every GPU resource owned by the projection. Called from
   *  Scene's unmount-cleanup effect. */
  dispose() {
    this.nodeBulge.posFade.dispose();
    this.nodeBulge.colorEmph.dispose();
    this.nodeFade.dispose();
    this.edgeFade.dispose();
  }
}
