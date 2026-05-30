# RFC: Consolidate + test the demo data generators; optionally extract a thin demo shell

> **Scope note:** This is the lowest architectural-value of the four candidates from this exploration. It is DX + test coverage, not a deep module that unlocks a hard-to-reach test boundary (contrast Candidates 1–3). It splits into a high-value piece (generators) and an optional polish piece (chrome), which can ship independently.

## Problem

The 13 demos under `src/demos/` co-own two scattered concerns:

1. **Synthetic data generation.** `src/demos/dag/buildDag.ts` and `src/demo/demo-data.ts` (`buildDemoData` + `applyFlowPreset`) are pure, deterministic, seeded generators with real logic — band widths, the multi-parent DAG invariant the `hierarchical` layout *depends on*, tree depth/fan-out, flow presets. They are **untested**, and each re-defines its own identical copy of `mulberry32` (plus `demo-data.ts` has its own `hashString`). Two silently-diverging PRNG copies + an untested layout-critical invariant is a real correctness risk: an "improvement" that picks DAG parents from the same band would break the layout with nothing to catch it.
2. **Presentation chrome.** Multi-pane demos (`NodeStyle`, `EdgeStyle`, `Layouts`, `CameraMode`) each define their own near-identical `Pane` label-overlay (with drift — font size 10 vs 11). Interactive demos (`Dag`, `DeepTree`, `Controlled`, `Events`, `Expansion`) each copy-paste the same `panelStyle` / `button` / `buttonActive` `CSSProperties` and a reseed/toggle control pattern (panel width 200 vs 220, etc.).

**The binding constraint:** demo source is **displayed as teaching material** — `registry.ts` imports each demo `?raw` and rewrites `../../lib` → `unfold` so the reader sees "how to use Unfold." This means the usual "extract the duplication" instinct must be weighed against keeping the `<Unfold>` lesson legible.

## Proposed Interface

Two independently-shippable pieces.

### Piece 1 (primary, unconditional) — one tested generator module + one `mulberry32`

```ts
// src/demos/_data/rng.ts   (demo-side, NOT src/lib/internal — see Dependency Strategy)
export function mulberry32(seed: number): () => number;
export function hashString(s: string): number;   // FNV-1a, used by the tree generator

// src/demos/_data/buildDag.ts   (body verbatim; inline mulberry32 deleted)
export function buildDag(seed: number, layers?: number, width?: number): UnfoldData;

// src/demos/_data/demoData.ts   (body verbatim; inline mulberry32+hashString deleted)
export type FlowPreset = "single" | "two" | "three" | "eight";
export function buildDemoData(seed?: number, depth?: number, opts?: { positioned?: boolean }): UnfoldData;
export function applyFlowPreset(data: UnfoldData, preset: FlowPreset, themeColors: [stable: string, crisis: string]): UnfoldData;
```

Old `src/demo/demo-data.ts` and `src/demos/dag/buildDag.ts` are deleted; the three importers (`Dag.tsx`, `DeepTree.tsx`, `src/demo/App.tsx`) update their paths. Generators keep their exact signatures and stay pure + seeded; `buildDemoData` keeps using THREE for vector math internally but still returns plain `Vec3` tuples.

### Piece 2 (optional, secondary) — a thin, displayed-source-aware demo shell

```ts
// src/demo-shell/index.tsx — every component is ONE thin styled <div>/<button>
export const tokens: { ink; inkDim; panelBg; labelBg; border; accent; accentInk; accentBg; mono };
export function DemoGrid(p: { panes: { label: string; children: ReactNode }[]; cols?: number; rows?: number; gap?: number }): JSX.Element;
export function ControlPanel(p: { children: ReactNode; width?: number; side?: "left" | "right"; readOnly?: boolean }): JSX.Element;
export function Field(p: { label: ReactNode; children?: ReactNode }): JSX.Element;
export function Segmented<T extends string>(p: { label?: ReactNode; options: readonly T[]; value: T; onChange: (v: T) => void }): JSX.Element;
export function Button(p: { children: ReactNode; onClick: () => void; active?: boolean }): JSX.Element;
export function useToggle<T extends string>(options: readonly T[], initial?: T): { value: T; onChange: (v: T) => void; options: readonly T[] };
export function useReseed(initial?: number): { seed: number; reseed: () => void };
```

A new interactive demo drops from ~70 lines (with ~60 of inline chrome CSS burying a one-line `<Unfold>`) to ~18 lines where the `<Unfold>` call is the visual center:

```tsx
const layout = useToggle(["layered", "radial", "hierarchical"] as const, "layered");
const { seed, reseed } = useReseed(9143);
const data = useMemo(() => buildDemoData(seed, 4, { positioned: false }), [seed]);
return (
  <div style={{ position: "relative", width: "100%", height: "100%" }}>
    <Unfold data={data} layout={layout.value} />
    <ControlPanel>
      <Segmented label="layout" {...layout} />
      <Field label={`seed: ${seed}`} /><Field label="nodes">{data.nodes.length}</Field>
      <Button onClick={reseed} active>regenerate</Button>
    </ControlPanel>
  </div>
);
```

## Dependency Strategy

**In-process, pure.** Generators are synchronous pure functions; `applyFlowPreset` is a non-mutating transform. Vitest is the only new devDependency (no test runner exists today), scoped to the generators — the shell is presentational and verified by eye in the running gallery.

**PRNG dedup stays on the demo side.** Put the shared `mulberry32` in `src/demos/_data/rng.ts`, **not** `src/lib/internal/rng.ts`. The library ships to npm; routing demo-data seeding through a library-internal module would couple the published surface to demo needs and point the dependency the wrong way. (Candidate 3 separately proposes a *library* `rng.ts` for the particle builder's own needs — that is an independently-motivated module; the ~12-line demo copy is cheap to keep separate. Flagged here so the two RFCs aren't read as proposing one shared module.)

**The displayed-source `?raw` rewrite is the crux for Piece 2.** Today `rewriteForDisplay` swaps only `../../lib` → `unfold`. The generator imports (`../_data/...`) are non-`lib` relative paths, so they display verbatim as clearly demo-local helpers — exactly right, requiring **no change** to `registry.ts`. For the shell (Piece 2), there is a genuine decision:
- **Option A (Design 3):** extend `rewriteForDisplay` so `../../demo-shell` → `unfold/demo-shell`. Reads clean and consistent with the existing trick — *but shows an import path that does not exist in the published package.*
- **Option B:** leave the honest relative import (`../../demo-shell`); names like `ControlPanel`/`Segmented` are self-evidently chrome, not Unfold API.
- **Option C (Design 1, conservative):** don't extract chrome at all — keep the CSS literal so the reader can copy it directly.

Recommendation: **Option B** — extract the chrome (so the interactive-demo lesson stops being buried under 60 lines of panel CSS) but keep the displayed import honest rather than inventing a published path.

## Testing Strategy

**New boundary tests** (vitest, Node env, no DOM/React — each encoding *why* it matters):

- **`buildDag` is a DAG:** every edge points strictly forward across bands (`sourceBand < targetBand`, gap ≤ 2) — *because the `hierarchical` layout assumes acyclicity; a same-band/back edge silently breaks layer assignment.*
- **`buildDag` parent count 1–3** per non-source node — *the multi-parent property is the demo's stated lesson and what distinguishes it from the Tree demo.*
- **`buildDemoData` depth + fan-out:** max depth matches `depth`, each expanded node has 2–4 children, ~100 nodes at depth 4 — *the Tree demo's camera framing assumes this shape.*
- **`positioned: false` omits positions/controls** — *the Tree demo passes this precisely so the library's auto-layout owns placement; a leak would make its layout toggle silently no-op.*
- **`applyFlowPreset` is pure/non-mutating** and `"single"` returns the input identity — *demos call it on memoized data; mutation would corrupt the cache across re-renders.*
- **Determinism:** same seed → deep-equal output, different seed → different — *the "reseed"/shareable-seed contract.*

**Old tests to delete:** none (zero current tests). This establishes the demo-side test surface and the project's first vitest config.

**Test environment needs:** add `vitest` devDependency, a `"test": "vitest run"` script, and `test: { environment: "node", include: ["src/**/*.test.ts"] }` in `vite.config.ts`. (Shared with Candidates 1–3, which also need vitest.)

## Implementation Recommendations

- **The generator module should own:** all seeded graph/tree construction and the single PRNG; it should expose only `buildDag` / `buildDemoData` / `applyFlowPreset` / `mulberry32` and stay pure.
- **It should hide:** the PRNG implementation (currently duplicated) and the construction math — these always sat off to the side of the `<Unfold>` lesson, so consolidating + testing them changes nothing about how a demo *reads*.
- **Ship Piece 1 regardless of Piece 2.** The generator consolidation + tests is the actual correctness/testability win and is uncontroversial. If only one thing ships, ship this.
- **For Piece 2, keep the shell shallow:** every export is one styled element; no theming engine, no layout DSL, no compound-component context (that would over-engineer a 13-demo gallery). The shell de-buries the interactive-demo lesson by removing ~60 lines of inline chrome; weigh the displayed-import cost via Options A/B/C above (recommend B).
- **Rejected as premature:** a declarative `defineDemo(spec)` descriptor kit that renders demos from data. For interactive demos it turns the displayed source into a DSL literal that won't run against the published `unfold` package — directly defeating the purpose of the `?raw` teaching pipeline. (The agent that designed it reached the same conclusion.) Revisit only if demo *authoring throughput* ever outranks per-demo lesson fidelity (e.g. 50+ demos).
- **Owner's call to surface:** whether teaching code should prioritize copy-paste fidelity (leave chrome inline, Design 1) or a de-cluttered lesson (extract chrome, Design 3). Both are defensible; the generator consolidation is orthogonal to it.

---
*Filed via the improve-codebase-architecture skill. Candidate 4 of 4 deepening candidates identified in `src/lib/` — explicitly the lowest-value of the set.*
