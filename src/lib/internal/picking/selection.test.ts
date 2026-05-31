import { describe, it, expect } from "vitest";
import { reduceSelection, type Selection } from "./selection";

// These tests pin the INTENT of each interaction rule, not just the mechanics:
// why a plain click replaces, why the sole-selected click is inert (no event
// churn), why cmd-click is the only path that builds a multi-selection, and why
// a background click wipes both kinds. If any rule is quietly changed, the
// matching test should fail.

const sel = (nodes: string[], edges: string[] = []): Selection => ({ nodes, edges });

describe("reduceSelection", () => {
  describe("plain click (replace)", () => {
    it("selects a single node from an empty selection", () => {
      expect(reduceSelection(sel([]), { kind: "node", id: "a" }, false)).toEqual(
        sel(["a"]),
      );
    });

    it("replaces the entire selection — including the other kind", () => {
      // A node click must clear any selected edges too: selection is one set
      // spanning both kinds, and a plain click means "only this".
      const next = reduceSelection(sel(["a", "b"], ["e1"]), { kind: "node", id: "c" }, false);
      expect(next).toEqual(sel(["c"], []));
    });

    it("collapses a multi-selection down to the clicked member", () => {
      const next = reduceSelection(sel(["a", "b", "c"]), { kind: "node", id: "b" }, false);
      expect(next).toEqual(sel(["b"]));
    });

    it("is a no-op when clicking the sole selected item (identity preserved)", () => {
      // Inert so the controllable-state setter never fires a redundant change.
      const current = sel(["a"]);
      expect(reduceSelection(current, { kind: "node", id: "a" }, false)).toBe(current);
    });

    it("selects a single edge, clearing nodes", () => {
      expect(
        reduceSelection(sel(["a"], []), { kind: "edge", id: "e1" }, false),
      ).toEqual(sel([], ["e1"]));
    });
  });

  describe("additive click (cmd/ctrl toggle)", () => {
    it("adds an unselected node to the existing set", () => {
      expect(reduceSelection(sel(["a"]), { kind: "node", id: "b" }, true)).toEqual(
        sel(["a", "b"]),
      );
    });

    it("removes an already-selected node (the 'clicking deselects that' case)", () => {
      expect(
        reduceSelection(sel(["a", "b"]), { kind: "node", id: "a" }, true),
      ).toEqual(sel(["b"]));
    });

    it("toggles edges independently of the node set", () => {
      const next = reduceSelection(sel(["a"], ["e1"]), { kind: "edge", id: "e2" }, true);
      expect(next).toEqual(sel(["a"], ["e1", "e2"]));
    });

    it("mixes kinds: cmd-clicking an edge keeps selected nodes", () => {
      const next = reduceSelection(sel(["a"], []), { kind: "edge", id: "e1" }, true);
      expect(next).toEqual(sel(["a"], ["e1"]));
    });

    it("can deselect the last item, leaving an empty selection", () => {
      expect(reduceSelection(sel(["a"]), { kind: "node", id: "a" }, true)).toEqual(
        sel([]),
      );
    });
  });

  describe("background click (hit === null)", () => {
    it("clears both nodes and edges", () => {
      expect(reduceSelection(sel(["a", "b"], ["e1"]), null, false)).toEqual(sel([]));
    });

    it("is a no-op (identity preserved) when already empty", () => {
      const current = sel([]);
      expect(reduceSelection(current, null, false)).toBe(current);
    });

    it("clears regardless of the modifier state", () => {
      expect(reduceSelection(sel([], ["e1"]), null, true)).toEqual(sel([]));
    });
  });
});
