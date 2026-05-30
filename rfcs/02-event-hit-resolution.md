# RFC: Deepen event hit-resolution into a pure resolver + usePickHandlers hook

## Problem

Three picker components each raise **index-based** pointer events, and `Scene.tsx` hand-writes **five** translation closures back to public objects:

- `Nodes.tsx` raises `onNodeClick(instanceId, evt)` / `onNodeHover(instanceId|null, evt)`.
- `edge-picker.tsx` raises `onEdgeClick(edgeIndex, evt)` / `onEdgeHover(edgeIndex|null, evt)`.
- `affordance.tsx` raises `onAffordanceClick(positionsIndex, evt)` — a **double** indirection (affordance-list index → timeline node index → id → node).

`Scene.tsx` resolves each through the same triple bounce — `index → built.nodeIds[i] → nodeById.get(id) → public UnfoldNode` (and the edge twin) — spread across `wiredNodeClick`, `wiredNodeHover`, `wiredEdgeClick`, `wiredEdgeHover`, `wiredAffordanceClick` (`Scene.tsx:212-287`), plus two id→object maps (`Scene.tsx:113-126`). Two concepts are tangled inside those closures: **(a) pure index↔id↔object resolution** and **(b) the click-to-focus default policy**.

Separately, the **hover-suppression ref dance** (`hoveredRef`, "ignore a stale `pointerOut` from a target the cursor already left during a fast drag", plus the `document.body.style.cursor` toggle) is duplicated **verbatim** in both `Nodes.tsx:158-181` and `edge-picker.tsx:89-115`.

Net friction: resolution is untestable (reachable only via R3F pointer events through a mounted `<Canvas>`), the focus default is entangled with the optional public callback, and the same pointer-ordering logic exists in two copies that can drift.

## Proposed Interface

A **pure `createPickResolver` core** (no React, no THREE) wrapped by a thin `usePickHandlers` hook that collapses all five closures, plus a `useHoverSuppression` hook that absorbs the duplicated ref dance. (The pure core is identical to the standalone minimal-resolver design; the hook variant simply nests it and adds the hover dedup, so adopting this gives the pure resolver "for free".)

### Pure resolver core (React-free, type-only imports)

```ts
// src/lib/internal/picking/pick-resolver.ts
export interface PickResolverInput {
  data: UnfoldData;
  built: SceneProjectionBuilt;                       // source of index → string-id
  affordances: ReadonlyArray<{ index: number }>;     // carries the double-indirection in
}

export interface PickResolver {
  nodeAt(index: number): UnfoldNode | undefined;        // built.nodeIds[i] → data node
  edgeAt(index: number): UnfoldEdge | undefined;        // built.edgeIds[i] → data edge
  nodeIdAt(index: number): string | undefined;          // id only — for the focus default
  affordanceNodeAt(affordanceIndex: number): UnfoldNode | undefined; // the two-hop, in one call
}

export function createPickResolver(input: PickResolverInput): PickResolver;
// indexes data.nodes/edges by id once; every lookup O(1); returns undefined on any miss
```

### Thin React skin

```ts
// src/lib/internal/picking/usePickHandlers.ts — collapses the five closures
export function usePickHandlers(args: {
  data: UnfoldData; built: SceneProjectionBuilt;
  affordances: ReadonlyArray<{ index: number }>;
  onSetFocus: (next: NodeId | null) => void;          // click-to-focus default, always live
  onNodeClick?: ...; onNodeHover?: ...; onEdgeClick?: ...; onEdgeHover?: ...; onNodeExpand?: ...;
}): {
  nodeClick: (index: number, e: PointerEvent) => void;        // never undefined (focus default)
  nodeHover?: (index: number | null, e: PointerEvent) => void;
  edgeClick?: (index: number, e: PointerEvent) => void;
  edgeHover?: (index: number | null, e: PointerEvent) => void;
  affordanceClick?: (index: number, e: PointerEvent) => void;
};

// src/lib/internal/picking/useHoverSuppression.ts — the deduplicated dance
export function useHoverSuppression<K>(
  onHover: ((key: K | null, event: PointerEvent) => void) | undefined,
): { enter(key: K, e: PointerEvent): void; leave(key: K, e: PointerEvent): void };
```

### Usage — `Scene.tsx` sheds ~75 lines (two maps + five closures → one call)

```tsx
const pick = usePickHandlers({
  data, built, affordances, onSetFocus,
  onNodeClick, onNodeHover, onEdgeClick, onEdgeHover, onNodeExpand,
});
<Nodes      onNodeClick={pick.nodeClick}  onNodeHover={pick.nodeHover} ... />
<EdgePicker onEdgeClick={pick.edgeClick}  onEdgeHover={pick.edgeHover} timeline={built.timeline} />
{onNodeExpand && <Affordance onAffordanceClick={pick.affordanceClick} positions={affordancePositions} ... />}
```

And both pickers replace their `hoveredRef` block with `const { enter, leave } = useHoverSuppression<number>(onHover)`.

### What complexity it hides

- The five hand-written closures and the two `nodeById`/`edgeById` maps.
- The triple round-trip `index → built.*Ids[i] → byId.get(id)`, written four times today.
- The affordance double-indirection, collapsed into `affordanceNodeAt`.
- The click-to-focus default, now an unconditional `onSetFocus(id)` *before* the optional callback — separable and always-on, keyed on the id (so focus survives even if the node is mid-prune from `data`).
- The duplicated stale-`pointerOut` suppression + cursor toggle, now one correct implementation behind two thin call sites.

## Dependency Strategy

**In-process, no new packages.** `pick-resolver.ts` imports *only types* (`UnfoldData`, `UnfoldNode`, `UnfoldEdge`, `SceneProjectionBuilt`) → zero runtime imports, never touches React or THREE. React is confined to the two hooks. The hook is a genuine skin: resolution lives in `createPickResolver` and is callable from anywhere (e.g. a future imperative `UnfoldHandle`); the hook adds only memoization + the focus/gating policy.

**Threading & rebuild:** `data` + `built` + `affordances` flow into one `useMemo` (the same keys Scene already maintains for the maps being replaced — a behavior-preserving move, not a new invalidation surface). Callback identities are deliberately *not* resolver deps, so a parent passing inline callbacks doesn't churn the maps. The affordance *filter* (`expandable && !expanded` + position extraction) stays in Scene — it's a rendering concern coupled to `built.timeline.nodes[i].position` and `expandedNodeIds`; the hook takes only the `{ index }` slots it needs.

## Testing Strategy

**New boundary tests** (against `createPickResolver`, plain object literals, no React/THREE — encoding *why* the indirection exists):

- **Active-set order, not data order:** `built.nodeIds` order ≠ `data.nodes` order after a prune/reorder; `nodeAt(i)` must follow `built`, returning the *identical* data object (not a copy).
- **Stale index after topology shrink:** an event index that pointed at a now-pruned node resolves to `undefined` (caller no-ops, no crash) — this is the load-bearing reason resolution can't be naive index-into-data.
- **Affordance double-indirection in one hop:** `affordanceNodeAt(0)` with `affordances=[{index: 2}]` resolves to the node at `built.nodeIds[2]`; out-of-range affordance index → `undefined`.
- **Rebuildability:** an old resolver doesn't see a node added only in a newer `(data, built)`; a freshly built one does — proves resolution is a pure function of its inputs.
- **Edge resolution + unknown-id + out-of-range** all return `undefined`.

The focus-default + callback gating live in the hook (a React-side product decision calling `useControllableState`'s setter); they're trivial by inspection. If that policy ever grows non-trivial, extract it into its own pure `resolveClickIntent` function and test it headlessly — but a one-line `onSetFocus(id)` doesn't warrant that yet.

**Old tests to delete:** none (zero current tests).

**Test environment needs:** vitest only. No jsdom, no R3F renderer.

## Implementation Recommendations

- **The resolver should own:** id-indexing of `data.nodes`/`data.edges`, the index→id→object round-trip for nodes and edges, and the affordance two-hop. It should return `undefined` uniformly for out-of-range *and* unknown-id (callers treat both as "no object").
- **It should hide:** the two maps and the manual `built.*Ids[i]` dereferences scattered through Scene.
- **It should expose:** `nodeAt` / `edgeAt` / `nodeIdAt` / `affordanceNodeAt` — and `nodeIdAt` deliberately returns the raw id, because the focus policy keys on id (which resolves even when the public object is mid-prune), not on the object.
- **Keep policy out of the pure core:** click-to-focus and the optional-callback gating belong in the hook, separable and individually replaceable. The core stays a pure `(data, built, affordances) → lookups` function.
- **Pickers stay index-only:** do not change their event signatures. `useHoverSuppression` is identity-agnostic (`<K>`, `number` at both sites today) and owns the cursor toggle so neither picker re-implements it.
- **Caller migration:** `Scene.tsx` deletes the `nodeById`/`edgeById` memos and the five `wired*` closures, replacing them with one `usePickHandlers(...)` call; the `affordances` memo keeps only its geometry/slot construction. Each picker swaps its `hoveredRef` block for `useHoverSuppression`.
- **Rejected as premature:** a general hit-kind *registry* (descriptor table for node/edge/affordance/background with pluggable registration). For 3-4 fixed kinds it is speculative indirection — and even adding a new public callback would still touch a central sink bag, so the "no core edits" benefit is largely illusory. Revisit only if caller-supplied hit-kinds become a real requirement.
- **Optional follow-up:** `onBackgroundClick` is currently wired separately on the Canvas (`Unfold.tsx`, `onPointerMissed`). Unifying it into the same pick layer is a minor consistency win but not required by this refactor.

---
*Filed via the improve-codebase-architecture skill. Candidate 2 of 4 deepening candidates identified in `src/lib/`.*
