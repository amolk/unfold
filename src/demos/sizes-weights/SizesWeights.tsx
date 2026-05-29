import { Unfold, type UnfoldData } from "../../lib";

// Per-item visual knobs:
//   - `node.size`   — radius multiplier (default 1). Encode importance.
//   - `edge.weight` — particle-density multiplier (default 1). Encode
//                     traffic, throughput, confidence — whatever scalar
//                     a thicker stream should carry.

const data: UnfoldData = {
  nodes: [
    { id: "hub", label: "hub", size: 2.2 },
    { id: "big", label: "high traffic", size: 1.4 },
    { id: "med", label: "medium", size: 1.0 },
    { id: "small", label: "low traffic", size: 0.6 },
  ],
  edges: [
    // Heavy: dense, fat stream.
    { id: "e-big", source: "hub", target: "big", weight: 3 },
    // Default.
    { id: "e-med", source: "hub", target: "med", weight: 1 },
    // Sparse trickle.
    { id: "e-small", source: "hub", target: "small", weight: 0.3 },
  ],
};

export function SizesWeights() {
  return <Unfold data={data} />;
}
