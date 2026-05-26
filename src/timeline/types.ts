import * as THREE from "three";

export type NodeKind = "stable" | "crisis";

export interface TimelineNode {
  id: number;
  position: THREE.Vector3;
  kind: NodeKind;
  depth: number;
}

export interface TimelineEdge {
  id: number;
  from: number;
  to: number;
  // Cubic bezier control points (4 vec3s). Sampled into the curve texture.
  controls: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  // Visual weight — trunk edges get more particles than fine branches.
  weight: number;
  fromKind: NodeKind;
  toKind: NodeKind;
}

export interface Timeline {
  nodes: TimelineNode[];
  edges: TimelineEdge[];
}

// Sample a cubic bezier at parameter t in [0,1].
export function sampleBezier(
  c: TimelineEdge["controls"],
  t: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const it = 1 - t;
  const b0 = it * it * it;
  const b1 = 3 * it * it * t;
  const b2 = 3 * it * t * t;
  const b3 = t * t * t;
  out.set(
    c[0].x * b0 + c[1].x * b1 + c[2].x * b2 + c[3].x * b3,
    c[0].y * b0 + c[1].y * b1 + c[2].y * b2 + c[3].y * b3,
    c[0].z * b0 + c[1].z * b1 + c[2].z * b2 + c[3].z * b3,
  );
  return out;
}
