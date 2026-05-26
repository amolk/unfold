import { useEffect, useMemo, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ParticleField } from "./ParticleField";
import { Nodes } from "./Nodes";
import { SceneProjection, normalizeData } from "./scene-projection";
import { DEFAULT_SCENE, DEFAULT_THEME } from "./defaults";
import type { UnfoldData } from "../types";

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
  stableColor?: string;
  crisisColor?: string;
  /** 0 = spheres invisible (still raycastable), 1 = full sun-surface look. */
  sphereOpacity?: number;
  cameraEase?: number;
  /** Per-second fade rate for node/edge enter/exit. */
  fadeSpeed?: number;
  nodeRadius?: number;
  rimStrength?: number;
}

export function Scene({
  data,
  stableColor = DEFAULT_THEME.stableColor,
  crisisColor = DEFAULT_THEME.crisisColor,
  sphereOpacity = DEFAULT_SCENE.sphereOpacity,
  fadeSpeed = DEFAULT_SCENE.fadeSpeed,
  nodeRadius = DEFAULT_SCENE.nodeRadius,
  rimStrength = DEFAULT_SCENE.rimStrength,
}: SceneProps) {
  // Normalize the public data into the projection's internal shape once per
  // data identity. Static for the tracer bullet; diffed in later phases.
  const normalized = useMemo(() => normalizeData(data), [data]);

  // Camera focus drives the per-node emphasis highlight and bulge tint. Until
  // controlled focus lands in Phase 7, the first node (the root) is focused —
  // matching the original full-tree default (focusId = root). For arbitrary
  // caller data the array's first node is NOT necessarily semantically the
  // root; Phase 7 must replace this whole fallback with the `focusedNodeId`
  // prop (default null/none) + an uncontrolled-mode internal state.
  // TODO(phase-7): replace with the `focusedNodeId` prop.
  const focusId = data.nodes[0]?.id ?? "";

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

  // Sync the projection's active set against the normalized scene. The
  // projection prunes finished-fade entries here too — see SceneProjection.sync.
  useEffect(() => {
    const changed = projection.sync(normalized);
    if (changed) setActiveKey((k) => k + 1);
  }, [normalized, projection]);

  const built = useMemo(
    () => projection.build(focusId),
    [projection, activeKey, focusId],
  );

  // Free every GPU resource the projection owns when Scene unmounts.
  useEffect(() => () => projection.dispose(), [projection]);

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * fadeSpeed);
    projection.tickFades(k);
    projection.writeBulgeData(focusId, stableColor3, crisisColor3);
  });

  return (
    <>
      <ParticleField
        timeline={built.timeline}
        edgeFadeTexture={projection.edgeFade.texture}
        nodeBulge={projection.nodeBulge}
        stableColor={stableColor}
        crisisColor={crisisColor}
      />
      <Nodes
        timeline={built.timeline}
        focusedIndex={built.focusIndex}
        fadeAttribute={projection.nodeFade.attribute}
        sphereOpacity={sphereOpacity}
        stableColor={stableColor}
        crisisColor={crisisColor}
        nodeRadius={nodeRadius}
        rimStrength={rimStrength}
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
