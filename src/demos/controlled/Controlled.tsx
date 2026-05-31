import { useState } from "react";
import { Unfold, type UnfoldData, type NodeId, type EdgeId } from "../../lib";
import { ControlPanel, Segmented, Button, tokens } from "../../demo-shell";

// Demonstrates controlled focus + node/edge selection: the parent owns all the
// state and passes it down. The "selectable" toggles gate click-driven
// selection per kind — note the id buttons still mutate selection directly even
// when clicks are gated off, showing the two paths are independent.
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
const EDGE_IDS: EdgeId[] = ["e1", "e2", "e3", "e4", "e5"];

/** Toggle membership of `id` in a selection array (immutably). */
function toggle<T>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function Controlled() {
  const [focus, setFocus] = useState<NodeId | null>("root");
  const [selectedNodes, setSelectedNodes] = useState<NodeId[]>(["a", "a1"]);
  const [selectedEdges, setSelectedEdges] = useState<EdgeId[]>(["e4"]);
  const [nodesSelectable, setNodesSelectable] = useState(true);
  const [edgesSelectable, setEdgesSelectable] = useState(true);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Unfold
        data={data}
        focusedNodeId={focus}
        selectedNodeIds={selectedNodes}
        selectedEdgeIds={selectedEdges}
        nodesSelectable={nodesSelectable}
        edgesSelectable={edgesSelectable}
        onFocusChange={setFocus}
        onSelectionChange={setSelectedNodes}
        onEdgeSelectionChange={setSelectedEdges}
      />
      <ControlPanel>
        {/* focus is mutually-exclusive → Segmented */}
        <Segmented
          label="focus"
          options={NODE_IDS}
          value={focus ?? ("" as NodeId)}
          onChange={setFocus}
        />

        {/* per-kind selectability gate → independent on/off toggles */}
        <div style={{ color: tokens.inkDim, marginBottom: 4 }}>selectable (click)</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          <Button active={nodesSelectable} onClick={() => setNodesSelectable((v) => !v)}>
            nodes
          </Button>
          <Button active={edgesSelectable} onClick={() => setEdgesSelectable((v) => !v)}>
            edges
          </Button>
        </div>

        {/* selection is multi-toggle → independent Buttons. These mutate state
            directly, so they work even when click-selection is gated off. */}
        <div style={{ color: tokens.inkDim, marginBottom: 4 }}>selected nodes</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
          {NODE_IDS.map((id) => (
            <Button
              key={id}
              active={selectedNodes.includes(id)}
              onClick={() => setSelectedNodes((s) => toggle(s, id))}
            >
              {id}
            </Button>
          ))}
        </div>

        <div style={{ color: tokens.inkDim, marginBottom: 4 }}>selected edges</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {EDGE_IDS.map((id) => (
            <Button
              key={id}
              active={selectedEdges.includes(id)}
              onClick={() => setSelectedEdges((s) => toggle(s, id))}
            >
              {id}
            </Button>
          ))}
        </div>
      </ControlPanel>
    </div>
  );
}
