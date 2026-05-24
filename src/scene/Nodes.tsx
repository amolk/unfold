import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useControls, folder } from "leva";
import * as THREE from "three";
import { Timeline } from "../timeline/generate";
import { nodesVert } from "./nodes.vert.glsl";
import { nodesFrag } from "./nodes.frag.glsl";

interface NodesProps {
  timeline: Timeline;
  focusedIndex?: number;
  onSelectNode?: (index: number) => void;
  /** Per-instance fade in [0,1]; backing array is mutated by the owner each
   *  frame, we just (re)bind it and set needsUpdate. */
  fadeAttribute: THREE.InstancedBufferAttribute;
}

export function Nodes({
  timeline,
  focusedIndex = -1,
  onSelectNode,
  fadeAttribute,
}: NodesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);

  const {
    nodeRadius,
    crisisScale,
    focusScale,
    plasmaScale,
    plasmaSpeed,
    rimStrength,
    hotBoost,
    stableNodeColor,
    crisisNodeColor,
  } = useControls("Nodes", {
    nodeRadius: { value: 0.2, min: 0.02, max: 1.5, step: 0.01 },
    crisisScale: { value: 1.6, min: 0.5, max: 4, step: 0.05 },
    focusScale: { value: 1.8, min: 1, max: 4, step: 0.05 },
    stableNodeColor: "#8CD0FF",
    crisisNodeColor: "#FFB060",
    Plasma: folder({
      plasmaScale: { value: 0.5, min: 0.1, max: 30, step: 0.1, label: "scale" },
      plasmaSpeed: { value: 0.4, min: 0, max: 3, step: 0.05, label: "speed" },
      rimStrength: { value: 0.9, min: 0, max: 3, step: 0.05, label: "rim" },
      hotBoost: { value: 0.5, min: 0.1, max: 5, step: 0.05, label: "hot boost" },
    }),
  });

  // Static per-instance buffers (colors, kinds) rebuilt when the visible set
  // changes. Scale and emphasis are recomputed when focusedIndex changes.
  const { positions, instColors, instKinds } = useMemo(() => {
    const n = timeline.nodes.length;
    const positions = new Float32Array(n * 3);
    const instColors = new Float32Array(n * 3);
    const instKinds = new Float32Array(n);
    const stable = new THREE.Color(stableNodeColor);
    const crisis = new THREE.Color(crisisNodeColor);
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
  }, [timeline, stableNodeColor, crisisNodeColor]);

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

  // Scale + emphasis depend on the focus, so they update independently when
  // the user navigates without rebuilding the color/kind buffers.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const n = timeline.nodes.length;
    const scales = new Float32Array(n);
    const emphases = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = timeline.nodes[i].kind === "crisis" ? crisisScale : 1;
      if (i === focusedIndex) {
        s *= focusScale;
        emphases[i] = 1;
      }
      scales[i] = s;
    }
    const geom = mesh.geometry as THREE.InstancedBufferGeometry;
    geom.setAttribute("aInstanceScale", new THREE.InstancedBufferAttribute(scales, 1));
    geom.setAttribute(
      "aInstanceEmphasis",
      new THREE.InstancedBufferAttribute(emphases, 1),
    );
  }, [timeline, focusedIndex, crisisScale, focusScale]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPlasmaScale: { value: plasmaScale },
      uPlasmaSpeed: { value: plasmaSpeed },
      uRimStrength: { value: rimStrength },
      uHotBoost: { value: hotBoost },
      uHotTint: { value: new THREE.Color(1.0, 0.9, 0.75) },
      uDarkTint: { value: new THREE.Color(0.25, 0.18, 0.15) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const u = materialRef.current?.uniforms;
    if (!u) return;
    u.uPlasmaScale.value = plasmaScale;
    u.uPlasmaSpeed.value = plasmaSpeed;
    u.uRimStrength.value = rimStrength;
    u.uHotBoost.value = hotBoost;
  }, [plasmaScale, plasmaSpeed, rimStrength, hotBoost]);

  useFrame((_, dt) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += dt;
    }
  });

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
        transparent={false}
        depthWrite
        depthTest
      />
    </instancedMesh>
  );
}
