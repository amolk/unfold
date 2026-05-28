import { useEffect, useState } from "react";
import { DemoPage } from "./DemoPage";
import { Landing } from "./Landing";
import { demos, findDemo } from "./registry";

function readSlug(): string {
  return window.location.hash.replace(/^#\/?/, "");
}

export function DemoSite() {
  const [slug, setSlug] = useState<string>(readSlug);

  useEffect(() => {
    const onHash = () => setSlug(readSlug());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Empty hash → Landing. Unknown slug also falls back to Landing rather than
  // silently rerouting, so a bad URL is obvious.
  const demo = slug ? findDemo(slug) : undefined;
  const showLanding = !slug || !demo;

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
        <a
          href="#/"
          style={{
            display: "block",
            padding: "0 20px 20px",
            color: "#d8d0c8",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textDecoration: "none",
          }}
        >
          Unfold · demos
        </a>
        <nav>
          <SidebarLink href="#/" label="About" active={showLanding} />
          <div
            style={{
              padding: "16px 20px 6px",
              color: "#6a5a52",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Demos
          </div>
          {demos.map((d) => (
            <SidebarLink
              key={d.slug}
              href={`#/${d.slug}`}
              label={d.title}
              active={!showLanding && d.slug === demo?.slug}
            />
          ))}
        </nav>
      </aside>
      <main style={{ flex: 1, minWidth: 0 }}>
        {showLanding ? <Landing /> : <DemoPage demo={demo!} />}
      </main>
    </div>
  );
}

function SidebarLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <a
      href={href}
      style={{
        display: "block",
        padding: "8px 20px",
        color: active ? "#ffd8a0" : "#a89890",
        background: active ? "rgba(255, 176, 96, 0.08)" : "transparent",
        borderLeft: active ? "2px solid #ffb060" : "2px solid transparent",
        textDecoration: "none",
        fontSize: 13,
      }}
    >
      {label}
    </a>
  );
}
