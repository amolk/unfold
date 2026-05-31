// The unified click → selection rule shared by nodes AND edges. Pure: no React,
// no THREE — a function of (current selection, what was hit, modifier) only, so
// it is exhaustively unit-testable with plain arrays.
//
// Selection spans both kinds of pickable item at once (you can have nodes and
// edges selected together). The public API still surfaces it as two arrays
// (selectedNodeIds / selectedEdgeIds); this module is the single place the
// click semantics live.

export type PickKind = "node" | "edge";

export interface PickHit {
  kind: PickKind;
  id: string;
}

/** A selection across both item kinds. Transitions that change nothing return
 *  the SAME object/array references so the controllable-state setters can skip
 *  firing (no spurious onSelectionChange / re-render churn). */
export interface Selection {
  nodes: readonly string[];
  edges: readonly string[];
}

const EMPTY: Selection = { nodes: [], edges: [] };

/** Apply one click to the current selection.
 *  - plain click            → select just that item (replace the whole set)
 *  - additive (cmd/ctrl)    → toggle that item's membership, leave the rest
 *  - plain-click sole item  → no change (it's already the only selection)
 *  - background (hit null)  → clear everything
 *
 *  `additive` is the cmd/ctrl-key state at click time. The "more than one
 *  selected, clicking deselects that" case is the additive toggle-off path. */
export function reduceSelection(
  current: Selection,
  hit: PickHit | null,
  additive: boolean,
): Selection {
  // Background click → clear all (identity-stable no-op when already empty).
  if (hit === null) {
    if (current.nodes.length === 0 && current.edges.length === 0) return current;
    return EMPTY;
  }

  const list = hit.kind === "node" ? current.nodes : current.edges;
  const isSelected = list.includes(hit.id);

  if (additive) {
    const nextList = isSelected
      ? list.filter((id) => id !== hit.id)
      : [...list, hit.id];
    return hit.kind === "node"
      ? { nodes: nextList, edges: current.edges }
      : { nodes: current.nodes, edges: nextList };
  }

  // Plain click. Re-selecting the item that is already the SOLE selection is a
  // no-op — return `current` so identity is preserved and nothing re-fires.
  const total = current.nodes.length + current.edges.length;
  if (isSelected && total === 1) return current;

  // Otherwise the plain click collapses the whole selection down to this one.
  return hit.kind === "node" ? { nodes: [hit.id], edges: [] } : { nodes: [], edges: [hit.id] };
}
