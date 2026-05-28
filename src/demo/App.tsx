import React, { useMemo } from "react";
import { useControls } from "leva";
import { Unfold } from "../lib";
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

  return (
    <Boundary>
      <Unfold data={data} theme={theme} style={style} />
    </Boundary>
  );
}
