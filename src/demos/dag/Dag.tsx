import { useMemo, useState } from "react";
import { Unfold, type UnfoldLayout } from "../../lib";
import { buildDag } from "../_data/buildDag";

// `buildDag` returns topology only — six bands with 1–3 parents per node
// drawn from the previous one or two bands. The layout toggle picks how
// the library places that topology in space:
//
//   - "hierarchical"  Sugiyama-style: longest-path layer assignment,
//                     barycenter crossing minimization, even per-layer
//                     coords. The right pick for actual DAGs.
//   - "layered"       Conical 3D fan, treating the DAG as a tree via
//                     primary-parent reduction (each node picks its
//                     min-depth parent). Skip-connections still render
//                     but don't influence position.
//   - "radial"        Flat sunburst on the y/z plane, same primary-parent
//                     reduction. Reads as a tree-of-DAGs.

const LAYOUTS: UnfoldLayout[] = ["hierarchical", "layered", "radial"];

export function Dag() {
  const [seed, setSeed] = useState(0xc0ffee);
  const [layout, setLayout] = useState<UnfoldLayout>("layered");
  const data = useMemo(() => buildDag(seed, 6, 6), [seed]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Unfold data={data} layout={layout} />
      <div style={panelStyle}>
        <div style={{ color: "#a89890", marginBottom: 4 }}>layout</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
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
  width: 220,
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
