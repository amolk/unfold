import { describe, it, expect } from "vitest";
import { buildDag } from "./buildDag";
import { buildDemoData, applyFlowPreset } from "./demoData";

// The demo data generators are pure + seeded but were previously untested.
// Each assertion encodes WHY the property matters to the demo it feeds.

describe("buildDag", () => {
  const band = (id: string) => Number(id.match(/^n(\d+)-/)![1]);

  it("only draws edges forward across bands (the DAG invariant)", () => {
    // WHY: the demo lays this out with the `hierarchical` layout, which assumes
    // acyclicity — a same-band or back edge would break layer assignment.
    const { nodes, edges } = buildDag(0xc0ffee, 6, 6);
    const ids = new Set(nodes.map((n) => n.id));
    for (const e of edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
      const span = band(e.target) - band(e.source);
      expect(span).toBeGreaterThan(0); // forward only ⇒ acyclic
      expect(span).toBeLessThanOrEqual(2); // parents from the prev 1–2 bands
    }
  });

  it("gives every non-source node 1–3 parents", () => {
    // WHY: the multi-parent fan-in is what makes this a DAG and not a tree —
    // the demo's whole point versus the Tree demo.
    const { nodes, edges } = buildDag(42, 6, 6);
    const parents = new Map<string, number>();
    for (const e of edges) parents.set(e.target, (parents.get(e.target) ?? 0) + 1);
    const sources = new Set(nodes.filter((n) => n.id.startsWith("n0-")).map((n) => n.id));
    for (const n of nodes) {
      if (sources.has(n.id)) continue;
      const c = parents.get(n.id) ?? 0;
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(3);
    }
  });

  it("is deterministic per seed and varies across seeds", () => {
    expect(buildDag(7)).toEqual(buildDag(7));
    expect(buildDag(7)).not.toEqual(buildDag(8));
  });
});

describe("buildDemoData", () => {
  it("grows to `depth` with 2–4 children per expanded node", () => {
    // WHY: the Tree demo's camera framing assumes this shape (~100 nodes at d=4).
    const { nodes } = buildDemoData(9143, 4, { positioned: false });
    const maxDepth = Math.max(...nodes.map((n) => n.id.split(".").length - 1));
    expect(maxDepth).toBe(4);

    const childCount = new Map<string, number>();
    for (const n of nodes) {
      if (!n.id.includes(".")) continue;
      const parent = n.id.slice(0, n.id.lastIndexOf("."));
      childCount.set(parent, (childCount.get(parent) ?? 0) + 1);
    }
    for (const c of childCount.values()) {
      expect(c).toBeGreaterThanOrEqual(2);
      expect(c).toBeLessThanOrEqual(4);
    }
    expect(nodes.length).toBeGreaterThan(40);
  });

  it("omits positions/controls only when positioned:false", () => {
    // WHY: the Tree demo passes positioned:false precisely so the library's
    // auto-layout owns placement; a leak would make its layout toggle a no-op.
    const auto = buildDemoData(9143, 2, { positioned: false });
    expect(auto.nodes.every((n) => n.position === undefined)).toBe(true);
    expect(auto.edges.every((e) => e.controls === undefined)).toBe(true);

    const placed = buildDemoData(9143, 2); // positioned: true (default)
    expect(placed.nodes.every((n) => n.position !== undefined)).toBe(true);
    expect(placed.edges.some((e) => e.id === "__stub__->0")).toBe(true);
  });

  it("is deterministic per seed", () => {
    expect(buildDemoData(9143, 3)).toEqual(buildDemoData(9143, 3));
    expect(buildDemoData(9143, 3)).not.toEqual(buildDemoData(1, 3));
  });
});

describe("applyFlowPreset", () => {
  const data = buildDemoData(9143, 2, { positioned: false });

  it("is a pure, non-mutating transform", () => {
    // WHY: demos call this on memoized data; mutation would corrupt the cache.
    const before = JSON.stringify(data);
    const out = applyFlowPreset(data, "three", ["#0f0", "#f00"]);
    expect(JSON.stringify(data)).toBe(before); // input untouched
    expect(out.edges[0].flow).toEqual({
      colors: ["#0f0", "#f00", "#e0a020"],
      proportions: [6, 3, 1],
    });
  });

  it("'single' returns the input unchanged (library default edge color)", () => {
    expect(applyFlowPreset(data, "single", ["#0f0", "#f00"])).toBe(data);
  });
});
