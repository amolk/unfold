import * as THREE from "three";
import type {
  ExplorerEdge,
  ExplorerNode,
  VisibleScene,
} from "../explorer/state";
import { STUB_FROM_ID } from "../explorer/state";
import type { Timeline, TimelineEdge, TimelineNode } from "../timeline/generate";
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
 *  entry is added or removed (or the focused id changes); stable across the
 *  per-frame fade ticks that mutate `nodeFadeAttribute` / `edgeFadeTexture`
 *  in place. */
export interface SceneProjectionBuilt {
  timeline: Timeline;
  /** Maps the integer indices used in `timeline` back to the ExplorerNode ids
   *  the click handler dispatches against. */
  nodeIds: string[];
  focusIndex: number;
  nodeFadeAttribute: THREE.InstancedBufferAttribute;
  edgeFadeTexture: THREE.DataTexture;
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
 *  / writeBulgeData / releasePreviousBuild / dispose from effects + useFrame.
 *  See Scene.tsx for the wiring. */
export class SceneProjection {
  private nodes = new Map<string, NodeEntry>();
  private edges = new Map<string, EdgeEntry>();

  // Current = mirrors bound to the shader right now (written through by
  // tickFades). Previous = the build before that, kept alive until the
  // children have re-bound to the new mirrors; releasePreviousBuild() (called
  // from a Scene useEffect AFTER children rebind) frees their GPU buffers.
  // We must NOT dispose during build() — build runs inside React's render
  // phase, but child rebind effects run post-commit, so disposing in-line
  // would free a texture still bound to the live material for one frame.
  private currentBuiltNodeFade: MirroredAttribute | null = null;
  private currentBuiltEdgeFade: MirroredTexture | null = null;
  private previousBuiltNodeFade: MirroredAttribute | null = null;
  private previousBuiltEdgeFade: MirroredTexture | null = null;

  readonly nodeBulge: NodeBulgeData;

  constructor(nodeTexHeight: number) {
    this.nodeBulge = {
      posFade: createMirroredTexture(nodeTexHeight),
      colorEmph: createMirroredTexture(nodeTexHeight),
      count: { value: 0 },
      texHeight: nodeTexHeight,
    };
  }

  /** Drop all entries. Used on seed/mode change in Scene. The bulge mirrors
   *  stay (one-shot allocation; reused across rebuilds). Per-build mirrors
   *  are scheduled for release via releasePreviousBuild() so callers don't
   *  free GL buffers that are still bound to the live material. */
  reset() {
    this.nodes.clear();
    this.edges.clear();
    // Demote the current build to "previous"; Scene's release effect will
    // dispose it after the next render cycle (or this very next build()).
    if (this.currentBuiltNodeFade || this.currentBuiltEdgeFade) {
      this.previousBuiltNodeFade?.dispose();
      this.previousBuiltEdgeFade?.dispose();
      this.previousBuiltNodeFade = this.currentBuiltNodeFade;
      this.previousBuiltEdgeFade = this.currentBuiltEdgeFade;
      this.currentBuiltNodeFade = null;
      this.currentBuiltEdgeFade = null;
    }
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
    for (const n of visible.pathNodes) visNodeIds.add(n.id);
    for (const n of visible.candidateNodes) visNodeIds.add(n.id);
    const visEdgeIds = new Set<string>();
    for (const e of visible.pathEdges) visEdgeIds.add(e.id);
    for (const e of visible.candidateEdges) visEdgeIds.add(e.id);

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

    const upsertNode = (n: ExplorerNode) => {
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
    };
    visible.pathNodes.forEach(upsertNode);
    visible.candidateNodes.forEach(upsertNode);
    for (const entry of this.nodes.values()) {
      if (!visNodeIds.has(entry.node.id)) entry.target = 0;
    }

    const upsertEdge = (e: ExplorerEdge) => {
      const existing = this.edges.get(e.id);
      if (existing) {
        existing.target = 1;
        existing.edge = e;
      } else {
        this.edges.set(e.id, { edge: e, target: 1, fade: 0, index: -1 });
        topologyChanged = true;
      }
    };
    visible.pathEdges.forEach(upsertEdge);
    visible.candidateEdges.forEach(upsertEdge);
    for (const entry of this.edges.values()) {
      if (!visEdgeIds.has(entry.edge.id)) entry.target = 0;
    }

    return topologyChanged;
  }

  /** Build the renderable bundle from the current active entries. Pure
   *  except for assigning `.index` back onto entries so tickFades knows where
   *  to write each fade value, and demoting the previous build's mirrors to
   *  `previousBuilt*` for later disposal (safe — see field comment). */
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

    const nodeMirror = createMirroredAttribute(nodeEntries.length, 1);
    nodeEntries.forEach((e, i) => {
      nodeMirror.data[i] = e.fade;
    });
    nodeMirror.markDirty();

    // Edge fade texture: 1×N RGBA float.
    //   R = current per-edge fade (mutated each frame).
    //   G = entry-ramp flag (1 = particle alpha ramps in along the curve from
    //       life=0 → life≈0.6, used by the root's incoming stub so its
    //       upstream end dissolves into the background).
    const edgeMirror = createMirroredTexture(edgeEntries.length);
    edgeEntries.forEach((e, i) => {
      edgeMirror.data[i * 4] = e.fade;
      edgeMirror.data[i * 4 + 1] = e.edge.fromId === STUB_FROM_ID ? 1 : 0;
      edgeMirror.data[i * 4 + 3] = 1;
    });
    edgeMirror.markDirty();

    const nodeIds = nodeEntries.map((e) => e.node.id);
    const focusIndex = nodeIndex.get(focusId) ?? 0;

    const built: SceneProjectionBuilt = {
      timeline: { nodes: tlNodes, edges: tlEdges },
      nodeIds,
      focusIndex,
      nodeFadeAttribute: nodeMirror.attribute,
      edgeFadeTexture: edgeMirror.texture,
    };
    // Demote current → previous. Defer disposal of `previous` to a Scene
    // useEffect that fires after the children's rebind effects (parent
    // effects run after child effects on a single commit). If a third
    // build() arrives before that effect runs, we drop the oldest now —
    // that one's safe because the children never bound to it.
    this.previousBuiltNodeFade?.dispose();
    this.previousBuiltEdgeFade?.dispose();
    this.previousBuiltNodeFade = this.currentBuiltNodeFade;
    this.previousBuiltEdgeFade = this.currentBuiltEdgeFade;
    this.currentBuiltNodeFade = nodeMirror;
    this.currentBuiltEdgeFade = edgeMirror;
    return built;
  }

  /** Free the previous build's GPU buffers, called from a Scene useEffect
   *  keyed on `built` so it runs AFTER ParticleField/Nodes have rebound
   *  their uniforms/attributes to the new mirrors. Doing this safely is the
   *  whole reason build() doesn't dispose in-line. */
  releasePreviousBuild() {
    this.previousBuiltNodeFade?.dispose();
    this.previousBuiltEdgeFade?.dispose();
    this.previousBuiltNodeFade = null;
    this.previousBuiltEdgeFade = null;
  }

  /** Advance fade toward each entry's target, writing the new value through
   *  to the GPU mirrors built in the last `build()` call. `k` is the per-tick
   *  lerp factor (`1 - exp(-dt * fadeSpeed)`). */
  tickFades(k: number) {
    const nodeMirror = this.currentBuiltNodeFade;
    const edgeMirror = this.currentBuiltEdgeFade;

    this.nodes.forEach((entry) => {
      entry.fade += (entry.target - entry.fade) * k;
      if (nodeMirror && entry.index >= 0 && entry.index < nodeMirror.data.length) {
        nodeMirror.data[entry.index] = entry.fade;
      }
    });
    nodeMirror?.markDirty();

    this.edges.forEach((entry) => {
      entry.fade += (entry.target - entry.fade) * k;
      if (edgeMirror && entry.index >= 0 && entry.index * 4 < edgeMirror.data.length) {
        edgeMirror.data[entry.index * 4] = entry.fade;
      }
    });
    edgeMirror?.markDirty();
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

  /** Release every GPU resource owned by the projection — nodeBulge mirrors
   *  + the current and previous build's mirrors. Called from Scene's
   *  unmount-cleanup effect. */
  dispose() {
    this.nodeBulge.posFade.dispose();
    this.nodeBulge.colorEmph.dispose();
    this.currentBuiltNodeFade?.dispose();
    this.currentBuiltEdgeFade?.dispose();
    this.previousBuiltNodeFade?.dispose();
    this.previousBuiltEdgeFade?.dispose();
    this.currentBuiltNodeFade = null;
    this.currentBuiltEdgeFade = null;
    this.previousBuiltNodeFade = null;
    this.previousBuiltEdgeFade = null;
  }
}
