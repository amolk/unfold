import { useEffect, useMemo, useRef } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { Timeline } from "./timeline";
import { nodesVert } from "./nodes.vert.glsl";
import { nodesFrag } from "./nodes.frag.glsl";
import { DEFAULT_SCENE } from "./defaults";
import { useHoverSuppression } from "./picking/useHoverSuppression";

interface NodesProps {
  timeline: Timeline;
  focusedIndex?: number;
  /** Boolean flags parallel to `timeline.nodes`. `selectedFlags[i] === true`
   *  draws the i-th node with the highlight-rim treatment. Pass the same
   *  empty / all-false array if no nodes are selected (don't toggle between
   *  passing/undefined to avoid effect churn). */
  selectedFlags?: boolean[];
  /** Per-instance fade in [0,1]; backing array is mutated by the owner each
   *  frame, we just (re)bind it and set needsUpdate. */
  fadeAttribute: THREE.InstancedBufferAttribute;
  /** 0 = invisible (still raycastable for clicks), 1 = full sun-surface look. */
  sphereOpacity: number;
  /** Hex color used as the rim tint for selected nodes. */
  highlightColor: string;
  /** Sphere radius. Formerly the "Nodes" Leva panel. */
  nodeRadius?: number;
  /** Rim-light strength. Formerly the "Nodes" Leva panel. */
  rimStrength?: number;
  /** Click handler. Fires with the timeline-index of the clicked node and the
   *  native PointerEvent. Scene maps the index back to the public UnfoldNode. */
  onNodeClick?: (index: number, event: PointerEvent) => void;
  /** Hover handler. Fires with the index on enter and `null` on leave. */
  onNodeHover?: (index: number | null, event: PointerEvent) => void;
}

export function Nodes({
  timeline,
  focusedIndex = -1,
  selectedFlags,
  fadeAttribute,
  sphereOpacity,
  highlightColor,
  nodeRadius = DEFAULT_SCENE.nodeRadius,
  rimStrength = DEFAULT_SCENE.rimStrength,
  onNodeClick,
  onNodeHover,
}: NodesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);

  // Static per-instance buffers (positions, resolved per-node colors) rebuilt
  // when the visible set changes. Color comes from TimelineNode.color, which
  // is pre-resolved on the projection side (node.color → theme.categories[
  // category] → defaultNodeColor). Scale and emphasis are recomputed when
  // focusedIndex changes.
  const { positions, instColors } = useMemo(() => {
    const n = timeline.nodes.length;
    const positions = new Float32Array(n * 3);
    const instColors = new Float32Array(n * 3);
    const tmp = new THREE.Color();
    timeline.nodes.forEach((node, i) => {
      positions[i * 3 + 0] = node.position.x;
      positions[i * 3 + 1] = node.position.y;
      positions[i * 3 + 2] = node.position.z;
      tmp.set(node.color);
      instColors[i * 3 + 0] = tmp.r;
      instColors[i * 3 + 1] = tmp.g;
      instColors[i * 3 + 2] = tmp.b;
    });
    return { positions, instColors };
  }, [timeline]);

  // Apply instance matrices + (re)bind the static per-instance attributes.
  // `nodeRadius` is in the deps because changing it makes R3F rebuild the
  // <sphereGeometry>; the new BufferGeometry replaces mesh.geometry and any
  // previously-bound aInstance* attributes vanish with the old one. Without
  // re-binding, the vertex shader reads default 0 for aInstanceFade and the
  // sphere collapses to a point. Same reason `nodeRadius` is in the deps of
  // the fade-bind and scale-bind effects below.
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
  }, [timeline, positions, instColors, nodeRadius]);

  // (Re)bind the externally-owned fade attribute. Backing array is mutated by
  // the parent each frame; we don't recreate it here. `nodeRadius` is in the
  // deps so we re-bind after a geometry rebuild — see the comment above.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const geom = mesh.geometry as THREE.InstancedBufferGeometry;
    geom.setAttribute("aInstanceFade", fadeAttribute);
  }, [fadeAttribute, nodeRadius]);

  // All nodes render at the same size; the focused node "lights up" instead
  // (the fragment shader boosts body brightness and rim strength by vEmphasis).
  // `nodeRadius` is in the deps so we re-bind after a geometry rebuild.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const n = timeline.nodes.length;
    const scales = new Float32Array(n);
    const emphases = new Float32Array(n);
    const selected = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      scales[i] = 1;
      emphases[i] = i === focusedIndex ? 1 : 0;
      selected[i] = selectedFlags?.[i] ? 1 : 0;
    }
    const geom = mesh.geometry as THREE.InstancedBufferGeometry;
    geom.setAttribute("aInstanceScale", new THREE.InstancedBufferAttribute(scales, 1));
    geom.setAttribute(
      "aInstanceEmphasis",
      new THREE.InstancedBufferAttribute(emphases, 1),
    );
    geom.setAttribute(
      "aInstanceSelected",
      new THREE.InstancedBufferAttribute(selected, 1),
    );
  }, [timeline, focusedIndex, selectedFlags, nodeRadius]);

  const uniforms = useMemo(
    () => ({
      uRimStrength: { value: rimStrength },
      uDarkTint: { value: new THREE.Color(0.25, 0.18, 0.15) },
      uOpacity: { value: 1 },
      uHighlightColor: { value: new THREE.Color(highlightColor) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const u = materialRef.current?.uniforms;
    if (!u) return;
    u.uRimStrength.value = rimStrength;
    u.uOpacity.value = sphereOpacity;
    u.uHighlightColor.value.set(highlightColor);
  }, [rimStrength, sphereOpacity, highlightColor]);

  // Shared stale-pointerOut suppression + cursor toggle (see useHoverSuppression).
  const { enter, leave } = useHoverSuppression<number>(onNodeHover);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.instanceId == null || !onNodeClick) return;
    e.stopPropagation();
    onNodeClick(e.instanceId, e.nativeEvent as PointerEvent);
  };
  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId == null) return;
    e.stopPropagation();
    enter(e.instanceId, e.nativeEvent);
  };
  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId == null) return;
    leave(e.instanceId, e.nativeEvent);
  };

  const hasHandlers = !!onNodeClick || !!onNodeHover;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, Math.max(1, timeline.nodes.length)]}
      frustumCulled={false}
      onClick={hasHandlers ? handleClick : undefined}
      onPointerOver={hasHandlers ? handlePointerOver : undefined}
      onPointerOut={hasHandlers ? handlePointerOut : undefined}
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
