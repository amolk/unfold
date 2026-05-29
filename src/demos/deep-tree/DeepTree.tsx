import { useMemo, useState } from "react";
import { Unfold, type UnfoldLayout } from "../../lib";
import { buildDemoData } from "../_data/demoData";

// `buildDemoData(..., { positioned: false })` returns topology only — no
// positions, no edge controls — so the library's chosen layout drives the
// visual placement. depth=4 yields ~100 nodes.
//
//   - "layered"  conical 3D fan: each parent's children radiate outward in
//                a cone aligned with that parent's incoming direction. The
//                tree-of-life / branching look.
//   - "radial"   flat concentric rings on the y/z plane: root at origin,
//                each subtree gets an angular wedge proportional to its
//                leaf count. The classical sunburst look.

const LAYOUTS: UnfoldLayout[] = ["layered", "radial", "hierarchical"];

export function Tree() {
  const [seed, setSeed] = useState(9143);
  const [layout, setLayout] = useState<UnfoldLayout>("layered");
  const data = useMemo(
    () => buildDemoData(seed, 4, { positioned: false }),
    [seed],
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Unfold
        data={data}
        layout={layout}
        // depth=4 trees grow to ~y=11; push the lookat up so the root at
        // y=0 lands near the bottom of the viewport instead of mid-screen.
        initialCamera={{ position: [9, 1.2, 0], target: [0, 5, 0] }}
      />
      <div style={panelStyle}>
        <div style={{ color: "#a89890", marginBottom: 4 }}>layout</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {LAYOUTS.map((l) => (
            <button
              key={l}
              onClick={() => setLayout(l)}
              style={layout === l ? buttonActive : button}
            >
              {l}
            </button>
          ))}
        </div>
        <div style={{ color: "#a89890", marginBottom: 4 }}>seed: {seed}</div>
        <div>nodes: {data.nodes.length}</div>
        <div>edges: {data.edges.length}</div>
        <button
          onClick={() => setSeed(Math.floor(Math.random() * 0x7fffffff))}
          style={{ ...buttonActive, marginTop: 8 }}
        >
          regenerate
        </button>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: "absolute",
  right: 12,
  top: 12,
  width: 200,
  padding: "10px 12px",
  background: "rgba(20, 10, 14, 0.85)",
  border: "1px solid #3a2030",
  borderRadius: 4,
  color: "#d8d0c8",
  fontFamily: "ui-monospace, monospace",
  fontSize: 11,
  lineHeight: 1.5,
};

const button: React.CSSProperties = {
  padding: "4px 10px",
  background: "transparent",
  color: "#d8d0c8",
  border: "1px solid #3a2030",
  borderRadius: 3,
  fontFamily: "inherit",
  fontSize: 11,
  cursor: "pointer",
};

const buttonActive: React.CSSProperties = {
  ...button,
  background: "rgba(255, 176, 96, 0.18)",
  borderColor: "#ffb060",
  color: "#ffd8a0",
};
