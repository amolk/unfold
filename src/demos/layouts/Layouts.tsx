import { Unfold, type UnfoldData, type Vec3 } from "../../lib";

// One topology rendered four ways: the three built-in layouts plus a
// hand-authored explicit-position layout (`layout="none"`). Nothing about
// the data changes between panes — only the `layout` prop and, for the
// custom pane, the per-node `position` field.

const topology: UnfoldData = {
  nodes: [
    { id: "root" },
    { id: "a" },
    { id: "b" },
    { id: "c" },
    { id: "a1" },
    { id: "a2" },
    { id: "b1" },
    { id: "b2" },
    { id: "c1" },
    { id: "c2" },
  ],
  edges: [
    { id: "e1", source: "root", target: "a" },
    { id: "e2", source: "root", target: "b" },
    { id: "e3", source: "root", target: "c" },
    { id: "e4", source: "a", target: "a1" },
    { id: "e5", source: "a", target: "a2" },
    { id: "e6", source: "b", target: "b1" },
    { id: "e7", source: "b", target: "b2" },
    { id: "e8", source: "c", target: "c1" },
    { id: "e9", source: "c", target: "c2" },
  ],
};

// Hand-authored positions: root at origin, three branches emanating in a
// triangular trefoil, grandchildren tucked just beyond their parent.
const customPositions: Record<string, Vec3> = {
  root: [0, 0, 0],
  a: [0, 1.6, 1.6],
  b: [0, -1.8, 0],
  c: [0, 1.6, -1.6],
  a1: [0.4, 2.4, 2.6],
  a2: [-0.4, 2.4, 2.6],
  b1: [0.4, -2.9, 0.5],
  b2: [-0.4, -2.9, -0.5],
  c1: [0.4, 2.4, -2.6],
  c2: [-0.4, 2.4, -2.6],
};

const customData: UnfoldData = {
  nodes: topology.nodes.map((n) => ({
    ...n,
    position: customPositions[n.id],
  })),
  edges: topology.edges,
};

export function Layouts() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        width: "100%",
        height: "100%",
        gap: 1,
      }}
    >
      <Pane label='layout="layered"'>
        <Unfold data={topology} layout="layered" />
      </Pane>
      <Pane label='layout="radial"'>
        <Unfold data={topology} layout="radial" />
      </Pane>
      <Pane label='layout="hierarchical"'>
        <Unfold data={topology} layout="hierarchical" />
      </Pane>
      <Pane label='layout="none" (explicit positions)'>
        <Unfold data={customData} layout="none" />
      </Pane>
    </div>
  );
}

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {children}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 10,
          color: "#d8d0c8",
          fontFamily: "ui-monospace, monospace",
          fontSize: 10,
          background: "rgba(20, 10, 14, 0.75)",
          padding: "3px 7px",
          borderRadius: 3,
          pointerEvents: "none",
        }}
      >
        {label}
      </div>
    </div>
  );
}
