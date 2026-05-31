import { forwardRef, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { KernelSize } from "postprocessing";
import { Scene } from "./internal/Scene";
import { DEFAULT_BLOOM, resolveStyle, resolveTheme } from "./internal/defaults";
import { useControllableState } from "./internal/useControllableState";
import type { NodeId, UnfoldHandle, UnfoldProps } from "./types";

const EMPTY_IDS: readonly NodeId[] = [];

function BloomFx() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={DEFAULT_BLOOM.intensity}
        luminanceThreshold={DEFAULT_BLOOM.threshold}
        luminanceSmoothing={DEFAULT_BLOOM.smoothing}
        mipmapBlur
        kernelSize={KernelSize.LARGE}
      />
    </EffectComposer>
  );
}

/** Renders a graph through the extracted R3F scene.
 *
 *  Wired so far: `data` (Phase 2), `theme` + `style` (Phase 3), `layout`
 *  (Phase 4), `onNode*` / `onEdge*` / `onBackgroundClick` (Phase 6),
 *  `focusedNodeId` / `selectedNodeIds` / `expandedNodeIds` (Phase 7),
 *  `onNodeExpand` + expand affordance + animated fade-in on data-diff
 *  (Phase 8). Every other prop on `UnfoldProps` is accepted for
 *  forward-compatible type-checking but is a no-op until:
 *    - `cameraMode`, `initialCamera` → Phase 9
 *    - `ref` (UnfoldHandle)       → Phase 10
 *  Setting any of those today is silently ignored.
 *
 *  Controlled / uncontrolled per field: `focusedNodeId`,
 *  `expandedNodeIds`, `selectedNodeIds` are each dual-mode. If you pass a
 *  value (including `null` / `[]`) the component never mutates it
 *  internally; if you omit the prop, the component manages an internal
 *  state slot for that field. The corresponding `onFocusChange` /
 *  `onSelectionChange` callbacks fire on every update for observability
 *  regardless of mode. */
export const Unfold = forwardRef<UnfoldHandle, UnfoldProps>(function Unfold(
  {
    data,
    theme,
    style,
    layout = "layered",
    focusedNodeId,
    expandedNodeIds,
    selectedNodeIds,
    selectedEdgeIds,
    nodesSelectable = true,
    edgesSelectable = true,
    onNodeClick,
    onNodeHover,
    onEdgeClick,
    onEdgeHover,
    onBackgroundClick,
    onNodeExpand,
    onFocusChange,
    onSelectionChange,
    onEdgeSelectionChange,
    initialCamera,
    cameraMode = "3d",
  },
  _ref,
) {
  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme]);
  const resolvedStyle = useMemo(() => resolveStyle(style), [style]);
  const bg = resolvedTheme.background;

  // Dual-mode state hooks. Note: defaultValue is captured on first render
  // (the useControllableState contract), so a caller that goes uncontrolled
  // gets `null` / `[]` initially and is expected to wire onNode* events to
  // populate it if they want click-driven UI. The library does NOT
  // auto-set focus or selection internally; the explicit callbacks make
  // ownership flow obvious.
  const [resolvedFocus, setFocus] = useControllableState<NodeId | null>({
    value: focusedNodeId,
    defaultValue: null,
    onChange: onFocusChange,
  });
  const [resolvedSelected, setSelected] = useControllableState<readonly NodeId[]>({
    value: selectedNodeIds,
    defaultValue: EMPTY_IDS,
    onChange: onSelectionChange
      ? (next) => onSelectionChange([...next])
      : undefined,
  });
  const [resolvedSelectedEdges, setSelectedEdges] = useControllableState<readonly NodeId[]>({
    value: selectedEdgeIds,
    defaultValue: EMPTY_IDS,
    onChange: onEdgeSelectionChange
      ? (next) => onEdgeSelectionChange([...next])
      : undefined,
  });
  const [resolvedExpanded] = useControllableState<readonly NodeId[]>({
    value: expandedNodeIds,
    defaultValue: EMPTY_IDS,
    // No onExpandedChange yet — Phase 8 wires expand-affordance UI.
  });

  // 2D mode: orthographic projection (no foreshortening) + camera on +x
  // looking at origin. The `radial` and `hierarchical` layouts are designed
  // flat on the y/z plane, which is exactly what an orthographic +x camera
  // sees face-on. `layered` will look squashed in 2D — pick a layout that
  // matches your camera mode.
  const isOrtho = cameraMode === "2d";
  const defaultCameraPos: [number, number, number] = isOrtho
    ? [10, 0, 0]
    : [9, 1.2, 0];
  const defaultCameraTarget: [number, number, number] = isOrtho
    ? [0, 0, 0]
    : [0, 1.8, 0];

  return (
    <Canvas
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
      orthographic={isOrtho}
      camera={
        isOrtho
          ? {
              position: initialCamera?.position ?? defaultCameraPos,
              zoom: 45,
              near: 0.1,
              far: 200,
            }
          : {
              position: initialCamera?.position ?? defaultCameraPos,
              fov: 38,
              near: 0.1,
              far: 200,
            }
      }
      dpr={[1, 1.5]}
      onCreated={({ gl }) => {
        gl.setClearColor(bg, 1);
      }}
      // R3F fires onPointerMissed on a pointer-up that landed outside any
      // raycast-hit object — exactly the semantics we want for "background
      // click". MouseEvent is the documented arg; PointerEvent extends
      // MouseEvent at runtime, so the cast is safe and matches our public
      // signature (which committed to PointerEvent for consistency with the
      // node/edge events).
      //
      // Always wired now: a background click clears the whole selection (both
      // kinds). Focus is intentionally left alone so the camera doesn't jump on
      // a stray empty-space click. The guards keep an already-empty selection
      // from firing a redundant onSelectionChange. The caller's
      // onBackgroundClick still runs afterward if supplied.
      onPointerMissed={(e) => {
        if (resolvedSelected.length > 0) setSelected(EMPTY_IDS);
        if (resolvedSelectedEdges.length > 0) setSelectedEdges(EMPTY_IDS);
        onBackgroundClick?.(e as PointerEvent);
      }}
    >
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 10, 40]} />
      <Scene
        data={data}
        theme={resolvedTheme}
        style={resolvedStyle}
        layout={layout}
        focusedNodeId={resolvedFocus}
        selectedNodeIds={resolvedSelected}
        selectedEdgeIds={resolvedSelectedEdges}
        expandedNodeIds={resolvedExpanded}
        onSetFocus={setFocus}
        onSetSelectedNodes={setSelected}
        onSetSelectedEdges={setSelectedEdges}
        nodesSelectable={nodesSelectable}
        edgesSelectable={edgesSelectable}
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
        onEdgeClick={onEdgeClick}
        onEdgeHover={onEdgeHover}
        onNodeExpand={onNodeExpand}
        cameraTarget={initialCamera?.target ?? defaultCameraTarget}
        cameraMode={cameraMode}
      />
      <BloomFx />
    </Canvas>
  );
});
