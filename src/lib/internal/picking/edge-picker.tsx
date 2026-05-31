import { useEffect, useMemo, useRef } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { Timeline, sampleBezier } from "../timeline";
import { useHoverSuppression } from "./useHoverSuppression";

// Invisible "fat tube" raycaster meshes — one per edge — so onClick / onPointerOver
// can resolve a particle stream to an edge index. The particle <points> field
// uses a noopRaycast (particles aren't reliably raycastable as point sprites),
// so without these, edges would be unpickable. We render the tubes with
// `visible={false}` and a transparent material — three.js still raycasts
// invisible meshes, but the GPU does no work to draw them.
//
// Memoized by `timeline` identity, so the geometry rebuilds in lock-step with
// the curve texture in ParticleField (same useMemo dep) — meaning the picker
// always sees the current bezier curves.

interface EdgePickerProps {
  timeline: Timeline;
  /** Called with the index into `timeline.edges` of the clicked edge. */
  onEdgeClick?: (edgeIndex: number, event: PointerEvent) => void;
  /** Called on enter with an index, and on leave with `null`. */
  onEdgeHover?: (edgeIndex: number | null, event: PointerEvent) => void;
  /** Bezier curve sample count per tube. 24 ≈ visually faithful for the
   *  small-curvature bows we draw. */
  tubularSegments?: number;
  /** Radial segments per tube ring. 5 keeps geometry cheap; the tube is
   *  invisible so quality only matters for raycast precision. */
  radialSegments?: number;
  /** World-units radius of the invisible "fat tube" hit region. Looser =
   *  easier to hit; tighter = less likely to swallow background clicks. */
  pickRadius?: number;
  /** World-units to clip off each end of the tube so it stops at the node
   *  surface instead of running through the node center. Edge curves are
   *  anchored node-center to node-center, so an untrimmed tube overlaps both
   *  endpoint spheres and steals clicks meant for the node (the particle
   *  streams flow right over it). Default tracks the node sphere radius. */
  endTrim?: number;
}

// A bezier curve restricted to the parametric sub-range [tStart, tEnd]. The
// [0,1] domain TubeGeometry samples is remapped into that window, so the tube
// covers only the trimmed span — clipping the ends away from the nodes.
class BezierCurve3 extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly controls: [
      THREE.Vector3,
      THREE.Vector3,
      THREE.Vector3,
      THREE.Vector3,
    ],
    private readonly tStart = 0,
    private readonly tEnd = 1,
  ) {
    super();
  }
  getPoint(s: number, optionalTarget = new THREE.Vector3()): THREE.Vector3 {
    const t = this.tStart + s * (this.tEnd - this.tStart);
    return sampleBezier(this.controls, t, optionalTarget);
  }
}

export function EdgePicker({
  timeline,
  onEdgeClick,
  onEdgeHover,
  tubularSegments = 24,
  radialSegments = 5,
  pickRadius = 0.18,
  endTrim = 0.2,
}: EdgePickerProps) {
  // Build a TubeGeometry per edge, with the edge's timeline-index baked into
  // each mesh's userData so the click handler can resolve it without an
  // extra lookup. Geometries are disposed when the timeline identity flips
  // — no other lifetime to worry about because they're owned by Mesh which
  // R3F disposes on unmount.
  const meshes = useMemo(() => {
    return timeline.edges.map((edge, i) => {
      // Convert the world-units endTrim into a parametric margin per end via
      // the curve's arc-length mapping, then build the tube over the clipped
      // [t0, t1] window. Cap the margin at 0.4 per end so short edges keep a
      // pickable middle (≥20% of the span) rather than collapsing to nothing.
      const full = new BezierCurve3(edge.controls);
      const length = full.getLength();
      const margin = length > 1e-6 ? Math.min(endTrim / length, 0.4) : 0;
      // Second arg (distance) is 0 → falsy, so three.js maps from the u
      // fraction; @types/three just marks the param required.
      const curve = new BezierCurve3(
        edge.controls,
        full.getUtoTmapping(margin, 0),
        full.getUtoTmapping(1 - margin, 0),
      );
      const geom = new THREE.TubeGeometry(
        curve,
        tubularSegments,
        pickRadius,
        radialSegments,
        false,
      );
      return { index: i, geom };
    });
  }, [timeline, tubularSegments, radialSegments, pickRadius, endTrim]);

  // Dispose all the geometries when the active set changes (we re-create on
  // the next render). Without this, every topology change leaks the previous
  // batch of TubeGeometry into GPU memory.
  const prevRef = useRef<typeof meshes>([]);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = meshes;
    return () => {
      for (const m of prev) m.geom.dispose();
    };
  }, [meshes]);

  // Shared stale-pointerOut suppression + cursor toggle. These handlers are
  // only attached to the meshes when onEdgeHover is set (see below), so enter/
  // leave always have a hover callback to drive.
  const { enter, leave } = useHoverSuppression<number>(onEdgeHover);

  const handleClick = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    if (!onEdgeClick) return;
    e.stopPropagation();
    onEdgeClick(i, e.nativeEvent as PointerEvent);
  };
  const handlePointerOver = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    enter(i, e.nativeEvent);
  };
  const handlePointerOut = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    leave(i, e.nativeEvent);
  };

  const hasHandlers = !!onEdgeClick || !!onEdgeHover;
  if (!hasHandlers) return null;

  return (
    <group>
      {meshes.map(({ index, geom }) => (
        <mesh
          key={index}
          geometry={geom}
          visible={false}
          onClick={onEdgeClick ? handleClick(index) : undefined}
          onPointerOver={onEdgeHover ? handlePointerOver(index) : undefined}
          onPointerOut={onEdgeHover ? handlePointerOut(index) : undefined}
        >
          {/* Material is invisible but must exist for raycast tests. */}
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
