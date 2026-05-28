import { demos } from "./registry";

export function Landing() {
  return (
    <article style={{ padding: "64px 40px", maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 16px", fontSize: 36, fontWeight: 600 }}>
        Unfold
      </h1>
      <p style={{ margin: "0 0 24px", fontSize: 18, color: "#d8d0c8", lineHeight: 1.5 }}>
        A React component for 3D graph visualizations with flowing particle
        edges. Drop in nodes and edges, get back an interactive scene.
      </p>

      <p style={{ margin: "0 0 16px", color: "#a89890", lineHeight: 1.65 }}>
        Unfold renders branching structures — decision trees, narrative
        timelines, dependency graphs — as glowing nodes connected by streams
        of colored particles. The particle flow is the point: weight, color
        mix, and speed per edge let the visualization carry quantitative
        signal, not just topology.
      </p>

      <p style={{ margin: "0 0 32px", color: "#a89890", lineHeight: 1.65 }}>
        Built on React Three Fiber with custom GLSL shaders. Layered, radial,
        or hand-positioned layouts. Controlled or uncontrolled selection,
        focus, and lazy expansion. Theme-able. One component, one prop.
      </p>

      <section style={{ marginBottom: 32 }}>
        <div
          style={{
            color: "#a89890",
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          Inspiration
        </div>
        <p style={{ margin: 0, color: "#a89890", lineHeight: 1.65 }}>
          The look borrows from Apple TV+'s{" "}
          <em style={{ color: "#d8d0c8" }}>Foundation</em>: Hari Seldon's{" "}
          <em style={{ color: "#d8d0c8" }}>Prime Radiant</em> — glowing nodes
          drifting in deep space, threaded by streams of particles — the
          sand-curtain title sequence where information pours and reforms,
          and the slow, breathing murals of the Emperor's palace on Trantor.
          Branching narratives as a living, three-dimensional object.
        </p>
      </section>

      <div style={{ display: "flex", gap: 12, marginBottom: 48 }}>
        <a href={`#/${demos[0].slug}`} style={primaryButtonStyle}>
          See the demos →
        </a>
        <a
          href="https://github.com/amolk/unfold"
          style={secondaryButtonStyle}
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>

      <section>
        <div
          style={{
            color: "#a89890",
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          Quick start
        </div>
        <pre style={codeBlockStyle}>
          <code>{quickStart}</code>
        </pre>
      </section>
    </article>
  );
}

const quickStart = `import { Unfold } from "unfold";

<Unfold
  data={{
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ id: "e", source: "a", target: "b" }],
  }}
/>`;

const primaryButtonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 18px",
  background: "#ffb060",
  color: "#1a0810",
  borderRadius: 4,
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
};

const secondaryButtonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 18px",
  background: "transparent",
  color: "#d8d0c8",
  border: "1px solid #3a2030",
  borderRadius: 4,
  textDecoration: "none",
  fontSize: 14,
};

const codeBlockStyle: React.CSSProperties = {
  margin: 0,
  padding: "16px 18px",
  background: "#0a0406",
  border: "1px solid #2a1820",
  borderRadius: 6,
  color: "#d8d0c8",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12.5,
  lineHeight: 1.6,
  overflow: "auto",
};
