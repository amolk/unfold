import { useCallback, useEffect, useMemo, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ParticleField } from "./ParticleField";
import { Nodes } from "./Nodes";
import { EdgePicker } from "./picking/edge-picker";
import { SceneProjection, normalizeData } from "./scene-projection";
import type { ResolvedStyle, ResolvedTheme } from "./defaults";
import type {
  NodeId,
  UnfoldData,
  UnfoldEdge,
  UnfoldLayout,
  UnfoldNode,
} from "../types";

// Hard cap for the shader's bulge loop and the height of the node-data
// textures (and per-node fade attribute, and per-edge fade texture). The
// shader / draw count clips to the live entry count, so GPU work scales
// with active entries — these caps just bound the steady-state allocation.
// 4096 fits any realistic tree without re-allocating; chosen to match
// MAX_VERTEX_TEXTURE_IMAGE_UNITS headroom across desktop GPUs.
const NODE_TEX_HEIGHT = 4096;
const EDGE_TEX_HEIGHT = 4096;

interface SceneProps {
  /** The graph to render. Phase 2: positions/controls supplied by the caller;
   *  auto-layout for missing positions lands in Phase 4. */
  data: UnfoldData;
  /** Fully-resolved theme/style (see defaults.ts). Unfold merges the public
   *  props over the defaults before handing them down. */
  theme: ResolvedTheme;
  style: ResolvedStyle;
  /** Layout strategy; "none" disables auto-layout for nodes missing position. */
  layout: UnfoldLayout;
  // --- Phase 7: resolved per-field state from Unfold's useControllableState. ---
  /** Currently focused node (camera target / bulge tint). `null` = no focus. */
  focusedNodeId: NodeId | null;
  /** Set of selected node ids — rendered with the highlight rim. */
  selectedNodeIds: readonly NodeId[];
  /** Set of expanded node ids — Phase 8 reads this for affordance rendering. */
  expandedNodeIds: readonly NodeId[];
  /** Dual-mode setter for focus. In controlled mode the parent fires
   *  onFocusChange via the same setter; in uncontrolled mode it also
   *  updates the parent's internal state. Scene calls this from node click. */
  onSetFocus: (next: NodeId | null) => void;
  /** Same shape, for selection. */
  onSetSelected: (next: readonly NodeId[]) => void;
  // --- Phase 6: pick events. Item-first arg order in the public callbacks
  // (the public UnfoldNode/Edge object first, then the PointerEvent). Scene
  // owns the index→public-object lookup so the picker components can stay
  // index-only. ---
  onNodeClick?: (node: UnfoldNode, event: PointerEvent) => void;
  onNodeHover?: (node: UnfoldNode | null, event: PointerEvent) => void;
  onEdgeClick?: (edge: UnfoldEdge, event: PointerEvent) => void;
  onEdgeHover?: (edge: UnfoldEdge | null, event: PointerEvent) => void;
}

export function Scene({
  data,
  theme,
  style,
  layout,
  focusedNodeId,
  selectedNodeIds,
  expandedNodeIds: _expandedNodeIds, // Phase-8 consumer
  onSetFocus,
  onSetSelected: _onSetSelected, // reserved for caller-driven selection in Phase 8+
  onNodeClick,
  onNodeHover,
  onEdgeClick,
  onEdgeHover,
}: SceneProps) {
  const stableColor = theme.stableColor;
  const crisisColor = theme.crisisColor;
  const fadeSpeed = style.fade.speed;
  // Normalize the public data into the projection's internal shape. Re-run when
  // the data identity or layout strategy changes; auto-layout fills positions
  // for any node missing one (unless layout="none"), and each edge's flow is
  // resolved to concrete colors (falling back to the theme's default edge color).
  const normalized = useMemo(
    () => normalizeData(data, layout, theme.defaultEdgeColor),
    [data, layout, theme.defaultEdgeColor],
  );

  // Index the original (public) nodes and edges by id so the picker callbacks
  // can echo the caller's exact UnfoldNode / UnfoldEdge objects back. The
  // projection's index→string-id maps + these two maps complete the round trip
  // pickEvent → timeline-index → string-id → public object.
  const nodeById = useMemo(() => {
    const m = new Map<string, UnfoldNode>();
    for (const n of data.nodes) m.set(n.id, n);
    return m;
  }, [data]);
  const edgeById = useMemo(() => {
    const m = new Map<string, UnfoldEdge>();
    for (const e of data.edges) m.set(e.id, e);
    return m;
  }, [data]);

  // Resolved focus comes straight from Unfold's controllable state. `null` =
  // no node is focused (no bulge tint, no emphasis, camera doesn't track).
  // The empty string is used downstream when no focus is set, because the
  // projection/shader pipeline keys on string-id comparisons; "" never
  // matches a real id.
  const focusId = focusedNodeId ?? "";

  const projection = useMemo(
    () => new SceneProjection(NODE_TEX_HEIGHT, EDGE_TEX_HEIGHT),
    [],
  );

  const stableColor3 = useMemo(() => new THREE.Color(), []);
  const crisisColor3 = useMemo(() => new THREE.Color(), []);
  useEffect(() => {
    stableColor3.set(stableColor);
    crisisColor3.set(crisisColor);
  }, [stableColor3, crisisColor3, stableColor, crisisColor]);

  // Bumped when sync reports a topology change, so the projection's `built`
  // bundle is rebuilt. NOT bumped on every fade tick — those write through to
  // GPU mirrors that stay bound across frames.
  const [activeKey, setActiveKey] = useState(0);

  // Sync the projection's active set against the normalized scene, then bump
  // activeKey so `built` rebuilds. We bump on every normalized-identity change
  // (not only when sync reports topology change) because data-only updates —
  // new bezier `controls` after a layout toggle, new edge `colors` after a
  // flow-preset change, repositioned nodes — must propagate through build() to
  // the Timeline (and from there to ParticleField's curve / edge-color
  // textures + geometry). The cost is a rebuild on each `data` prop swap; on a
  // demo-sized tree that's microseconds. The projection prunes finished-fade
  // entries inside sync() — see SceneProjection.sync.
  useEffect(() => {
    projection.sync(normalized);
    setActiveKey((k) => k + 1);
  }, [normalized, projection]);

  const built = useMemo(
    () => projection.build(focusId),
    [projection, activeKey, focusId],
  );

  // Per-instance "is selected?" flag array, parallel to built.timeline.nodes.
  // Recomputed when either the active set or the selection identity changes.
  // Membership is checked via a Set so a moderately large selectedNodeIds
  // stays O(n) overall.
  const selectedFlags = useMemo(() => {
    const sel = new Set(selectedNodeIds);
    return built.nodeIds.map((id) => sel.has(id));
  }, [built, selectedNodeIds]);

  // Free every GPU resource the projection owns when Scene unmounts.
  useEffect(() => () => projection.dispose(), [projection]);

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * fadeSpeed);
    projection.tickFades(k);
    projection.writeBulgeData(focusId, stableColor3, crisisColor3);
  });

  // Wire internal index-based callbacks into the public (item, event)
  // signatures. The translation index → built.nodeIds[i] → nodeById is the
  // exact round trip described above. Wrapped in useCallback so Nodes /
  // EdgePicker don't see a new function on every render and re-bind handlers.
  const wiredNodeClick = useCallback(
    (idx: number, event: PointerEvent) => {
      const id = built.nodeIds[idx];
      if (id == null) return;
      // Library default: clicking a node moves focus to it. In uncontrolled
      // mode this updates the internal focus state; in controlled mode it
      // just fires onFocusChange so the caller can choose to honor it. This
      // is the explicit "uncontrolled-mode auto-focus on click" behavior
      // the design doc describes, and matches the prototype's "click = look
      // at this node" UX.
      onSetFocus(id);
      const node = nodeById.get(id);
      if (node && onNodeClick) onNodeClick(node, event);
    },
    [built, nodeById, onSetFocus, onNodeClick],
  );
  const wiredNodeHover = useCallback(
    (idx: number | null, event: PointerEvent) => {
      if (!onNodeHover) return;
      if (idx == null) {
        onNodeHover(null, event);
        return;
      }
      const id = built.nodeIds[idx];
      const node = id != null ? nodeById.get(id) : undefined;
      if (node) onNodeHover(node, event);
    },
    [onNodeHover, built, nodeById],
  );
  const wiredEdgeClick = useCallback(
    (idx: number, event: PointerEvent) => {
      if (!onEdgeClick) return;
      const id = built.edgeIds[idx];
      const edge = id != null ? edgeById.get(id) : undefined;
      if (edge) onEdgeClick(edge, event);
    },
    [onEdgeClick, built, edgeById],
  );
  const wiredEdgeHover = useCallback(
    (idx: number | null, event: PointerEvent) => {
      if (!onEdgeHover) return;
      if (idx == null) {
        onEdgeHover(null, event);
        return;
      }
      const id = built.edgeIds[idx];
      const edge = id != null ? edgeById.get(id) : undefined;
      if (edge) onEdgeHover(edge, event);
    },
    [onEdgeHover, built, edgeById],
  );

  return (
    <>
      <ParticleField
        timeline={built.timeline}
        edgeFadeTexture={projection.edgeFade.texture}
        nodeBulge={projection.nodeBulge}
        stableColor={stableColor}
        crisisColor={crisisColor}
        particlesPerEdge={style.edge.density}
        streamsPerEdge={style.edge.streams}
        wispAmplitude={style.edge.wispAmplitude}
        wispMorphSpeed={style.edge.wispMorphSpeed}
        wispStretch={style.edge.wispStretch}
        threadDetail={style.edge.threadDetail}
        streakLength={style.edge.streakLength}
        speed={style.edge.speed}
        shimmer={style.edge.shimmer}
        glintRatio={style.edge.glintRatio}
        glintIntensity={style.edge.glintIntensity}
      />
      <Nodes
        timeline={built.timeline}
        focusedIndex={built.focusIndex}
        selectedFlags={selectedFlags}
        fadeAttribute={projection.nodeFade.attribute}
        sphereOpacity={style.node.opacity}
        stableColor={stableColor}
        crisisColor={crisisColor}
        highlightColor={theme.highlight}
        nodeRadius={style.node.baseRadius}
        rimStrength={style.node.rimStrength}
        // Click is always wired now — even without a caller-supplied
        // onNodeClick the library auto-focuses on node-click in
        // uncontrolled mode. Hover is gated on the public hover callback.
        onNodeClick={wiredNodeClick}
        onNodeHover={onNodeHover ? wiredNodeHover : undefined}
      />
      <EdgePicker
        timeline={built.timeline}
        onEdgeClick={onEdgeClick ? wiredEdgeClick : undefined}
        onEdgeHover={onEdgeHover ? wiredEdgeHover : undefined}
      />
      <OrbitControls
        enablePan
        enableRotate
        enableZoom
        zoomToCursor
        zoomSpeed={0.8}
        rotateSpeed={0.7}
        panSpeed={0.8}
        minDistance={2}
        maxDistance={60}
        // Tilt the lookat above the world origin so the root (at 0,0,0) lands
        // ~20% from the bottom of the viewport on first paint, leaving room
        // above it for branches to grow into. Camera position is unchanged
        // (Unfold sets it to (9, 1.2, 0)); only the target moves.
        target={[0, 1.8, 0]}
        makeDefault
      />
    </>
  );
}
