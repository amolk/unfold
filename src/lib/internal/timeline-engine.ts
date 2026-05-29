import {
  SceneProjection,
  normalizeData,
  type NormalizedScene,
  type SceneProjectionBuilt,
  type NodeBulgeData,
} from "./scene-projection";
import type { MirroredAttribute, MirroredTexture } from "./gpu-mirror";
import type { ResolvedTheme } from "./defaults";
import type { UnfoldData, UnfoldLayout } from "../types";

// Steady-state allocation caps for the projection's one-shot GPU mirrors.
// Match Scene's previous NODE_TEX_HEIGHT / EDGE_TEX_HEIGHT — the shader / draw
// count clips to the live entry count, so these only bound allocation.
const DEFAULT_NODE_TEX_HEIGHT = 4096;
const DEFAULT_EDGE_TEX_HEIGHT = 4096;

/** Topology-clock input. Note the deliberate absence of `focusId`: focus is a
 *  per-frame concern (see `frame`) and must never reach the timeline build, or
 *  a focus change would mint a new Timeline and reset ParticleField's per-particle
 *  attributes. */
export interface TimelineEngineInput {
  data: UnfoldData;
  layout: UnfoldLayout;
  theme: ResolvedTheme;
}

/** The renderable bundle for one topology generation. `generation` bumps only
 *  on a rebuild (data/layout/theme change), never on a fade tick or focus
 *  change — so a consumer can key render-tree memos on it. */
export interface TimelineEngineSnapshot {
  generation: number;
  built: SceneProjectionBuilt;
}

/** Per-frame input. `focusId` lives here (and only here). */
export interface TimelineEngineFrame {
  focusId: string | null;
  dt: number;
  fadeSpeed: number;
}

/** Owns the data→GPU pipeline behind two clocks: `update` (topology, React-state
 *  driven) and `frame` (fade + bulge, useFrame driven). Composes the existing
 *  `normalizeData` + `SceneProjection` rather than rewriting them — this is an
 *  isolation/composition layer, deliberately free of React so it can be driven
 *  headlessly in tests (the GPU mirrors are plain Float32Arrays until uploaded).
 *
 *  Behavior mirrors the previous hand-wiring in Scene.tsx exactly: normalize is
 *  memoized on (data, layout, theme.defaultEdgeFlow, theme.categories,
 *  theme.defaultNodeColor); every normalized-identity change syncs + rebuilds
 *  (not only topology changes — data-only edits must reach the Timeline); the
 *  projection prunes finished-fade entries inside sync(). */
export class TimelineEngine {
  private readonly projection: SceneProjection;

  // normalizeData memo keys — identity-compared, matching Scene's useMemo deps.
  private prevData: UnfoldData | undefined;
  private prevLayout: UnfoldLayout | undefined;
  private prevEdgeFlow: ResolvedTheme["defaultEdgeFlow"] | undefined;
  private prevCategories: ResolvedTheme["categories"] | undefined;
  private prevNodeColor: string | undefined;
  private normalized: NormalizedScene | undefined;

  private generation = 0;
  private snapshot: TimelineEngineSnapshot | undefined;

  constructor(capacity?: { nodeTexHeight?: number; edgeTexHeight?: number }) {
    this.projection = new SceneProjection(
      capacity?.nodeTexHeight ?? DEFAULT_NODE_TEX_HEIGHT,
      capacity?.edgeTexHeight ?? DEFAULT_EDGE_TEX_HEIGHT,
    );
  }

  /** Per-node fade attribute — bind to Nodes' InstancedMesh. */
  get nodeFade(): MirroredAttribute {
    return this.projection.nodeFade;
  }
  /** Per-edge fade texture — ParticleField's edgeFadeTexture. */
  get edgeFade(): MirroredTexture {
    return this.projection.edgeFade;
  }
  /** Per-node bulge data the particle vertex shader reads. */
  get nodeBulge(): NodeBulgeData {
    return this.projection.nodeBulge;
  }

  /** TOPOLOGY CLOCK. Normalize → sync → rebuild whenever the inputs change
   *  identity (preserving Scene's "rebuild on every normalized change"
   *  semantics). Returns the cached snapshot when nothing changed. */
  update(input: TimelineEngineInput): TimelineEngineSnapshot {
    const { data, layout, theme } = input;
    const changed =
      this.snapshot === undefined ||
      data !== this.prevData ||
      layout !== this.prevLayout ||
      theme.defaultEdgeFlow !== this.prevEdgeFlow ||
      theme.categories !== this.prevCategories ||
      theme.defaultNodeColor !== this.prevNodeColor;

    if (changed) {
      this.prevData = data;
      this.prevLayout = layout;
      this.prevEdgeFlow = theme.defaultEdgeFlow;
      this.prevCategories = theme.categories;
      this.prevNodeColor = theme.defaultNodeColor;
      this.normalized = normalizeData(
        data,
        layout,
        theme.defaultEdgeFlow,
        theme.categories,
        theme.defaultNodeColor,
      );
      this.projection.sync(this.normalized);
      const built = this.projection.build();
      this.generation += 1;
      this.snapshot = { generation: this.generation, built };
    }
    // `changed` is true on first call, so snapshot is always defined here.
    return this.snapshot as TimelineEngineSnapshot;
  }

  /** FADE + BULGE CLOCK. Advance fades by dt and rewrite the bulge textures
   *  for `focusId`. `k = 1 - exp(-dt * fadeSpeed)` matches Scene's prior
   *  useFrame. Touches only mirror `.data` (+ markDirty). */
  frame({ focusId, dt, fadeSpeed }: TimelineEngineFrame): void {
    const k = 1 - Math.exp(-dt * fadeSpeed);
    this.projection.tickFades(k);
    this.projection.writeBulgeData(focusId ?? "");
  }

  /** Resolve a focus id to its index in the current build, or -1 (matching
   *  Scene's `focusIndex` semantics: -1 when focus is null/unknown so no node
   *  is emphasized). */
  focusIndex(focusId: string): number {
    if (!focusId || this.snapshot === undefined) return -1;
    return this.snapshot.built.nodeIds.indexOf(focusId);
  }

  /** Drop the active set (seed/mode change). Mirrors stay allocated. */
  reset(): void {
    this.projection.reset();
  }

  /** Release every GPU resource the projection owns. */
  dispose(): void {
    this.projection.dispose();
  }
}
