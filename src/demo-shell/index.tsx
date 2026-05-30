import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

// Thin presentational shell shared by the demos: the labeled comparison grid
// and the pinned control HUD that were copy-pasted (with drift) across ~8 demo
// files. Every export is one styled element — no theming engine, no layout DSL.
// Demos import these with plain relative paths so the displayed source reads as
// ordinary React (the registry rewrites only `../../lib` → `unfold`).

/** The demo chrome palette — the single source for the maroon-on-dark look. */
export const tokens = {
  ink: "#d8d0c8",
  inkDim: "#a89890",
  panelBg: "rgba(20, 10, 14, 0.85)",
  labelBg: "rgba(20, 10, 14, 0.75)",
  border: "#3a2030",
  accent: "#ffb060",
  accentInk: "#ffd8a0",
  accentBg: "rgba(255, 176, 96, 0.18)",
  mono: "ui-monospace, monospace",
} as const;

/** A labeled comparison grid. `cols`/`rows` default to a near-square layout
 *  derived from the pane count. Each pane fills its cell with a monospace
 *  caption pinned top-left. */
export function DemoGrid(props: {
  panes: { label: string; children: ReactNode }[];
  cols?: number;
  rows?: number;
  gap?: number;
}): JSX.Element {
  const { panes, gap = 1 } = props;
  const cols = props.cols ?? Math.ceil(Math.sqrt(panes.length));
  const rows = props.rows ?? Math.ceil(panes.length / cols);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        width: "100%",
        height: "100%",
        gap,
      }}
    >
      {panes.map((p) => (
        <div key={p.label} style={{ position: "relative", width: "100%", height: "100%" }}>
          {p.children}
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 10,
              color: tokens.ink,
              fontFamily: tokens.mono,
              fontSize: 11,
              background: tokens.labelBg,
              padding: "3px 7px",
              borderRadius: 3,
              pointerEvents: "none",
            }}
          >
            {p.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The pinned glass HUD for interactive demos. `readOnly` makes it
 *  pointer-events:none for pure-readout panels. */
export function ControlPanel(props: {
  children: ReactNode;
  width?: number;
  side?: "left" | "right";
  readOnly?: boolean;
}): JSX.Element {
  const { children, width = 220, side = "right", readOnly } = props;
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        [side]: 12,
        width,
        padding: "10px 12px",
        background: tokens.panelBg,
        border: `1px solid ${tokens.border}`,
        borderRadius: 4,
        color: tokens.ink,
        fontFamily: tokens.mono,
        fontSize: 11,
        lineHeight: 1.5,
        pointerEvents: readOnly ? "none" : undefined,
      }}
    >
      {children}
    </div>
  );
}

/** A labeled row: dim label over (or beside) a value/body. */
export function Field(props: { label: ReactNode; children?: ReactNode }): JSX.Element {
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ color: tokens.inkDim }}>{props.label}</span>
      {props.children != null && <span> {props.children}</span>}
    </div>
  );
}

const buttonStyle: CSSProperties = {
  padding: "4px 10px",
  background: "transparent",
  color: tokens.ink,
  border: `1px solid ${tokens.border}`,
  borderRadius: 3,
  fontFamily: "inherit",
  fontSize: 11,
  cursor: "pointer",
};
const buttonActiveStyle: CSSProperties = {
  ...buttonStyle,
  background: tokens.accentBg,
  borderColor: tokens.accent,
  color: tokens.accentInk,
};

/** A single accent action button (e.g. "regenerate"). */
export function Button(props: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}): JSX.Element {
  return (
    <button onClick={props.onClick} style={props.active ? buttonActiveStyle : buttonStyle}>
      {props.children}
    </button>
  );
}

/** A row of mutually-exclusive buttons; the active value gets the accent. */
export function Segmented<T extends string>(props: {
  label?: ReactNode;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}): JSX.Element {
  return (
    <div style={{ marginBottom: 10 }}>
      {props.label != null && (
        <div style={{ color: tokens.inkDim, marginBottom: 4 }}>{props.label}</div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {props.options.map((o) => (
          <button
            key={o}
            onClick={() => props.onChange(o)}
            style={props.value === o ? buttonActiveStyle : buttonStyle}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Segmented-control state. Spread straight into <Segmented {...toggle} />. */
export function useToggle<T extends string>(
  options: readonly T[],
  initial?: T,
): { value: T; onChange: (v: T) => void; options: readonly T[] } {
  const [value, onChange] = useState<T>(initial ?? options[0]);
  return { value, onChange, options };
}

/** A reseed counter. `reseed()` rolls a new seed; pair with useMemo on seed. */
export function useReseed(initial = 1): { seed: number; reseed: () => void } {
  const [seed, setSeed] = useState(initial);
  const reseed = useMemo(
    () => () => setSeed(Math.floor(Math.random() * 0x7fffffff)),
    [],
  );
  return { seed, reseed };
}
