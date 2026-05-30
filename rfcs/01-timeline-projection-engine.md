# RFC: Deepen the timeline projection engine into a headless TimelineEngine core

## Problem

The "engine" that turns public `UnfoldData` into the GPU-ready buffers the shaders consume is **split across three places**, and no single object owns the data→pixels pipeline:

- **`Scene.tsx`** owns layout selection (`normalizeData(data, layout, …)`), the React `activeKey` rebuild bump, and the `useFrame` loop that calls `tickFades` + `writeBulgeData`.
- **`SceneProjection`** (`scene-projection.ts`) owns active-set bookkeeping, fade animation, and GPU-mirror writes — but the *rules connecting its methods live in prose comments, not types*: "prune at sync, not at fade-cross"; "`build()` must not see `focusId`"; "`tickFades` writes the slot `index` assigned by the last `build()`."
- **`normalizeData`** (a free function) owns layout dispatch + color/flow/bezier resolution.

To answer "what happens when the `data` prop changes?" or "why doesn't a focus change rebuild the timeline?", a reader (human or AI) must hold all three in their head. More importantly: **none of this logic is testable.** It is reachable only by mounting `<Scene>` inside an R3F `<Canvas>`. The repo currently has **zero tests**, and this engine is the single highest-value place to establish a test boundary.

### Key insight that makes this deepenable

`THREE.DataTexture` and `THREE.InstancedBufferAttribute` (wrapped by `gpu-mirror.ts`) are **plain CPU objects until a renderer uploads them** — their backing `Float32Array`s are fully observable in a test with **no WebGL context**. So the engine can be driven headlessly and asserted on directly. This is what the refactor unlocks.

## Proposed Interface

A plain, **React-free `TimelineEngine` core** that composes the existing `normalizeData` + `SceneProjection`, fronted by a thin `useTimelineEngine` hook that owns the two clocks. (Hybrid of two explored designs: a headless-core/React-skin split, with a minimal method surface that enforces the two-clock rule at the type level.)

### The headless core

```ts
// src/lib/internal/timeline-engine.ts  — depends on THREE, NOT on React
export interface EngineInput { data: UnfoldData; layout: UnfoldLayout; theme: ResolvedTheme; }
export interface FrameInput  { focusId: string | null; dt: number; fadeSpeed: number; } // focus is per-frame ONLY

export class TimelineEngine {
  constructor(capacity?: { nodeTexHeight?: number; edgeTexHeight?: number }); // defaults 4096/4096

  // one-shot GPU mirrors (forwarded from the inner SceneProjection)
  readonly nodeFade: MirroredAttribute;
  readonly edgeFade: MirroredTexture;
  readonly nodeBulge: NodeBulgeData;

  /** TOPOLOGY CLOCK. normalize → sync → (re)build. Idempotent on unchanged
   *  input identity. Has NO focusId param — focus cannot reach topology. */
  update(input: EngineInput): { generation: number; built: SceneProjectionBuilt };

  /** FADE+BULGE CLOCK. Advances fades by dt (k = 1 - exp(-dt*fadeSpeed)) and
   *  rewrites the bulge textures for focusId. Touches only mirror .data. */
  frame(input: FrameInput): void;

  focusIndex(focusId: string): number;
  reset(): void;
  dispose(): void;
}
```

### The thin React skin

```ts
// src/lib/internal/use-timeline-engine.ts  — the ONLY file importing React + fiber here
export function useTimelineEngine(args: {
  data: UnfoldData; layout: UnfoldLayout; theme: ResolvedTheme;
  style: ResolvedStyle; focusId: string;
}): {
  timeline: Timeline; nodeIds: string[]; edgeIds: string[]; focusIndex: number;
  nodeFade: MirroredAttribute; edgeFade: MirroredTexture; nodeBulge: NodeBulgeData;
};
```

### Usage — `Scene.tsx` shrinks from ~130 lines of orchestration to one call

```tsx
const { timeline, nodeIds, edgeIds, focusIndex, nodeFade, edgeFade, nodeBulge } =
  useTimelineEngine({ data, layout, theme, style, focusId });
// pick round-trip maps, affordances, selectionFlags, and JSX are unchanged —
// they already consume timeline / nodeIds / edgeIds.
```

### What complexity it hides

- `normalizeData`'s 5 positional args + layout-dispatch ternary + flow/color/bezier resolution.
- The active-set `Map<string, Entry>` bookkeeping, `target`/`fade`/`index` fields, fade-0 enter animation, and **deferred pruning** (prune at next `update`, not when fade crosses 0.005).
- The `1 - exp(-dt*fadeSpeed)` lerp factor and the `focusId ?? ""` sentinel.
- The React boilerplate Scene hand-writes today: the normalize memo, the projection memo, the `sync`-then-`setActiveKey` effect, the `build` memo, the `focusIndex` memo, the `useFrame` body, and the dispose effect.
- The two-clock discipline becomes **structural**: `update` is the only path that bumps `generation`; `frame` physically cannot, and carries the only `focusId`.

## Dependency Strategy

**In-process.** The THREE/GPU-mirror dependency is merged directly — **no port/adapter**. Two of the explored designs independently confirmed that THREE mirror objects are constructible without a GPU, so a `MirrorAllocator` port would buy testability we already have for free (rejected as speculative indirection). `gpu-mirror.ts` stays an internal implementation detail.

The load-bearing split is **dependency direction**: core (`timeline-engine.ts`, `scene-projection.ts`, `gpu-mirror.ts`, `timeline.ts`) depends on THREE but **not** React; the skin (`use-timeline-engine.ts`) is the only file importing React + `@react-three/fiber`. Direction is skin → core; the core never imports the skin. This keeps the core `new`-able and drivable in a plain vitest file (no canvas, no `@react-three/test-renderer`), and leaves it reusable from a future non-fiber embedding.

## Testing Strategy

**New boundary tests to write** (against the headless `TimelineEngine`, encoding *why* each behavior matters):

- **Fade-in symmetry:** a newly-added node enters at `nodeFade.data[i] === 0` and ramps toward 1 over frames — proves adds bloom in rather than pop (Phase 8 intent).
- **Two-clock separation:** a focus-only change advances `nodeBulge.colorEmph.data[…w]` emphasis **without** minting a new `generation` — proves focus never invalidates ParticleField's per-particle attributes.
- **Deferred pruning:** a removed node stays in `built.nodeIds` until its fade decays *and* a subsequent `update` runs — proves geometry re-shuffles land inside user-driven transitions, not mid-fade.
- **Edge stub ramp:** an edge whose `source` is not a node is flagged so its G-channel ramp flag is set.
- **Index round-trip:** `nodeIds[i]` / `edgeIds[i]` map timeline indices back to public ids correctly.
- **Layout/flow resolution:** nodes missing `position` get auto-laid-out (per `layout`), and edge `flow` resolves to concrete colors/proportions with the documented fallbacks.

**Old tests to delete:** none exist (zero current tests). This refactor *establishes* the test surface.

**Test environment needs:** none beyond a headless test runner (vitest). No WebGL, no canvas, no React renderer — the engine core is driven by plain method calls and `.data` assertions. (Adopting vitest is a prerequisite; none is configured today.)

## Implementation Recommendations

Durable guidance, not coupled to current paths:

- **The engine should own:** normalization (layout dispatch + color/flow/bezier resolution), active-set diffing with deferred pruning, fade integration, the per-frame bulge/emphasis write, index↔id mapping, and one-shot fixed-capacity GPU-mirror lifecycle.
- **It should hide:** the entry bookkeeping types, the `NormalizedScene` intermediate, the mirror wrappers, the lerp-factor arithmetic, and the focus sentinel.
- **It should expose:** a topology method (no focus input), a per-frame method (the only focus input), the stable mirror handles for binding, and an index→id snapshot for pick round-tripping.
- **Two-clock rule must be enforced by types**, not comments: the topology entry point has no `focusId` parameter; only the per-frame entry point does. This makes "build must not see focus" a compile-time guarantee.
- **Keep `normalizeData` and `SceneProjection` as internal collaborators** the engine composes — do not rewrite them. The deepening is a *composition + isolation* layer, minimizing blast radius (proven code stays put).
- **React isolation is the contract:** all React/fiber lifecycle decisions (when to `update`, when to `frame`, when to `dispose`) live in the hook skin; the core stays lifecycle-agnostic (`frame(dt)` takes `dt` as a param so a test `for`-loop and `useFrame` drive it identically).
- **Caller migration:** `Scene.tsx` replaces its normalize/projection/sync/build/frame/dispose block with a single `useTimelineEngine(...)` call; all pick/affordance/selection code is untouched (it already consumes `timeline`/`nodeIds`/`edgeIds`).
- **Precondition to document:** the hook keys topology on `theme` object identity — callers must memoize the resolved theme (Unfold already does via `resolveTheme`).

---
*Filed via the improve-codebase-architecture skill. Candidate 1 of 4 deepening candidates identified in `src/lib/`.*
