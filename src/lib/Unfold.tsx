import { forwardRef } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { KernelSize } from "postprocessing";
import { Scene } from "./internal/Scene";
import { DEFAULT_BLOOM, DEFAULT_BACKGROUND } from "./internal/defaults";
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
 *  v0.1 (Phase 2 tracer bullet): only `data` is wired. Every other prop on
 *  `UnfoldProps` is accepted for forward-compatible type-checking but is a
 *  no-op until the phase that lands its behavior:
 *    - `theme`, `style`           → Phase 3
 *    - `layout`                   → Phase 4
 *    - `onNode*` / `onEdge*` /
 *      `onBackgroundClick`        → Phase 6
 *    - `focusedNodeId`, `selectedNodeIds`,
 *      `expandedNodeIds`, `onFocusChange`,
 *      `onSelectionChange`        → Phase 7
 *    - `onNodeExpand` (+ expand affordance,
 *      animated data diff)        → Phase 8
 *    - `cameraMode`, `initialCamera` → Phase 9
 *    - `ref` (UnfoldHandle)       → Phase 10
 *  Setting any of these today is silently ignored. */
export const Unfold = forwardRef<UnfoldHandle, UnfoldProps>(function Unfold(
  { data },
  _ref,
) {
  return (
    <Canvas
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
      camera={{ position: [9, 1.2, 0], fov: 38, near: 0.1, far: 200 }}
      dpr={[1, 1.5]}
      onCreated={({ gl }) => {
        gl.setClearColor(DEFAULT_BACKGROUND, 1);
      }}
    >
      <color attach="background" args={[DEFAULT_BACKGROUND]} />
      <fog attach="fog" args={[DEFAULT_BACKGROUND, 10, 40]} />
      <Scene data={data} />
      <BloomFx />
    </Canvas>
  );
});
