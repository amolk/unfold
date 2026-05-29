import { Unfold, type UnfoldData } from "../../lib";

// Edge geometry has two knobs:
//   - `curvature` (default 0.4) — 0 is straight, 1 is a pronounced bow in
//     a plane perpendicular to the segment. Auto-derived bezier.
//   - `controls`  — an explicit four-point cubic bezier. When set, it
//     overrides curvature entirely. Use this for snake/S-shapes or any
//     path the auto-derivation can't produce.
//
// Four pairs of nodes, each connected by an edge that exercises one knob.

const data: UnfoldData = {
  nodes: [
    // Four horizontal rows of two nodes each. layout="none" so positions
    // are honored exactly.
    { id: "a0", position: [0, 1.5, -2] },
    { id: "a1", position: [0, 1.5, 2] },

    { id: "b0", position: [0, 0.5, -2] },
    { id: "b1", position: [0, 0.5, 2] },

    { id: "c0", position: [0, -0.5, -2] },
    { id: "c1", position: [0, -0.5, 2] },

    { id: "d0", position: [0, -1.5, -2] },
    { id: "d1", position: [0, -1.5, 2] },
  ],
  edges: [
    // Straight.
    { id: "ea", source: "a0", target: "a1", curvature: 0 },
    // Default bow.
    { id: "eb", source: "b0", target: "b1", curvature: 0.4 },
    // Stronger bow.
    { id: "ec", source: "c0", target: "c1", curvature: 1 },
    // Hand-authored S-curve: the two inner control points sit on opposite
    // sides of the segment, producing a sideways S.
    {
      id: "ed",
      source: "d0",
      target: "d1",
      controls: [
        [0, -1.5, -2],
        [0.8, -1.5, -0.5],
        [-0.8, -1.5, 0.5],
        [0, -1.5, 2],
      ],
    },
  ],
};

// All four edges run along z and bow in the x direction. The default
// camera sits on +x, so the bows would be seen end-on (compressed). Tilt
// ~75° up around the x axis so we look down at the y/z plane and the bows
// read as clear arcs. Distance kept at the default 9 units from origin.
//
//   x = 9·cos(75°) ≈ 2.33
//   y = 9·sin(75°) ≈ 8.69
const TILT_DEG = -75;
const DISTANCE = 9;
const tilt = (TILT_DEG * Math.PI) / 180;

export function Curvature() {
  return (
    <Unfold
      data={data}
      layout="none"
      initialCamera={{
        position: [DISTANCE * Math.cos(tilt), DISTANCE * Math.sin(tilt), 0],
        target: [0, 0, 0],
      }}
    />
  );
}
