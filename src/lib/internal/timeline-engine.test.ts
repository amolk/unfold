import { describe, it, expect } from "vitest";
import { TimelineEngine } from "./timeline-engine";
import { resolveTheme } from "./defaults";
import type { UnfoldData, UnfoldNode, Vec3 } from "../types";

// Headless tests for the timeline projection engine. No React, no WebGL: the
// GPU "mirrors" are plain Float32Arrays until a renderer uploads them, so we
// drive update()/frame() directly and assert on the backing arrays. Each test
// encodes WHY the behavior matters, so it fails if the intent regresses.

const theme = resolveTheme();
const engine = () => new TimelineEngine({ nodeTexHeight: 64, edgeTexHeight: 64 });
const input = (data: UnfoldData) => ({ data, layout: "none" as const, theme });
// Typed helper so position literals resolve to the Vec3 tuple, not number[].
const node = (id: string, position?: Vec3): UnfoldNode => ({ id, position });

// Settle fades by running frames with a large dt so target is reached quickly.
function settle(e: TimelineEngine, frames: number, focusId: string | null = null) {
  for (let i = 0; i < frames; i++) e.frame({ focusId, dt: 1, fadeSpeed: 5 });
}

describe("TimelineEngine", () => {
  it("(a) a newly-added node enters at fade 0 and ramps up over frames", () => {
    // WHY: Phase-8 enter animation — new nodes must bloom in from 0, not pop.
    const e = engine();
    const { built } = e.update(input({ nodes: [node("a", [0, 0, 0])], edges: [] }));
    const slot = built.nodeIds.indexOf("a");
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(e.nodeFade.data[slot]).toBe(0); // seeded at 0 on build

    e.frame({ focusId: null, dt: 0.1, fadeSpeed: 2 }); // k = 1 - e^-0.2 ≈ 0.18
    expect(e.nodeFade.data[slot]).toBeGreaterThan(0);
    expect(e.nodeFade.data[slot]).toBeLessThan(1);
  });

  it("(b) a focus-only frame writes emphasis WITHOUT minting a new generation", () => {
    // WHY: focus is a per-frame concern. If it bumped the topology generation it
    // would re-mint the Timeline and reset ParticleField's per-particle attrs.
    const e = engine();
    const data = { nodes: [node("a", [0, 0, 0]), node("b", [1, 0, 0])], edges: [] };
    const g0 = e.update(input(data)).generation;
    settle(e, 4, "a"); // raise fades > 0.005 so bulge writes, focus = "a"

    const aSlot = e.update(input(data)).built.nodeIds.indexOf("a");
    const bSlot = e.update(input(data)).built.nodeIds.indexOf("b");
    // colorEmph.w === 1 only for the focused node.
    expect(e.nodeBulge.colorEmph.data[aSlot * 4 + 3]).toBe(1);
    expect(e.nodeBulge.colorEmph.data[bSlot * 4 + 3]).toBe(0);
    // Same input identity → no rebuild → same generation as the first update.
    expect(e.update(input(data)).generation).toBe(g0);
  });

  it("(c) a removed node lingers until its fade decays AND a later update runs", () => {
    // WHY: deferred pruning — geometry must not re-shuffle the instant a fade
    // crosses the threshold; pruning happens at the next sync (user-driven).
    const e = engine();
    e.update(input({ nodes: [node("a", [0, 0, 0]), node("b", [1, 0, 0])], edges: [] }));
    settle(e, 4); // both fades ~1

    // Remove b (fresh data object so update() detects the change and syncs).
    const afterRemoval = e.update(input({ nodes: [node("a", [0, 0, 0])], edges: [] }));
    expect(afterRemoval.built.nodeIds).toContain("b"); // still present, fading out

    settle(e, 4); // b's fade decays below the 0.005 prune threshold
    // A later update (distinct data object) triggers sync → b is pruned now.
    const afterPrune = e.update(input({ nodes: [node("a", [0, 0, 0])], edges: [] }));
    expect(afterPrune.built.nodeIds).not.toContain("b");
    expect(afterPrune.built.nodeIds).toContain("a");
  });

  it("(d) an edge whose source is not a node is flagged as a stub on build", () => {
    // WHY: the particle shader ramps a stub edge's upstream end in from the
    // background; the stub flag lives in the edge-fade texture's G channel.
    const e = engine();
    const { built } = e.update(
      input({
        nodes: [node("a", [0, 0, 0]), node("b", [1, 0, 0])],
        edges: [
          { id: "stub", source: "ghost", target: "a" }, // ghost is not a node
          { id: "real", source: "a", target: "b" },
        ],
      }),
    );
    const stub = built.edgeIds.indexOf("stub");
    const real = built.edgeIds.indexOf("real");
    expect(e.edgeFade.data[stub * 4 + 1]).toBe(1); // G = stub flag
    expect(e.edgeFade.data[real * 4 + 1]).toBe(0);
  });

  it("(e) nodeIds / edgeIds round-trip the public ids and focusIndex resolves", () => {
    const e = engine();
    const { built } = e.update(
      input({
        nodes: [node("a", [0, 0, 0]), node("b", [1, 0, 0])],
        edges: [{ id: "e1", source: "a", target: "b" }],
      }),
    );
    expect(built.nodeIds).toEqual(expect.arrayContaining(["a", "b"]));
    expect(built.edgeIds).toContain("e1");
    expect(e.focusIndex("a")).toBe(built.nodeIds.indexOf("a"));
    expect(e.focusIndex("")).toBe(-1); // no focus
    expect(e.focusIndex("nope")).toBe(-1); // unknown id
  });

  it("(f) auto-layout fills a missing position and edge flow resolves to colors", () => {
    // WHY: a node with no position must be placed by the chosen layout (not left
    // at the origin), and an edge with no flow must inherit the theme's default
    // stream so the particle field has colors to draw.
    const e = engine();
    const built = e.update({
      data: {
        nodes: [{ id: "r" }, { id: "c" }], // no positions
        edges: [{ id: "e1", source: "r", target: "c" }], // no flow
      },
      layout: "layered",
      theme,
    }).built;

    const cSlot = built.nodeIds.indexOf("c");
    const p = built.timeline.nodes[cSlot].position;
    expect(Math.abs(p.x) + Math.abs(p.y) + Math.abs(p.z)).toBeGreaterThan(0);

    const edge = built.timeline.edges[0];
    expect(edge.colors.length).toBeGreaterThanOrEqual(1);
    expect(edge.proportions.length).toBe(edge.colors.length);
  });
});
