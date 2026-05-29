import { Unfold, type UnfoldData } from "../../lib";

// Every edge carries a particle stream. `flow` describes that stream:
//   - colors[]:      up to 8 colors, interleaved into the stream
//   - proportions[]: relative weights for each color (auto-normalized)
//   - speed:         travel speed multiplier (default 1.0)
// When `flow` is omitted, the stream uses a single color from
// theme.defaultEdgeColor. This demo wires four edges, each illustrating a
// different mix.

const data: UnfoldData = {
  nodes: [
    { id: "src", label: "source" },
    { id: "a", label: "single color (fast)" },
    { id: "b", label: "50 / 50" },
    { id: "c", label: "80 / 20 (fast)" },
    { id: "d", label: "4 colors" },
  ],
  edges: [
    {
      id: "e-a",
      source: "src",
      target: "a",
      flow: { colors: ["#80d0ff"], proportions: [1], speed: 2.5 },
    },
    {
      id: "e-b",
      source: "src",
      target: "b",
      flow: {
        colors: ["#80d0ff", "#ff8060"],
        proportions: [1, 1],
      },
    },
    {
      id: "e-c",
      source: "src",
      target: "c",
      flow: {
        colors: ["#80ffb0", "#ff60a0"],
        proportions: [4, 1],
        speed: 2.2,
      },
    },
    {
      id: "e-d",
      source: "src",
      target: "d",
      flow: {
        colors: ["#80d0ff", "#b090ff", "#ffd060", "#ff6080"],
        proportions: [3, 2, 2, 1],
      },
    },
  ],
};

export function EdgeFlows() {
  return <Unfold data={data} />;
}
