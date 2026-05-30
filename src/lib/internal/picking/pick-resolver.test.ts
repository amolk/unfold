import { describe, it, expect } from "vitest";
import { createPickResolver } from "./pick-resolver";
import type { UnfoldData } from "../../types";

// Pure resolution tests — no React, no THREE. Each encodes WHY the indirection
// exists: the index order is the ACTIVE-SET order (from the build), which
// differs from data order after a prune/reorder, so a naive index-into-data
// would resolve the wrong object.

const data: UnfoldData = {
  nodes: [
    { id: "root" },
    { id: "child", expandable: true },
    { id: "ghost" }, // present in data but pruned from the active set below
  ],
  edges: [{ id: "e1", source: "root", target: "child" }],
};

// Active set after a prune: "ghost" is gone and the order differs from data
// order — exactly the case the indirection handles.
const nodeIds = ["child", "root"]; // index 0 = child, index 1 = root
const edgeIds = ["e1"];

describe("createPickResolver", () => {
  const r = createPickResolver({ data, nodeIds, edgeIds, affordances: [] });

  it("resolves a node hit via the active-set order, not data order", () => {
    expect(r.nodeAt(0)?.id).toBe("child");
    expect(r.nodeAt(1)?.id).toBe("root");
    expect(r.nodeAt(0)).toBe(data.nodes[1]); // exact object identity, not a copy
  });

  it("resolves an edge hit to the public edge", () => {
    expect(r.edgeAt(0)?.id).toBe("e1");
  });

  it("nodeIdAt returns the raw id (used by the focus default)", () => {
    expect(r.nodeIdAt(0)).toBe("child");
    expect(r.nodeIdAt(99)).toBeUndefined();
  });

  it("collapses the affordance double-indirection (affIdx → nodeIds idx → node)", () => {
    // affordances[0].index === 0 → nodeIds[0] === "child"
    const ra = createPickResolver({ data, nodeIds, edgeIds, affordances: [{ index: 0 }] });
    expect(ra.affordanceNodeAt(0)?.id).toBe("child");
    expect(ra.affordanceNodeAt(0)?.expandable).toBe(true);
  });

  it("returns undefined for stale / out-of-range indices", () => {
    expect(r.nodeAt(99)).toBeUndefined();
    expect(r.edgeAt(-1)).toBeUndefined();
    expect(r.affordanceNodeAt(99)).toBeUndefined(); // bad affordance index
    const stale = createPickResolver({ data, nodeIds, edgeIds, affordances: [{ index: 99 }] });
    expect(stale.affordanceNodeAt(0)).toBeUndefined(); // affordance points off the end
  });

  it("is purely a function of its inputs — rebuildable when they change", () => {
    const r1 = createPickResolver({ data, nodeIds, edgeIds, affordances: [] });
    expect(r1.nodeAt(2)).toBeUndefined(); // only 2 active ids

    const data2: UnfoldData = { ...data, nodes: [...data.nodes, { id: "d" }] };
    const r2 = createPickResolver({
      data: data2,
      nodeIds: [...nodeIds, "d"],
      edgeIds,
      affordances: [],
    });
    expect(r2.nodeAt(2)?.id).toBe("d"); // rebuilt resolver sees the new node
  });
});
