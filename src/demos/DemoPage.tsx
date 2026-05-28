import { useEffect, useRef, useState } from "react";
import type { Demo } from "./registry";

export function DemoPage({ demo }: { demo: Demo }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const enterFullscreen = () => {
    stageRef.current?.requestFullscreen?.().catch(() => {});
  };

  const Component = demo.Component;

  return (
    <article style={{ padding: "32px 40px", maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 600 }}>
          {demo.title}
        </h1>
        <p style={{ margin: 0, color: "#a89890", lineHeight: 1.5, fontSize: 14 }}>
          {demo.blurb}
        </p>
      </header>

      <section style={{ marginBottom: 24 }}>
        <SectionLabel>Live</SectionLabel>
        <div
          ref={stageRef}
          style={{
            position: "relative",
            width: "100%",
            height: isFullscreen ? "100vh" : 480,
            background: "#1a0810",
            border: "1px solid #2a1820",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <Component />
          {!isFullscreen && (
            <button
              onClick={enterFullscreen}
              style={fullscreenButtonStyle}
              title="Fullscreen"
              aria-label="Fullscreen"
            >
              ⛶
            </button>
          )}
        </div>
      </section>

      <section>
        <SectionLabel>
          Source · <code style={{ color: "#a89890" }}>{demo.sourcePath}</code>
        </SectionLabel>
        <pre
          style={{
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
          }}
        >
          <code>{demo.source}</code>
        </pre>
      </section>
    </article>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: "#a89890",
        fontSize: 11,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

const fullscreenButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: 10,
  right: 10,
  width: 32,
  height: 32,
  background: "rgba(20, 10, 14, 0.7)",
  border: "1px solid #3a2030",
  borderRadius: 4,
  color: "#d8d0c8",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10,
};
