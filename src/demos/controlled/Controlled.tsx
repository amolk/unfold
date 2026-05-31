import { useState } from "react";
import { Unfold, type UnfoldData, type NodeId } from "../../lib";
import { ControlPanel, Segmented, Button, tokens } from "../../demo-shell";

// Demonstrates controlled focus + selection: the parent owns the state and
// passes it down, with buttons that mutate it externally.
const data: UnfoldData = {
  nodes: [
    { id: "root" },
    { id: "a" },
    { id: "b" },
    { id: "c" },
    { id: "a1" },
    { id: "a2" },
  ],
  edges: [
    { id: "e1", source: "root", target: "a" },
    { id: "e2", source: "root", target: "b" },
    { id: "e3", source: "root", target: "c" },
    { id: "e4", source: "a", target: "a1" },
    { id: "e5", source: "a", target: "a2" },
  ],
};

const NODE_IDS: NodeId[] = ["root", "a", "b", "c", "a1", "a2"];

export function Controlled() {
  const [focus, setFocus] = useState<NodeId | null>("root");
  const [selected, setSelected] = useState<NodeId[]>(["a", "a1"]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Unfold
        data={data}
        focusedNodeId={focus}
        selectedNodeIds={selected}
        onFocusChange={setFocus}
        onSelectionChange={setSelected}
      />
      <ControlPanel>
        {/* focus is mutually-exclusive → Segmented */}
        <Segmented
          label="focus"
          options={NODE_IDS}
          value={focus ?? ("" as NodeId)}
          onChange={setFocus}
        />
        {/* selection is multi-toggle → independent Buttons */}
        <div style={{ color: tokens.inkDim, marginBottom: 4 }}>selected (toggle)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {NODE_IDS.map((id) => (
            <Button
              key={id}
              active={selected.includes(id)}
              onClick={() =>
                setSelected((s) =>
                  s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
                )
              }
            >
              {id}
            </Button>
          ))}
        </div>
      </ControlPanel>
    </div>
  );
}
