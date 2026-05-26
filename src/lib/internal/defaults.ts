// Default theme + scene scalars. These are the values the Leva panels used to
// default to (see the pre-extraction src/scene/theme.ts and the `value:`
// fields across Scene/Nodes/ParticleField). Phase 3 promotes them to the
// public `theme`/`style` props; for now the library hardcodes them so the
// extracted component renders identically to the original prototype.

/** Stable/crisis node colors — formerly the shared Theme panel in theme.ts. */
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

/** Bloom post-processing — formerly the "Bloom" Leva panel in App.tsx. */
export const DEFAULT_BLOOM = {
  intensity: 0.02,
  threshold: 0,
  smoothing: 0.49,
} as const;
