import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

// Small ring affordance rendered around any node marked `expandable: true`
// whose id is NOT in `expandedNodeIds`. Clicking the ring (NOT the sphere)
// fires onAffordanceClick, which Scene routes to the public onNodeExpand
// callback. Click on the sphere itself stays a "focus / select" event.
//
// Each ring is billboarded toward the camera per-frame so the annulus reads
// as a clean halo from any view angle, and so the hit-test (which lives on
// a flat RingGeometry) is forgiving regardless of camera orbit position.
//
// Per-frame billboard cost: one lookAt per visible ring. For a tree with
// ~30 expandable nodes that's well under a millisecond. If a future
// integration ships graphs with thousands of expandable nodes, fold this
// into an InstancedMesh + per-instance billboard in a vertex shader.

interface AffordanceProps {
  /** World-space center of each affordance ring (= the node position). */
  positions: ReadonlyArray<readonly [number, number, number]>;
  /** Hex color for the ring tint. Threaded from theme.highlight. */
  color: string;
  /** Inner / outer radii of the ring. Inner > sphere radius so the ring
   *  doesn't visually compete with the sphere's rim. */
  innerRadius: number;
  outerRadius: number;
  /** Click handler — fires with the affordance's index in `positions` and
   *  the native PointerEvent. */
  onAffordanceClick?: (index: number, event: PointerEvent) => void;
}

export function Affordance({
  positions,
  color,
  innerRadius,
  outerRadius,
  onAffordanceClick,
}: AffordanceProps) {
  // One shared geometry for every ring — radii baked at creation. Disposed
  // automatically by React when this prop identity changes (the ring is
  // remounted via key) but we still dispose explicitly on radius changes.
  const geometry = useMemo(
    () => new THREE.RingGeometry(innerRadius, outerRadius, 32),
    [innerRadius, outerRadius],
  );
  // Shared material — basic, transparent, depthWrite false so the ring
  // doesn't occlude particles behind it. Color is updated via useFrame's
  // reference so theme.highlight changes don't require remount.
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    // Color kept in the deps so a theme.highlight change rebuilds the
    // material; cheap since the material is shared across rings.
    [color],
  );

  const groupRef = useRef<THREE.Group>(null!);
  useFrame(({ camera }) => {
    const g = groupRef.current;
    if (!g) return;
    // Billboard each child individually — they sit at different world
    // positions so a single group rotation can't face all toward the
    // camera at once. The Object3D.lookAt API is the canonical way.
    for (const child of g.children) child.lookAt(camera.position);
  });

  const handleClick = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    if (!onAffordanceClick) return;
    // Stop propagation so the sphere underneath doesn't ALSO fire its own
    // onClick (which would then move focus / select alongside the expand).
    e.stopPropagation();
    onAffordanceClick(i, e.nativeEvent as PointerEvent);
  };

  if (positions.length === 0) return null;

  return (
    <group ref={groupRef}>
      {positions.map((p, i) => (
        <mesh
          key={i}
          position={p as unknown as THREE.Vector3Tuple}
          geometry={geometry}
          material={material}
          onClick={onAffordanceClick ? handleClick(i) : undefined}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        />
      ))}
    </group>
  );
}
