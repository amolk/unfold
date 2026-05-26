// Default theme + style scalars and the resolve helpers that merge the public
// `theme`/`style` props over them. These values are what the Leva panels used
// to default to (see the pre-extraction src/scene/theme.ts and the `value:`
// fields across Scene/Nodes/ParticleField); the library renders identically to
// the original prototype when no theme/style prop is supplied.

import type { UnfoldStyle, UnfoldTheme } from "../types";

/** Canvas clear + fog color. */
export const DEFAULT_BACKGROUND = "#1a0810";

/** Stable/crisis node colors — formerly the shared Theme panel in theme.ts.
 *  These remain the internal color model until Phase 5 replaces the kind-based
 *  coloring with EdgeFlow-driven colors. */
export const DEFAULT_THEME = {
  stableColor: "#8CD0FF",
  crisisColor: "#FFB060",
} as const;

/** Scene-level scalars formerly on the "Explorer" / "Nodes" Leva panels. */
export const DEFAULT_SCENE = {
  cameraEase: 0.005,
  fadeSpeed: 2.0,
  sphereOpacity: 0.07,
  nodeRadius: 0.2,
  rimStrength: 3,
} as const;

/** Particle tunables exposed through `style.edge.*`, at their tuned defaults. */
export const DEFAULT_EDGE = {
  density: 4_000,
  streams: 30,
  wispAmplitude: 0.15,
  wispStretch: 0.7,
  threadDetail: 0.96,
  streakLength: 0.6,
  speed: 0.32,
  shimmer: 0.1,
  glintRatio: 0.03,
  glintIntensity: 1,
} as const;

/** Bloom post-processing — formerly the "Bloom" Leva panel in App.tsx. */
export const DEFAULT_BLOOM = {
  intensity: 0.02,
  threshold: 0,
  smoothing: 0.49,
} as const;

// --- resolved config: the fully-populated shape the internals consume ---

/** Theme with every field resolved to a concrete value. `stableColor` /
 *  `crisisColor` are the internal kind-based colors; they're sourced from
 *  `theme.categories.{stable,crisis}` when present (the node `category` →
 *  color mechanism), else `defaultNodeColor`, else the built-in defaults.
 *  Phase 5 generalizes this to per-node EdgeFlow colors. */
export interface ResolvedTheme {
  background: string;
  stableColor: string;
  crisisColor: string;
}

export interface ResolvedStyle {
  node: {
    baseRadius: number;
    rimStrength: number;
    opacity: number;
  };
  edge: {
    density: number;
    streams: number;
    wispAmplitude: number;
    wispStretch: number;
    threadDetail: number;
    streakLength: number;
    speed: number;
    shimmer: number;
    glintRatio: number;
    glintIntensity: number;
  };
  camera: { ease: number };
  fade: { speed: number };
}

export function resolveTheme(theme?: UnfoldTheme): ResolvedTheme {
  const categories = theme?.categories;
  return {
    background: theme?.background ?? DEFAULT_BACKGROUND,
    stableColor:
      categories?.stable ?? theme?.defaultNodeColor ?? DEFAULT_THEME.stableColor,
    crisisColor: categories?.crisis ?? DEFAULT_THEME.crisisColor,
  };
}

export function resolveStyle(style?: UnfoldStyle): ResolvedStyle {
  const node = style?.node;
  const edge = style?.edge;
  return {
    node: {
      baseRadius: node?.baseRadius ?? DEFAULT_SCENE.nodeRadius,
      rimStrength: node?.rimStrength ?? DEFAULT_SCENE.rimStrength,
      opacity: node?.opacity ?? DEFAULT_SCENE.sphereOpacity,
    },
    edge: {
      density: edge?.density ?? DEFAULT_EDGE.density,
      streams: edge?.streams ?? DEFAULT_EDGE.streams,
      wispAmplitude: edge?.wispAmplitude ?? DEFAULT_EDGE.wispAmplitude,
      wispStretch: edge?.wispStretch ?? DEFAULT_EDGE.wispStretch,
      threadDetail: edge?.threadDetail ?? DEFAULT_EDGE.threadDetail,
      streakLength: edge?.streakLength ?? DEFAULT_EDGE.streakLength,
      speed: edge?.speed ?? DEFAULT_EDGE.speed,
      shimmer: edge?.shimmer ?? DEFAULT_EDGE.shimmer,
      glintRatio: edge?.glintRatio ?? DEFAULT_EDGE.glintRatio,
      glintIntensity: edge?.glintIntensity ?? DEFAULT_EDGE.glintIntensity,
    },
    camera: { ease: style?.camera?.ease ?? DEFAULT_SCENE.cameraEase },
    fade: { speed: style?.fade?.speed ?? DEFAULT_SCENE.fadeSpeed },
  };
}
