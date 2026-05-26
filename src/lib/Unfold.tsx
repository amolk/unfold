import { forwardRef } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { KernelSize } from "postprocessing";
import { Scene } from "./internal/Scene";
import { DEFAULT_BLOOM } from "./internal/defaults";
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

/** Phase 2 tracer bullet: renders a static, caller-supplied graph through the
 *  extracted R3F scene. Events, controlled state, theming props, auto-layout,
 *  the EdgeFlow color path, 2D camera and the imperative handle all land in
 *  later phases — for now this draws the graph and lets the user orbit. */
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
        gl.setClearColor("#1a0810", 1);
      }}
    >
      <color attach="background" args={["#1a0810"]} />
      <fog attach="fog" args={["#1a0810", 10, 40]} />
      <Scene data={data} />
      <BloomFx />
    </Canvas>
  );
});
