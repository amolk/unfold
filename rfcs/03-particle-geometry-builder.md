# RFC: Deepen the particle geometry/texture builders into a pure, seedable core

## Problem

`ParticleField.tsx` (458 LOC) does four separable jobs in one component:

1. **Per-particle geometry distribution** (`ParticleField.tsx:247-342`) — a dense ~95-LOC algorithm: distribute `particlesPerEdge × edgeCount` particles across edges *by weight* → into *streams* (sharing a radial cross-section anchor) → emitting 9 per-particle attribute arrays (`position`, `curveIndex`, `phase`, `speed`, `seed`, `colorIndex`, `radialAngle`, `radialRadius`, `streamId`). It includes weight-proportional `share`, stream-count clamping, a `proportions`→`colorIndex` CDF sampler, even per-stream distribution with remainder spill, per-edge speed jitter, and a tail-fill loop for slots left by rounding.
2. **Curve-texture baking** (190-214) — pure: sample each edge bezier into a `DataTexture`.
3. **Edge-color-palette baking** (219-241) — pure: bake each edge's 1–8 colors into an 8×N `DataTexture`.
4. A **~70-field uniform bag** (109-187) with no semantic grouping, plus zoom-driven controls, ~7 prop→uniform effects, and the render loop.

Concern #1 is the highest-value target: it is complex, explicitly hard to modify, **untestable**, *and* **non-deterministic** — it calls `Math.random()` ~12 times inline, so today no distribution property (share ∝ weight, color histogram, stream-anchor sharing) can be asserted at all. The repo has **zero tests**.

## Proposed Interface

Extract the three pure builders, with an **injectable RNG seam** for determinism. The dense algorithm becomes a THREE-free function; the `BufferGeometry`/`DataTexture` assembly is a thin shell over the plain typed arrays it returns. (All three explored designs converged on this identical core — it is the non-negotiable win. The grouped-uniforms cleanup below is grafted from the "fat hook" design as an independently-justified readability fix.)

### The pure core (THREE-free distribution; texture builders return raw payloads)

```ts
// src/lib/internal/particle-core.ts
export type Rng = () => number;   // contract of both Math.random and mulberry32

export interface ParticleAttributes {
  count: number;
  position: Float32Array;     // count*3, dummy (shader overrides)
  curveIndex: Float32Array; phase: Float32Array; speed: Float32Array; seed: Float32Array;
  colorIndex: Float32Array;   // CDF-drawn palette slot 0..7
  radialAngle: Float32Array; radialRadius: Float32Array;  // per-stream shared
  streamId: Float32Array;     // global monotonic
}

/** Pure given (timeline, opts, rng): identical inputs → identical outputs.
 *  Imports NO THREE. Every random draw goes through `rng` (default Math.random). */
export function buildParticleAttributes(
  timeline: Timeline,
  opts: { particleCount: number; streamsPerEdge: number; speedBase?: number },
  rng?: Rng,
): ParticleAttributes;

/** CPU-side texture payload: raw RGBA buffer + dims. Test asserts on `.data`;
 *  the caller wraps via toDataTexture() — keeps tests free of a GL context. */
export interface TexturePayload { data: Float32Array; width: number; height: number; }
export function buildCurveTexture(timeline: Timeline, samplesPerCurve: number): TexturePayload;
export function buildEdgeColorTexture(timeline: Timeline): TexturePayload;
export function toDataTexture(p: TexturePayload): THREE.DataTexture;  // the one THREE shell
```

### Usage — the three `useMemo` blocks become builder calls (dep lists unchanged)

```ts
const curveTexture   = useMemo(() => toDataTexture(buildCurveTexture(timeline, samplesPerCurve)), [timeline, samplesPerCurve]);
const edgeColorTex    = useMemo(() => toDataTexture(buildEdgeColorTexture(timeline)), [timeline]);
const particleCount   = Math.max(1, particlesPerEdge * timeline.edges.length);
const geometry = useMemo(() => {
  const a = buildParticleAttributes(timeline, { particleCount, streamsPerEdge }); // rng → Math.random in prod
  return assembleParticleGeometry(a);   // ~12-line private THREE shell, unchanged behavior
}, [timeline, particleCount, streamsPerEdge]);  // byte-identical key → streams still restart on rebuild
```

### Included cleanup — group the ~70-uniform bag semantically

Break the flat object into named sub-groups (`wisp`, `shimmer`, `nodeBulge`, `wind`, `glint`, `grain`, `zoom`, `core`) that share the *same* `{ value }` cells, flattened once via `Object.assign` for `<shaderMaterial>` (three.js wants flat). Each prop→uniform effect then writes one named group instead of scanning 70 fields. This preserves the load-bearing stable-reference / in-place-mutation invariant (rebuilding the uniform object would reset `uTime` and force a full rebind).

### What complexity it hides

`buildParticleAttributes` encapsulates: weight→share rounding (and *why* tail-fill exists), the stream clamp `max(1, min(streamsPerEdge, share))` + global `streamId` counter, the CDF over `proportions.slice(0,8)` with the zero-guard, even split + remainder spill, the per-edge single `edgeSpeed` and per-stream shared `sqrt(rand)` radial anchor, phase staggering+jitter, the tail-fill loop, and the `p < particleCount` overrun guard. The texture builders hide the row/col texel layout, the `cols[s] ?? cols[0] ?? "#ffffff"` fallback, the empty-timeline `max(1, edges)` guard, and the DataTexture filter/wrap boilerplate.

## Dependency Strategy

**In-process, no new packages.** `particle-core.ts`'s `buildParticleAttributes` imports only the `Timeline` *type* — zero value imports, a pure numeric module testable in plain Node. The texture builders import THREE only for `Color.set()` parsing and the final `DataTexture` wrap, and return raw `Float32Array` payloads so tests never construct a texture or a GL context.

**The RNG seam is the one injectable dependency.** `Rng = () => number` — the exact shape of both `Math.random` and `mulberry32`. `buildParticleAttributes(…, rng = Math.random)`: production passes nothing and gets today's non-deterministic visuals byte-for-byte; tests pass a seeded `mulberry32`. The invariant a reviewer checks: a grep for `Math.random` in the core returns zero hits (every draw goes through `rng`). **Promote the repeated `mulberry32`** (currently duplicated ~6× across `buildDag.ts`, `demo-data.ts`, etc.) into one canonical `src/lib/internal/rng.ts` that both the core and tests import.

## Testing Strategy

**New boundary tests** (seeded `mulberry32`, no React/GPU — each encoding *why* the invariant matters):

- **Share ∝ weight:** a 3:1 weight ratio yields ~3:1 particle counts by `curveIndex` — breaks if share stops tracking weight.
- **Color histogram ≈ proportions:** with `proportions=[0.2,0.3,0.5]`, the `colorIndex` histogram matches within tolerance — breaks if CDF sampling is swapped for uniform.
- **Per-stream anchor sharing:** every particle with the same `streamId` shares one `radialAngle`/`radialRadius` — breaks if the anchor is moved inside the particle loop (which would visually smear the wisp).
- **Tail-fill coverage:** weights forcing `Σ round(share) < particleCount` leave no slot at the sentinel default (every `speed > 0`) — breaks if tail-fill is dropped.
- **Determinism:** same seed → byte-identical buffers — encodes that a rebuild must restart streams *reproducibly*.
- **Texture builders:** curve payload length `= samplesPerCurve × edges × 4`; endpoint samples equal `sampleBezier(...,0/1)`; edge-color repeats slot 0 into empty slots; empty timeline → `height === 1`.

**Old tests to delete:** none (zero current tests).

**Test environment needs:** vitest only. `buildParticleAttributes` needs no THREE at all; texture-payload assertions read `.data` directly.

## Implementation Recommendations

- **The core should own:** the entire distribution algorithm (share/stream/CDF/spill/tail-fill), the per-particle attribute math, and the texel layout of both textures. It returns plain typed arrays / payloads.
- **It should hide:** all the rounding/clamp/spill reasoning and the RNG draws.
- **It should expose:** `buildParticleAttributes`, `buildCurveTexture`, `buildEdgeColorTexture`, `toDataTexture`, and `Rng` — nothing else.
- **Return arrays, not a `BufferGeometry`.** Keep `assembleParticleGeometry` (the `setAttribute` calls + `boundingSphere`) as a thin, untested, branch-free shell in the component — dragging THREE into the testable core buys nothing.
- **RNG is the only nondeterminism seam:** funnel every `Math.random()` through the injected `rng`; default to `Math.random` so production is unchanged; promote `mulberry32` to one shared module.
- **Preserve rebuild semantics exactly:** copy the `useMemo` dep lists verbatim (`[timeline, particleCount, streamsPerEdge]` etc.) — moving logic into a pure function must not change *when* React rebuilds (a rebuild still restarts streams).
- **Group the uniform bag** into semantic sub-objects sharing the same `{value}` cells; flatten once for the shader. This is a readability fix justified independently of the distribution extraction.
- **Fix the latent texture-disposal leak** while here: dispose the prior curve/edge-color `DataTexture` when the memo replaces it (the projection's mirrors are one-shot, but these per-timeline textures are not).
- **Rejected as premature:** a pluggable `DistributionStrategy` / `ChannelDescriptor` / `ParticleSpec` abstraction. There is exactly one strategy and nine fixed channels today; the interface would add four types and a per-particle `Map.get` hot-path cost (×9 ×~10⁶ particles/rebuild) for hypothetical future strategies. Revisit only when a second distribution strategy is genuinely on the roadmap — the pure `buildParticleAttributes` is a 5-minute promotion to a strategy interface at that point, since it's already pure and RNG-seamed.
- **Deferred (optional) follow-up:** a fat `useParticleSystem` hook that slims `ParticleField` to ~25 lines of JSX by absorbing the uniforms/effects/zoom-loop. This is component-*slimming*, not added testability (it wraps the same pure core), and carries a god-hook risk — keep it separate from this testability-focused refactor.

---
*Filed via the improve-codebase-architecture skill. Candidate 3 of 4 deepening candidates identified in `src/lib/`.*
