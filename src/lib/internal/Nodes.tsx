import { useEffect, useMemo, useRef } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { Timeline } from "./timeline";
import { nodesVert } from "./nodes.vert.glsl";
import { nodesFrag } from "./nodes.frag.glsl";
import { DEFAULT_SCENE } from "./defaults";

interface NodesProps {
  timeline: Timeline;
  focusedIndex?: number;
  onSelectNode?: (index: number) => void;
  /** Per-instance fade in [0,1]; backing array is mutated by the owner each
   *  frame, we just (re)bind it and set needsUpdate. */
  fadeAttribute: THREE.InstancedBufferAttribute;
  /** 0 = invisible (still raycastable for clicks), 1 = full sun-surface look. */
  sphereOpacity: number;
  /** From the shared theme — see defaults.ts / theme prop. */
  stableColor: string;
  crisisColor: string;
  /** Sphere radius. Formerly the "Nodes" Leva panel. */
  nodeRadius?: number;
  /** Rim-light strength. Formerly the "Nodes" Leva panel. */
  rimStrength?: number;
}

export function Nodes({
  timeline,
  focusedIndex = -1,
  onSelectNode,
  fadeAttribute,
  sphereOpacity,
  stableColor,
  crisisColor,
  nodeRadius = DEFAULT_SCENE.nodeRadius,
  rimStrength = DEFAULT_SCENE.rimStrength,
}: NodesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);

  // Static per-instance buffers (colors, kinds) rebuilt when the visible set
  // changes. Scale and emphasis are recomputed when focusedIndex changes.
  const { positions, instColors, instKinds } = useMemo(() => {
    const n = timeline.nodes.length;
    const positions = new Float32Array(n * 3);
    const instColors = new Float32Array(n * 3);
    const instKinds = new Float32Array(n);
    const stable = new THREE.Color(stableColor);
    const crisis = new THREE.Color(crisisColor);
    timeline.nodes.forEach((node, i) => {
      positions[i * 3 + 0] = node.position.x;
      positions[i * 3 + 1] = node.position.y;
      positions[i * 3 + 2] = node.position.z;
      const col = node.kind === "crisis" ? crisis : stable;
      instColors[i * 3 + 0] = col.r;
      instColors[i * 3 + 1] = col.g;
      instColors[i * 3 + 2] = col.b;
      instKinds[i] = node.kind === "crisis" ? 1 : 0;
    });
    return { positions, instColors, instKinds };
  }, [timeline, stableColor, crisisColor]);

  // Apply instance matrices + (re)bind the static per-instance attributes.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < timeline.nodes.length; i++) {
      m.setPosition(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      mesh.setMatrixAt(i, m);
    }
    mesh.count = timeline.nodes.length;
    mesh.instanceMatrix.needsUpdate = true;
    // InstancedMesh.raycast checks the bounding sphere first; it isn't
    // auto-updated when instance matrices change, so without this the
    // raycaster only intersects instances near the original origin position.
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();

    const geom = mesh.geometry as THREE.InstancedBufferGeometry;
    geom.setAttribute(
      "aInstanceColor",
      new THREE.InstancedBufferAttribute(instColors, 3),
    );
    geom.setAttribute(
      "aInstanceKind",
      new THREE.InstancedBufferAttribute(instKinds, 1),
    );
  }, [timeline, positions, instColors, instKinds]);

  // (Re)bind the externally-owned fade attribute. Backing array is mutated by
  // the parent each frame; we don't recreate it here.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const geom = mesh.geometry as THREE.InstancedBufferGeometry;
    geom.setAttribute("aInstanceFade", fadeAttribute);
  }, [fadeAttribute]);

  // All nodes render at the same size; the focused node "lights up" instead
  // (the fragment shader boosts body brightness and rim strength by vEmphasis).
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const n = timeline.nodes.length;
    const scales = new Float32Array(n);
    const emphases = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      scales[i] = 1;
      emphases[i] = i === focusedIndex ? 1 : 0;
    }
    const geom = mesh.geometry as THREE.InstancedBufferGeometry;
    geom.setAttribute("aInstanceScale", new THREE.InstancedBufferAttribute(scales, 1));
    geom.setAttribute(
      "aInstanceEmphasis",
      new THREE.InstancedBufferAttribute(emphases, 1),
    );
  }, [timeline, focusedIndex]);

  const uniforms = useMemo(
    () => ({
      uRimStrength: { value: rimStrength },
      uDarkTint: { value: new THREE.Color(0.25, 0.18, 0.15) },
      uOpacity: { value: 1 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const u = materialRef.current?.uniforms;
    if (!u) return;
    u.uRimStrength.value = rimStrength;
    u.uOpacity.value = sphereOpacity;
  }, [rimStrength, sphereOpacity]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.instanceId == null || !onSelectNode) return;
    e.stopPropagation();
    onSelectNode(e.instanceId);
  };
  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (!onSelectNode) return;
    e.stopPropagation();
    document.body.style.cursor = "pointer";
  };
  const handlePointerOut = () => {
    if (!onSelectNode) return;
    document.body.style.cursor = "";
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, Math.max(1, timeline.nodes.length)]}
      frustumCulled={false}
      onClick={onSelectNode ? handleClick : undefined}
      onPointerOver={onSelectNode ? handlePointerOver : undefined}
      onPointerOut={onSelectNode ? handlePointerOut : undefined}
    >
      <sphereGeometry args={[nodeRadius, 32, 24]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={nodesVert}
        fragmentShader={nodesFrag}
        // NOT transparent — the fragment shader outputs alpha=1 always and
        // only discards when uOpacity drops to 0. Three.js draws this in
        // the opaque pass, which (combined with depthTest) gives correct
        // inter-sphere ordering regardless of which instance rasterises
        // first. The body acts as a full occluder for wisps behind it; to
        // hide spheres entirely, set sphereOpacity to 0 (the discard then
        // skips depth write so wisps pass through).
        depthWrite
        depthTest
      />
    </instancedMesh>
  );
}
