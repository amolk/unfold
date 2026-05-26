import type { Vec3 } from "../../types";

// Derive cubic-bezier control points from two endpoints + a curvature amount.
// Lifted from the prototype's makeBezierEdge (src/explorer/state.ts) with the
// RNG jitter removed so the result is deterministic for a given input.

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** `curvature` 0 = straight; 1 = a pronounced single-bend bow in a plane
 *  perpendicular to the segment. Default callers pass 0.4. */
export function deriveBezierControls(
  from: Vec3,
  to: Vec3,
  curvature: number,
): [Vec3, Vec3, Vec3, Vec3] {
  const dir: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;

  // Inner control points at 1/3 and 2/3 along the segment.
  const t1: Vec3 = [from[0] + dir[0] / 3, from[1] + dir[1] / 3, from[2] + dir[2] / 3];
  const t2: Vec3 = [
    from[0] + (dir[0] * 2) / 3,
    from[1] + (dir[1] * 2) / 3,
    from[2] + (dir[2] * 2) / 3,
  ];

  // Perpendicular bow direction. Reference axis switches when the segment is
  // near-vertical so the cross product stays well-conditioned.
  const ref: Vec3 = Math.abs(dir[1] / len) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let perp = cross(dir, ref);
  const plen = Math.hypot(perp[0], perp[1], perp[2]) || 1;
  perp = [perp[0] / plen, perp[1] / plen, perp[2] / plen];

  // Bow magnitude scales with segment length so long and short edges bend
  // proportionally. 0.35·len·curvature ≈ the prototype's tuned 0.18·len feel
  // at the default curvature of 0.4.
  const bow = 0.35 * len * curvature;
  const c1: Vec3 = [t1[0] + perp[0] * bow, t1[1] + perp[1] * bow, t1[2] + perp[2] * bow];
  const c2: Vec3 = [t2[0] + perp[0] * bow, t2[1] + perp[1] * bow, t2[2] + perp[2] * bow];

  return [[...from] as Vec3, c1, c2, [...to] as Vec3];
}
