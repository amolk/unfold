import React from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { KernelSize } from "postprocessing";
import { Leva, useControls } from "leva";
import { Scene } from "./scene/Scene";

class Boundary extends React.Component<
  { children: React.ReactNode },
  { err: Error | null }
> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error("Render boundary caught:", err, info);
  }
  render() {
    if (this.state.err) {
      return (
        <pre
          style={{
            position: "fixed",
            inset: 16,
            color: "#ff8888",
            background: "#1a0a0a",
            padding: 16,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            fontFamily: "ui-monospace, monospace",
            fontSize: 12,
            zIndex: 9999,
          }}
        >
          {String(this.state.err.stack ?? this.state.err.message)}
        </pre>
      );
    }
    return this.props.children;
  }
}

function BloomFx() {
  const { intensity, threshold, smoothing } = useControls("Bloom", {
    intensity: { value: 0.05, min: 0, max: 4, step: 0.05 },
    threshold: { value: 0.13, min: 0, max: 1, step: 0.01 },
    smoothing: { value: 0.85, min: 0, max: 1, step: 0.01 },
  });
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={intensity}
        luminanceThreshold={threshold}
        luminanceSmoothing={smoothing}
        mipmapBlur
        kernelSize={KernelSize.LARGE}
      />
    </EffectComposer>
  );
}

export function App() {
  return (
    <Boundary>
      <Leva collapsed={false} oneLineLabels />
      <Canvas
        gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
        camera={{ position: [0, 1.2, 9], fov: 38, near: 0.1, far: 200 }}
        dpr={[1, 1.5]}
        onCreated={({ gl }) => {
          gl.setClearColor("#1a0810", 1);
        }}
      >
        <color attach="background" args={["#1a0810"]} />
        <fog attach="fog" args={["#1a0810", 10, 40]} />
        <Scene />
        <BloomFx />
      </Canvas>
    </Boundary>
  );
}
