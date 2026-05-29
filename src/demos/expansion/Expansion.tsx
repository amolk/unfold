import { useState } from "react";
import { Unfold, type UnfoldData, type UnfoldNode } from "../../lib";

// Mark a node `expandable: true` and the library renders an affordance
// ring; clicking it fires `onNodeExpand` instead of a regular click.
// The handler grows the graph by returning a new `data` object with
// fresh children. (You own the data — the library never mutates it.)

const initial: UnfoldData = {
  nodes: [
    { id: "root", label: "root", expandable: true },
  ],
  edges: [],
};

let nextId = 0;
const makeId = () => `n${nextId++}`;

export function Expansion() {
  const [data, setData] = useState<UnfoldData>(initial);

  const expand = (node: UnfoldNode) => {
    // Make two children for the clicked node. Each child is itself
    // expandable, so the tree can keep growing.
    const a = { id: makeId(), label: makeId(), expandable: true };
    const b = { id: makeId(), label: makeId(), expandable: true };

    setData((prev) => ({
      // The expanded node loses its affordance — its subtree is now on
      // screen. Everything else is unchanged.
      nodes: [
        ...prev.nodes.map((n) =>
          n.id === node.id ? { ...n, expandable: false } : n,
        ),
        a,
        b,
      ],
      edges: [
        ...prev.edges,
        { id: `${node.id}-${a.id}`, source: node.id, target: a.id },
        { id: `${node.id}-${b.id}`, source: node.id, target: b.id },
      ],
    }));
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Unfold data={data} onNodeExpand={expand} />
      <Panel>
        <div style={{ color: "#a89890", marginBottom: 4 }}>
          click the ring around a leaf to expand it
        </div>
        <div>nodes: {data.nodes.length}</div>
        <div>edges: {data.edges.length}</div>
      </Panel>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        top: 12,
        width: 240,
        padding: "10px 12px",
        background: "rgba(20, 10, 14, 0.85)",
        border: "1px solid #3a2030",
        borderRadius: 4,
        color: "#d8d0c8",
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        lineHeight: 1.4,
        pointerEvents: "none",
      }}
    >
      {children}
    </div>
  );
}
