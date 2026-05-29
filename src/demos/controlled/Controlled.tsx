import { useState } from "react";
import { Unfold, type NodeId, type UnfoldData } from "../../lib";

// `focusedNodeId` and `selectedNodeIds` are each independently
// controlled-or-uncontrolled. Pass them and the library never mutates;
// omit them and it manages an internal slot. The `onFocusChange` /
// `onSelectionChange` callbacks fire either way — they're observation, not
// the source of truth.
//
// Here both are controlled: the buttons set state directly, and the
// callbacks just keep our state in sync when the user clicks a node in
// the scene.

const data: UnfoldData = {
  nodes: [
    { id: "root", label: "root" },
    { id: "a", label: "a" },
    { id: "b", label: "b" },
    { id: "c", label: "c" },
    { id: "d", label: "d" },
  ],
  edges: [
    { id: "e1", source: "root", target: "a" },
    { id: "e2", source: "root", target: "b" },
    { id: "e3", source: "a", target: "c" },
    { id: "e4", source: "b", target: "d" },
  ],
};

const NODE_IDS: NodeId[] = data.nodes.map((n) => n.id);

export function Controlled() {
  const [focused, setFocused] = useState<NodeId | null>("root");
  const [selected, setSelected] = useState<NodeId[]>([]);

  const toggle = (id: NodeId) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Unfold
        data={data}
        focusedNodeId={focused}
        selectedNodeIds={selected}
        onFocusChange={setFocused}
        onSelectionChange={setSelected}
        onNodeClick={(node) => toggle(node.id)}
      />
      <Panel>
        <Row label="focused">{focused ?? "—"}</Row>
        <Row label="selected">
          {selected.length === 0 ? "—" : selected.join(", ")}
        </Row>
        <div style={{ marginTop: 10 }}>
          <div style={btnRowLabel}>focus</div>
          <div style={btnRow}>
            {NODE_IDS.map((id) => (
              <button
                key={id}
                onClick={() => setFocused(id)}
                style={focused === id ? btnActive : btn}
              >
                {id}
              </button>
            ))}
            <button onClick={() => setFocused(null)} style={btn}>
              clear
            </button>
          </div>
          <div style={{ ...btnRowLabel, marginTop: 8 }}>select</div>
          <div style={btnRow}>
            <button onClick={() => setSelected(NODE_IDS)} style={btn}>
              all
            </button>
            <button onClick={() => setSelected([])} style={btn}>
              none
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ color: "#a89890", marginBottom: 2 }}>{label}</div>
      <div style={{ wordBreak: "break-word" }}>{children}</div>
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
        background: "rgba(20, 10, 14, 0.9)",
        border: "1px solid #3a2030",
        borderRadius: 4,
        color: "#d8d0c8",
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "3px 8px",
  background: "transparent",
  color: "#d8d0c8",
  border: "1px solid #3a2030",
  borderRadius: 3,
  fontFamily: "inherit",
  fontSize: 11,
  cursor: "pointer",
};

const btnActive: React.CSSProperties = {
  ...btn,
  background: "rgba(255, 176, 96, 0.18)",
  borderColor: "#ffb060",
  color: "#ffd8a0",
};

const btnRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
};

const btnRowLabel: React.CSSProperties = {
  color: "#a89890",
  marginBottom: 4,
};
