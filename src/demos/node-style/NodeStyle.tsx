import {
  Unfold,
  type UnfoldData,
  type UnfoldStyle,
  type UnfoldTheme,
} from "../../lib";

// Six ways to color and shape nodes, all rendering the same topology.
//
// Style knobs (`UnfoldStyle.node`):
//   - default     barely-visible sphere, gold (the built-in default)
//   - solid       opaque larger sphere, cool blue
//   - soft        large translucent halo, warm rose
//   - pinpoint    tiny / no body, sage green — particle bulge only
//
// Color resolution (`theme.categories`, `theme.highlight`):
//   - categories  per-node `category` tag mapped to a color via
//                 `theme.categories`. Multi-color graph from one prop.
//   - highlight   `theme.highlight` rim tint applied to nodes whose id
//                 appears in `selectedNodeIds`. Two nodes pre-selected
//                 so the tint is visible without interaction.

const data: UnfoldData = {
  nodes: [
    { id: "root", category: "root" },
    { id: "a", category: "branch" },
    { id: "b", category: "branch" },
    { id: "c", category: "branch" },
    { id: "a1", category: "leaf" },
    { id: "a2", category: "leaf" },
  ],
  edges: [
    { id: "e1", source: "root", target: "a" },
    { id: "e2", source: "root", target: "b" },
    { id: "e3", source: "root", target: "c" },
    { id: "e4", source: "a", target: "a1" },
    { id: "e5", source: "a", target: "a2" },
  ],
};

interface Preset {
  label: string;
  style: UnfoldStyle;
  theme?: UnfoldTheme;
  selected?: string[];
}

const presets: Preset[] = [
  {
    label: "default · gold",
    style: {},
  },
  {
    label: "solid · blue",
    style: { node: { baseRadius: 0.35, opacity: 0.85, rimStrength: 2 } },
    theme: { defaultNodeColor: "#5BA3D9" },
  },
  {
    label: "soft · rose",
    style: { node: { baseRadius: 0.55, opacity: 0.25, rimStrength: 1 } },
    theme: { defaultNodeColor: "#E07090" },
  },
  {
    label: "pinpoint · sage",
    style: { node: { baseRadius: 0.06, opacity: 0, rimStrength: 8 } },
    theme: { defaultNodeColor: "#9CC68B" },
  },
  {
    label: "categories · multi",
    // Bump the spheres up so the per-category colors read clearly. Theme
    // maps each `node.category` to a color; nodes with no matching entry
    // fall back to `defaultNodeColor`.
    style: { node: { baseRadius: 0.3, opacity: 0.75, rimStrength: 2 } },
    theme: {
      categories: {
        root: "#D4A642",
        branch: "#5BA3D9",
        leaf: "#E07090",
      },
    },
  },
  {
    label: "highlight · selected",
    // `theme.highlight` is the rim color applied to nodes in
    // `selectedNodeIds`. Pre-selecting two nodes makes it visible without
    // requiring interaction.
    style: { node: { baseRadius: 0.3, opacity: 0.6, rimStrength: 3 } },
    theme: { highlight: "#FFD060" },
    selected: ["a", "a2"],
  },
];

export function NodeStyle() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        width: "100%",
        height: "100%",
        gap: 1,
      }}
    >
      {presets.map(({ label, style, theme, selected }) => (
        <Pane key={label} label={label}>
          <Unfold
            data={data}
            style={style}
            theme={theme}
            selectedNodeIds={selected}
          />
        </Pane>
      ))}
    </div>
  );
}

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {children}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 10,
          color: "#d8d0c8",
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
          background: "rgba(20, 10, 14, 0.75)",
          padding: "3px 7px",
          borderRadius: 3,
          pointerEvents: "none",
        }}
      >
        {label}
      </div>
    </div>
  );
}
