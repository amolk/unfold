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
    onNodeClick,
    onNodeHover,
    onEdgeClick,
    onEdgeHover,
    onBackgroundClick,
    onNodeExpand,
    onFocusChange,
    onSelectionChange,
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
  const [resolvedExpanded] = useControllableState<readonly NodeId[]>({
    value: expandedNodeIds,
    defaultValue: EMPTY_IDS,
    // No onExpandedChange yet — Phase 8 wires expand-affordance UI.
  });

  return (
    <Canvas
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
      camera={{ position: [9, 1.2, 0], fov: 38, near: 0.1, far: 200 }}
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
      onPointerMissed={
        onBackgroundClick
          ? (e) => onBackgroundClick(e as PointerEvent)
          : undefined
      }
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
        expandedNodeIds={resolvedExpanded}
        onSetFocus={setFocus}
        onSetSelected={setSelected}
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
        onEdgeClick={onEdgeClick}
        onEdgeHover={onEdgeHover}
        onNodeExpand={onNodeExpand}
      />
      <BloomFx />
    </Canvas>
  );
});
