import React, { useEffect, useMemo, useState } from "react";
import { useControls } from "leva";
import { Unfold, type NodeId, type UnfoldEdge, type UnfoldNode } from "../lib";
import { applyFlowPreset, buildDemoData, type FlowPreset } from "./demo-data";
import {
  createExplorer,
  expandedIds as explorerExpandedIds,
  expandNode,
  toggleExpanded,
  toUnfoldData,
  withFocus,
  type ExplorerMode,
} from "./explorer-state";
import { useUnfoldStyleControls, useUnfoldThemeControls } from "./leva-panels";

/** Catches render errors from the R3F tree and shows the stack inline, instead
 *  of a blank canvas. Lives in the demo, not the library — consumers bring
 *  their own error boundary. */
class Boundary extends React.Component<
  { children: React.ReactNode },
  { err: Error | null }
> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error("Render boundary caught:", err, info);
  }
  render() {
    if (this.state.err) {
      return (
        <pre
          style={{
            position: "fixed",
            inset: 16,
            color: "#ff8888",
            background: "#1a0a0a",
            padding: 16,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            fontFamily: "ui-monospace, monospace",
            fontSize: 12,
            zIndex: 9999,
          }}
        >
          {String(this.state.err.stack ?? this.state.err.message)}
        </pre>
      );
    }
    return this.props.children;
  }
}

export function App() {
  // "explorer" picks the demo's data source:
  //   - "off"          → static buildDemoData full tree (the original tracer
  //                      bullet; respects autoLayout for omit-positions).
  //   - "single-path"  → root → focus chain + focus's children; click moves
  //                      focus. Children generated lazily.
  //   - "toggle"       → click a node to toggle its branch open/closed.
  //                      Affordance ring shows on closed branches.
  //   - "full-tree"    → entire pre-generated tree (no affordance needed).
  // "auto layout" only applies in "off" mode (it would conflict with the
  // explorer's hand-built positions).
  const { explorer, autoLayout, flowPreset, controlled, multiSelect } =
    useControls("Demo", {
      explorer: {
        value: "off" as "off" | ExplorerMode,
        options: ["off", "single-path", "toggle", "full-tree"],
        label: "explorer",
      },
      autoLayout: { value: false, label: "auto layout" },
      flowPreset: {
        // Default to the two-color stable+crisis mix so the demo opens on the
        // prototype's recognizable look; "single" is a single-color stream.
        value: "two",
        options: ["single", "two", "three", "eight"],
        label: "edge flow",
      },
      controlled: { value: true, label: "controlled mode" },
      multiSelect: { value: false, label: "multi-select" },
    });
  const theme = useUnfoldThemeControls();
  const style = useUnfoldStyleControls();

  // --- Static path (explorer === "off") ---------------------------------
  // Existing tracer-bullet behavior: buildDemoData yields a full static
  // tree; autoLayout toggles whether positions are baked in.
  const staticData = useMemo(
    () => buildDemoData(9143, 4, { positioned: !autoLayout }),
    [autoLayout],
  );

  // --- Explorer path ----------------------------------------------------
  // Single explorer state slot, re-created when the user changes mode (so
  // toggling between single-path and toggle doesn't carry over previously-
  // expanded branches that don't make sense in the new mode).
  const [explorerState, setExplorerState] = useState(() =>
    createExplorer({ mode: "single-path" }),
  );
  useEffect(() => {
    if (explorer === "off") return;
    setExplorerState(createExplorer({ mode: explorer as ExplorerMode }));
  }, [explorer]);

  // Project the explorer state into UnfoldData. Re-runs when state changes
  // (via the dispatch helpers below) or when the demo's flow preset flips.
  const explorerData = useMemo(() => {
    return toUnfoldData(explorerState, {
      markExpandable: explorerState.mode !== "full-tree",
    });
  }, [explorerState]);

  // Which dataset to feed the library this render. Just a switch — neither
  // path mutates the other.
  const baseData = explorer === "off" ? staticData : explorerData;

  const stable = theme.categories?.stable ?? "#8CD0FF";
  const crisis = theme.categories?.crisis ?? "#FFB060";
  const data = useMemo(
    () => applyFlowPreset(baseData, flowPreset as FlowPreset, [stable, crisis]),
    [baseData, flowPreset, stable, crisis],
  );

  // expandedNodeIds for the library: in explorer mode we mirror the
  // state machine's view (so the affordance hides nodes whose subtree is
  // already on screen). In "off" mode there's no expansion concept — pass
  // an empty array.
  const expandedIds = useMemo(
    () => (explorer === "off" ? [] : explorerExpandedIds(explorerState)),
    [explorer, explorerState],
  );

  // Last hovered / clicked targets, for the side panel below. Hover state is
  // cleared on `null` from onNodeHover / onEdgeHover (i.e. pointer-out). The
  // click state is sticky until a background click resets it.
  const [hovered, setHovered] = useState<HoverTarget>(null);
  const [clicked, setClicked] = useState<HoverTarget>(null);

  // Controlled state owned by the demo. In "controlled mode" these are
  // passed to <Unfold>; in uncontrolled mode they're omitted and the
  // library manages internal state, but we still listen to the change
  // callbacks for the side-panel readout.
  const [focused, setFocused] = useState<NodeId | null>(() => data.nodes[0]?.id ?? null);
  const [selected, setSelected] = useState<NodeId[]>([]);

  // Seed focus on the root when the dataset's first id changes (e.g. when
  // the procedural generator's seed flips). Without this, swapping data
  // would leave `focused` pointing at a stale id.
  useEffect(() => {
    setFocused(data.nodes[0]?.id ?? null);
    setSelected([]);
  }, [data]);

  // Selection toggle: in single-select mode replace; in multi-select mode
  // add/remove. Used in BOTH controlled and uncontrolled paths — in
  // uncontrolled mode we still want the demo to drive selection, so we
  // wire onNodeClick to update local state and (when controlled) the prop
  // is what the library reads. In uncontrolled mode the library's internal
  // selectedNodeIds stays empty and the demo's local state is shown only
  // in the side panel.
  const toggleSelection = (id: NodeId) => {
    setSelected((prev) =>
      multiSelect
        ? prev.includes(id)
          ? prev.filter((x) => x !== id)
          : [...prev, id]
        : prev.includes(id) && prev.length === 1
          ? []
          : [id],
    );
  };

  // Click dispatcher for the explorer modes. Routes node clicks to the
  // appropriate state transition; in "off" mode this is a no-op.
  const handleNodeClickForExplorer = (node: UnfoldNode) => {
    if (explorer === "off") return;
    if (explorerState.mode === "single-path") {
      setExplorerState((s) => withFocus(s, node.id));
    } else if (explorerState.mode === "toggle") {
      setExplorerState((s) => toggleExpanded(s, node.id));
    } else {
      // full-tree: click only moves focus for the camera.
      setExplorerState((s) => withFocus(s, node.id));
    }
  };
  const handleNodeExpandForExplorer = (node: UnfoldNode) => {
    if (explorer === "off") return;
    setExplorerState((s) => expandNode(s, node.id));
  };

  return (
    <Boundary>
      <Unfold
        data={data}
        theme={theme}
        style={style}
        expandedNodeIds={expandedIds}
        focusedNodeId={controlled ? focused : undefined}
        selectedNodeIds={controlled ? selected : undefined}
        onFocusChange={(id) => {
          // Always logged for visibility. In controlled mode this is the
          // signal to update our state; in uncontrolled mode it's purely
          // observational because the library has already updated its
          // internal slot.
          if (controlled) setFocused(id);
        }}
        onSelectionChange={(ids) => {
          if (controlled) setSelected(ids);
        }}
        onNodeHover={(node) => setHovered(node ? { kind: "node", item: node } : null)}
        onEdgeHover={(edge) => setHovered(edge ? { kind: "edge", item: edge } : null)}
        onNodeClick={(node) => {
          setClicked({ kind: "node", item: node });
          toggleSelection(node.id);
          handleNodeClickForExplorer(node);
        }}
        onEdgeClick={(edge) => setClicked({ kind: "edge", item: edge })}
        onBackgroundClick={() => {
          setClicked(null);
          setSelected([]);
        }}
        onNodeExpand={handleNodeExpandForExplorer}
      />
      <SidePanel
        hovered={hovered}
        clicked={clicked}
        focused={focused}
        selected={selected}
        controlled={controlled}
        mode={explorer === "off" ? null : (explorerState.mode as ExplorerMode)}
      />
    </Boundary>
  );
}

type HoverTarget =
  | { kind: "node"; item: UnfoldNode }
  | { kind: "edge"; item: UnfoldEdge }
  | null;

/** Read-only inspector showing the last hovered + last clicked item plus the
 *  demo's controlled-state snapshot. Lives in the demo so the library
 *  doesn't ship a DOM overlay. */
function SidePanel({
  hovered,
  clicked,
  focused,
  selected,
  controlled,
  mode,
}: {
  hovered: HoverTarget;
  clicked: HoverTarget;
  focused: NodeId | null;
  selected: NodeId[];
  controlled: boolean;
  mode: ExplorerMode | null;
}) {
  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        width: 320,
        background: "rgba(20, 10, 14, 0.85)",
        border: "1px solid #3a2030",
        borderRadius: 6,
        padding: "12px 14px",
        color: "#d8d0c8",
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        lineHeight: 1.45,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <div style={{ color: "#a89890", marginBottom: 6 }}>
        explorer: {mode ?? "off"} · {controlled ? "controlled" : "uncontrolled"}
      </div>
      <Row label="hover" target={hovered} />
      <div style={{ height: 6 }} />
      <Row label="click" target={clicked} />
      <div style={{ height: 6 }} />
      <div>
        <div style={{ color: "#a89890", marginBottom: 2 }}>focused</div>
        <div>{focused ?? "—"}</div>
      </div>
      <div style={{ height: 6 }} />
      <div>
        <div style={{ color: "#a89890", marginBottom: 2 }}>
          selected ({selected.length})
        </div>
        <div style={{ wordBreak: "break-word" }}>
          {selected.length === 0 ? "—" : selected.join(", ")}
        </div>
      </div>
    </div>
  );
}

function Row({ label, target }: { label: string; target: HoverTarget }) {
  const head = !target
    ? "—"
    : `${target.kind} ${target.kind === "node" ? target.item.id : `${target.item.source} → ${target.item.target}`}`;
  return (
    <div>
      <div style={{ color: "#a89890", marginBottom: 2 }}>{label}</div>
      <div>{head}</div>
      {target?.item.data != null && (
        <pre
          style={{
            margin: "4px 0 0",
            color: "#c0b8b0",
            background: "rgba(0,0,0,0.25)",
            padding: "4px 6px",
            borderRadius: 3,
            maxHeight: 80,
            overflow: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {JSON.stringify(target.item.data, null, 2)}
        </pre>
      )}
    </div>
  );
}
