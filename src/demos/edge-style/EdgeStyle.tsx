import { Unfold, type UnfoldData, type UnfoldStyle } from "../../lib";

// `UnfoldStyle.edge` is the global look-and-feel surface for every edge's
// particle stream. Same data + same flow, four very different looks.
//
//   - default   the baked-in tuning (density 4000, streams 30, etc.)
//   - smoke     sparse, fat, slow wisps — "flowing organic mist"
//   - lightning fast travel + long streaks + many bright glints
//   - data wire dense + many tight streams + minimal motion blur:
//               reads as a hard wire with discrete grains running along it

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

const styles: { label: string; style: UnfoldStyle }[] = [
  { label: "default", style: {} },
  {
    label: "smoke",
    style: {
      edge: {
        density: 2500,
        streams: 8,
        wispAmplitude: 0.45,
        wispStretch: 1.6,
        wispMorphSpeed: 0.4,
        streakLength: 0.3,
        speed: 0.2,
      },
    },
  },
  {
    label: "lightning",
    style: {
      edge: {
        density: 5500,
        streams: 60,
        wispAmplitude: 0.08,
        streakLength: 1.8,
        speed: 1.1,
        glintRatio: 0.18,
        glintIntensity: 3.0,
        shimmer: 0.4,
      },
    },
  },
  {
    label: "data wire",
    style: {
      edge: {
        density: 7000,
        streams: 55,
        wispAmplitude: 0.04,
        wispStretch: 0.3,
        streakLength: 0.1,
        speed: 0.5,
        glintRatio: 0.05,
      },
    },
  },
];

export function EdgeStyle() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        width: "100%",
        height: "100%",
        gap: 1,
      }}
    >
      {styles.map(({ label, style }) => (
        <Pane key={label} label={label}>
          <Unfold data={data} style={style} />
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
