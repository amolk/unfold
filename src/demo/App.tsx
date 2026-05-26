import React, { useMemo } from "react";
import { Unfold } from "../lib";
import { buildDemoData } from "./demo-data";
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
  const data = useMemo(() => buildDemoData(), []);
  const theme = useUnfoldThemeControls();
  const style = useUnfoldStyleControls();
  return (
    <Boundary>
      <Unfold data={data} theme={theme} style={style} />
    </Boundary>
  );
}
