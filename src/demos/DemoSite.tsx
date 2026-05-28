import { useEffect, useState } from "react";
import { DemoPage } from "./DemoPage";
import { demos, findDemo } from "./registry";

function readSlug(): string {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return hash || demos[0].slug;
}

export function DemoSite() {
  const [slug, setSlug] = useState<string>(readSlug);

  useEffect(() => {
    const onHash = () => setSlug(readSlug());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const demo = findDemo(slug) ?? demos[0];

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          background: "#0a0406",
          borderRight: "1px solid #2a1820",
          padding: "24px 0",
        }}
      >
        <div
          style={{
            padding: "0 20px 20px",
            color: "#d8d0c8",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Unfold · demos
        </div>
        <nav>
          {demos.map((d) => {
            const active = d.slug === demo.slug;
            return (
              <a
                key={d.slug}
                href={`#/${d.slug}`}
                style={{
                  display: "block",
                  padding: "8px 20px",
                  color: active ? "#ffd8a0" : "#a89890",
                  background: active ? "rgba(255, 176, 96, 0.08)" : "transparent",
                  borderLeft: active
                    ? "2px solid #ffb060"
                    : "2px solid transparent",
                  textDecoration: "none",
                  fontSize: 13,
                }}
              >
                {d.title}
              </a>
            );
          })}
        </nav>
      </aside>
      <main style={{ flex: 1, minWidth: 0 }}>
        <DemoPage demo={demo} />
      </main>
    </div>
  );
}
