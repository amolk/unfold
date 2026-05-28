import React, { useMemo, useState } from "react";
import { useControls } from "leva";
import { Unfold, type UnfoldEdge, type UnfoldNode } from "../lib";
import { applyFlowPreset, buildDemoData, type FlowPreset } from "./demo-data";
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
  // "auto layout" off → caller supplies the prototype's hand-placed 3D
  // positions; on → caller omits positions/controls and the library lays the
  // tree out with its layered algorithm. "edge flow" picks an EdgeFlow preset.
  const { autoLayout, flowPreset } = useControls("Demo", {
    autoLayout: false,
    flowPreset: {
      // Default to the two-color stable+crisis mix so the demo opens on the
      // prototype's recognizable look; "single" is a single-color stream.
      value: "two",
      options: ["single", "two", "three", "eight"],
      label: "edge flow",
    },
  });
  const theme = useUnfoldThemeControls();
  const style = useUnfoldStyleControls();

  const baseData = useMemo(
    () => buildDemoData(9143, 4, { positioned: !autoLayout }),
    [autoLayout],
  );
  const stable = theme.categories?.stable ?? "#8CD0FF";
  const crisis = theme.categories?.crisis ?? "#FFB060";
  const data = useMemo(
    () => applyFlowPreset(baseData, flowPreset as FlowPreset, [stable, crisis]),
    [baseData, flowPreset, stable, crisis],
  );

  // Last hovered / clicked targets, for the side panel below. Hover state is
  // cleared on `null` from onNodeHover / onEdgeHover (i.e. pointer-out). The
  // click state is sticky until a background click resets it.
  const [hovered, setHovered] = useState<HoverTarget>(null);
  const [clicked, setClicked] = useState<HoverTarget>(null);

  return (
    <Boundary>
      <Unfold
        data={data}
        theme={theme}
        style={style}
        onNodeHover={(node) => setHovered(node ? { kind: "node", item: node } : null)}
        onEdgeHover={(edge) => setHovered(edge ? { kind: "edge", item: edge } : null)}
        onNodeClick={(node) => setClicked({ kind: "node", item: node })}
        onEdgeClick={(edge) => setClicked({ kind: "edge", item: edge })}
        onBackgroundClick={() => setClicked(null)}
      />
      <SidePanel hovered={hovered} clicked={clicked} />
    </Boundary>
  );
}

type HoverTarget =
  | { kind: "node"; item: UnfoldNode }
  | { kind: "edge"; item: UnfoldEdge }
  | null;

/** Read-only inspector showing the last hovered + last clicked item. Lives in
 *  the demo so the library doesn't ship a DOM overlay. */
function SidePanel({
  hovered,
  clicked,
}: {
  hovered: HoverTarget;
  clicked: HoverTarget;
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
      <Row label="hover" target={hovered} />
      <div style={{ height: 6 }} />
      <Row label="click" target={clicked} />
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
