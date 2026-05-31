// Default theme + style scalars and the resolve helpers that merge the public
// `theme`/`style` props over them. These values are what the Leva panels used
// to default to (see the pre-extraction src/scene/theme.ts and the `value:`
// fields across Scene/Nodes/ParticleField); the library renders identically to
// the original prototype when no theme/style prop is supplied.

import type { UnfoldStyle, UnfoldTheme } from "../types";

/** Canvas clear + fog color. */
export const DEFAULT_BACKGROUND = "#1a0810";

/** Default node + edge palette. Names are vestigial from the prototype's
 *  stable/crisis dichotomy and stay because Scene/Nodes/projection still
 *  reference them; semantically `stableColor` is now "default node color"
 *  and `crisisColor` is the warm/red accent used for the legacy bulge
 *  shading. The actual default edge stream is the multi-color
 *  DEFAULT_EDGE_FLOW below.
 *  Gold + deep red picks up the Foundation desert-and-empire palette the
 *  project is themed around. */
export const DEFAULT_THEME = {
  stableColor: "#F5D8B9", // gold — default node color
  crisisColor: "#871B24", // red  — accent
} as const;

/** Default particle-stream mix for edges with no `flow` spec. Red-dominant
 *  with a gold rhythm and a faint blue thread — the desert/empire palette
 *  plus a cool counterpoint.
 *
 *  Gold is `#D4A642` (deeper amber) rather than the design-doc's pale
 *  `#F5D8B9`: with additive blending + bloom, two or three pale-gold
 *  particles overlap and saturate every channel to 1.0, reading as pure
 *  white. The amber stays visibly gold even where particles stack.
 *
 *  Overridden by `theme.defaultEdgeColor` (collapses to a single-color
 *  stream) or by a per-edge `flow`. */
export const DEFAULT_EDGE_FLOW = {
  colors: ["#871B24", "#D4A642", "#5BA3D9"],
  proportions: [90, 5, 5],
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
  // Default to a slow, lava-lamp-like drift so the wisps visibly evolve over
  // time. 0 = frozen pattern (the original Leva default; needed the slider
  // dragged before paths moved).
  wispMorphSpeed: 0.15,
  wispStretch: 0.7,
  threadDetail: 0.96,
  streakLength: 0.6,
  speed: 0.32,
  shimmer: 0.1,
  glintRatio: 0.03,
  glintIntensity: 1,
  selectedBrightness: 2,
  selectedSizeMultiplier: 1.7,
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
  /** Fallback hex used for a node with no `color` and no matching
   *  `category` entry. */
  defaultNodeColor: string;
  /** Generic category → color map. Defaults to {stable, crisis} from
   *  DEFAULT_THEME so the prototype's two-tone data still has colors when
   *  no theme is provided; caller-supplied entries override or extend. */
  categories: Record<string, string>;
  /** Particle-stream mix used for any edge with no `flow` spec. If the
   *  caller sets `theme.defaultEdgeColor` this collapses to a single-color
   *  stream; otherwise it's `DEFAULT_EDGE_FLOW`. */
  defaultEdgeFlow: { colors: string[]; proportions: number[] };
  /** Rim tint used for nodes whose id appears in `selectedNodeIds`. */
  highlight: string;
}

/** Default highlight color — a pale warm white that reads on both the cool
 *  stable and warm crisis defaults. */
const DEFAULT_HIGHLIGHT = "#ffffff";

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
    wispMorphSpeed: number;
    wispStretch: number;
    threadDetail: number;
    streakLength: number;
    speed: number;
    shimmer: number;
    glintRatio: number;
    glintIntensity: number;
    selectedBrightness: number;
    selectedSizeMultiplier: number;
  };
  camera: { ease: number };
  fade: { speed: number };
}

export function resolveTheme(theme?: UnfoldTheme): ResolvedTheme {
  const userCategories = theme?.categories;
  // Fold user categories on top of the {stable, crisis} default pair so
  // prototype data without an explicit theme still gets two distinct colors,
  // while arbitrary new category names ("input", "task", whatever) work too.
  const categories: Record<string, string> = {
    stable: DEFAULT_THEME.stableColor,
    crisis: DEFAULT_THEME.crisisColor,
    ...(userCategories ?? {}),
  };
  const defaultNodeColor =
    theme?.defaultNodeColor ?? DEFAULT_THEME.stableColor;
  // If the caller picked an explicit single edge color (theme.defaultEdgeColor
  // or — for legacy — categories.stable / defaultNodeColor), collapse the
  // default flow to that one color. Otherwise use the multi-color default mix.
  const singleEdgeColor =
    theme?.defaultEdgeColor ?? userCategories?.stable ?? theme?.defaultNodeColor;
  const defaultEdgeFlow = singleEdgeColor
    ? { colors: [singleEdgeColor], proportions: [1] }
    : {
        colors: [...DEFAULT_EDGE_FLOW.colors],
        proportions: [...DEFAULT_EDGE_FLOW.proportions],
      };
  return {
    background: theme?.background ?? DEFAULT_BACKGROUND,
    stableColor: categories.stable,
    crisisColor: categories.crisis,
    defaultNodeColor,
    categories,
    defaultEdgeFlow,
    highlight: theme?.highlight ?? DEFAULT_HIGHLIGHT,
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
      wispMorphSpeed: edge?.wispMorphSpeed ?? DEFAULT_EDGE.wispMorphSpeed,
      wispStretch: edge?.wispStretch ?? DEFAULT_EDGE.wispStretch,
      threadDetail: edge?.threadDetail ?? DEFAULT_EDGE.threadDetail,
      streakLength: edge?.streakLength ?? DEFAULT_EDGE.streakLength,
      speed: edge?.speed ?? DEFAULT_EDGE.speed,
      shimmer: edge?.shimmer ?? DEFAULT_EDGE.shimmer,
      glintRatio: edge?.glintRatio ?? DEFAULT_EDGE.glintRatio,
      glintIntensity: edge?.glintIntensity ?? DEFAULT_EDGE.glintIntensity,
      selectedBrightness: edge?.selectedBrightness ?? DEFAULT_EDGE.selectedBrightness,
      selectedSizeMultiplier:
        edge?.selectedSizeMultiplier ?? DEFAULT_EDGE.selectedSizeMultiplier,
    },
    camera: { ease: style?.camera?.ease ?? DEFAULT_SCENE.cameraEase },
    fade: { speed: style?.fade?.speed ?? DEFAULT_SCENE.fadeSpeed },
  };
}
