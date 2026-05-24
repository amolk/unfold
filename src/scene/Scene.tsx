import { useMemo } from "react";
import { OrbitControls } from "@react-three/drei";
import { useControls, button } from "leva";
import { generateTimeline } from "../timeline/generate";
import { ParticleField } from "./ParticleField";
import { Nodes } from "./Nodes";

export function Scene() {
  const [{ seed, trunkLength, trunkSegments, branchProbability, maxDepth }, set] =
    useControls("Timeline", () => ({
      seed: { value: 7, min: 1, max: 9999, step: 1 },
      trunkLength: { value: 14, min: 4, max: 40, step: 1 },
      trunkSegments: { value: 6, min: 2, max: 16, step: 1 },
      branchProbability: { value: 0.75, min: 0, max: 1, step: 0.01 },
      maxDepth: { value: 3, min: 1, max: 6, step: 1 },
      regenerate: button(() => set({ seed: Math.floor(Math.random() * 9999) })),
    })) as any;

  const timeline = useMemo(
    () => generateTimeline({ seed, trunkLength, trunkSegments, branchProbability, maxDepth }),
    [seed, trunkLength, trunkSegments, branchProbability, maxDepth],
  );

  return (
    <>
      <ParticleField timeline={timeline} />
      <Nodes timeline={timeline} />
      <OrbitControls
        enablePan
        enableRotate
        enableZoom
        zoomSpeed={0.8}
        rotateSpeed={0.7}
        panSpeed={0.8}
        minDistance={2}
        maxDistance={60}
        makeDefault
      />
    </>
  );
}
