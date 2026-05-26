import { useCallback, useEffect, useMemo, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { useControls, button, levaStore } from "leva";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ParticleField } from "./ParticleField";
import { Nodes } from "./Nodes";
import { CameraFollow } from "./CameraFollow";
import { SceneProjection } from "./scene-projection";
import { useThemeColors } from "./theme";
import {
  createExplorer,
  withFocus,
  toggleExpanded,
  getVisibleScene,
  type ExplorerState,
  type ExplorerMode,
} from "../explorer/state";

// Hard cap for the shader's bulge loop and the height of the node-data
// textures (and per-node fade attribute, and per-edge fade texture). The
// shader / draw count clips to the live entry count, so GPU work scales
// with active entries — these caps just bound the steady-state allocation.
// 4096 fits any realistic tree without re-allocating; chosen to match
// MAX_VERTEX_TEXTURE_IMAGE_UNITS headroom across desktop GPUs.
const NODE_TEX_HEIGHT = 4096;
const EDGE_TEX_HEIGHT = 4096;

export function Scene() {
  const [
    { mode: modeStr, seed, cameraEase, fadeSpeed, sphereOpacity },
    set,
  ] = useControls("Explorer", () => ({
      mode: {
        value: "full-tree" as ExplorerMode,
        options: {
          "single path": "single-path",
          "toggle expand": "toggle",
          "full tree": "full-tree",
        },
        label: "mode",
      },
      seed: { value: 9143, min: 1, max: 9999, step: 1 },
      regenerate: button(() => set({ seed: Math.floor(Math.random() * 9999) })),
      "copy settings": button(() => {
        // Dump every current value across all folders to clipboard as JSON.
        // Paste it back into chat to have me apply the changes as new defaults.
        const data = levaStore.getData() as Record<string, any>;
        const flat: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(data)) {
          if (entry && "value" in entry && typeof entry.value !== "function") {
            flat[key] = entry.value;
          }
        }
        const json = JSON.stringify(flat, null, 2);
        navigator.clipboard?.writeText(json).catch(() => {});
        // Also log so the user has a fallback if clipboard write fails.
        // eslint-disable-next-line no-console
        console.log("[unfold settings]\n" + json);
      }),
      cameraEase: { value: 0.005, min: 0.005, max: 0.2, step: 0.005, label: "camera ease" },
      fadeSpeed: { value: 2.0, min: 0.3, max: 10, step: 0.1, label: "fade speed" },
      sphereOpacity: {
        value: 0.07,
        min: 0,
        max: 1,
        step: 0.01,
        label: "show spheres",
      },
    }));
  // leva's SelectInput inference widens the union to string at the
  // destructure; narrow back at the boundary so downstream code can use
  // the discriminated type directly.
  const mode = modeStr as ExplorerMode;

  // Single source of truth for stable/crisis colors across Nodes,
  // ParticleField, and the bulge tint. See theme.ts.
  const { stableColor, crisisColor } = useThemeColors();

  const [explorer, setExplorer] = useState<ExplorerState>(() => createExplorer({ seed, mode }));
  // CameraFollow fights OrbitControls panning by yanking the target back to
  // the focus. Until the user has actually selected something, leave the
  // camera entirely to them — first click arms the follower.
  const [followArmed, setFollowArmed] = useState(false);

  const projection = useMemo(() => new SceneProjection(NODE_TEX_HEIGHT, EDGE_TEX_HEIGHT), []);

  const stableColor3 = useMemo(() => new THREE.Color(), []);
  const crisisColor3 = useMemo(() => new THREE.Color(), []);
  useEffect(() => {
    stableColor3.set(stableColor);
    crisisColor3.set(crisisColor);
  }, [stableColor3, crisisColor3, stableColor, crisisColor]);

  // Bumped when sync reports topology change, so the projection's `built`
  // bundle is rebuilt. NOT bumped on every fade-value tick — those are written
  // through to GPU mirrors that stay bound across frames.
  const [activeKey, setActiveKey] = useState(0);

  // Reset both explorer and projection when seed or mode changes. Mode swaps
  // need a fresh state because full-tree pre-generates the whole tree at
  // create time, and toggle/single-path start with the user driving expansion.
  useEffect(() => {
    setExplorer(createExplorer({ seed, mode }));
    projection.reset();
    setActiveKey((k) => k + 1);
    setFollowArmed(false);
  }, [seed, mode, projection]);

  // Sync the projection's active set against the explorer's current visible
  // scene. The projection's pruning of finished-fade entries happens here too
  // — see SceneProjection.sync for why.
  useEffect(() => {
    const changed = projection.sync(getVisibleScene(explorer));
    if (changed) setActiveKey((k) => k + 1);
  }, [explorer, projection]);

  const built = useMemo(
    () => projection.build(explorer.focusId),
    [projection, activeKey, explorer.focusId],
  );

  // Free every GPU resource the projection owns when Scene unmounts. The
  // per-build mirrors used to live on the Built bundle and required a
  // deferred-disposal dance to avoid freeing a still-bound texture during
  // render; they're now fixed-capacity one-shots on the projection itself,
  // so there's no per-build lifecycle to manage and unmount is the only
  // cleanup point.
  useEffect(() => () => projection.dispose(), [projection]);

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * fadeSpeed);
    projection.tickFades(k);
    projection.writeBulgeData(explorer.focusId, stableColor3, crisisColor3);
  });

  const handleSelectNode = useCallback(
    (index: number) => {
      const id = built.nodeIds[index];
      if (!id) return;
      setExplorer((s) => {
        switch (s.mode) {
          case "single-path":
            return withFocus(s, id);
          case "toggle":
            return toggleExpanded(s, id);
          case "full-tree":
            // Tree is fully expanded; click only updates focus for the camera.
            return s.focusId === id ? s : { ...s, focusId: id };
        }
      });
      setFollowArmed(true);
    },
    [built.nodeIds],
  );

  const focusNode = built.timeline.nodes[built.focusIndex];

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
        onSelectNode={handleSelectNode}
        fadeAttribute={projection.nodeFade.attribute}
        sphereOpacity={sphereOpacity}
        stableColor={stableColor}
        crisisColor={crisisColor}
      />
      {followArmed && focusNode && (
        <CameraFollow target={focusNode.position} lerp={cameraEase} />
      )}
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
        // (App sets it to (0, 1.2, 9)); only the target moves.
        target={[0, 1.8, 0]}
        makeDefault
      />
    </>
  );
}
