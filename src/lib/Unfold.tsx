import { forwardRef, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { KernelSize } from "postprocessing";
import { Scene } from "./internal/Scene";
import { DEFAULT_BLOOM, resolveStyle, resolveTheme } from "./internal/defaults";
import type { UnfoldHandle, UnfoldProps } from "./types";

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
 *  (Phase 4), `onNode*` / `onEdge*` / `onBackgroundClick` (Phase 6). Every
 *  other prop on `UnfoldProps` is accepted for forward-compatible
 *  type-checking but is a no-op until the phase that lands its behavior:
 *    - `focusedNodeId`, `selectedNodeIds`,
 *      `expandedNodeIds`, `onFocusChange`,
 *      `onSelectionChange`        → Phase 7
 *    - `onNodeExpand` (+ expand affordance,
 *      animated data diff)        → Phase 8
 *    - `cameraMode`, `initialCamera` → Phase 9
 *    - `ref` (UnfoldHandle)       → Phase 10
 *  Setting any of those today is silently ignored. */
export const Unfold = forwardRef<UnfoldHandle, UnfoldProps>(function Unfold(
  {
    data,
    theme,
    style,
    layout = "layered",
    onNodeClick,
    onNodeHover,
    onEdgeClick,
    onEdgeHover,
    onBackgroundClick,
  },
  _ref,
) {
  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme]);
  const resolvedStyle = useMemo(() => resolveStyle(style), [style]);
  const bg = resolvedTheme.background;

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
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
        onEdgeClick={onEdgeClick}
        onEdgeHover={onEdgeHover}
      />
      <BloomFx />
    </Canvas>
  );
});
