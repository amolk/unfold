import { useMemo } from "react";
import { useControls } from "leva";
import type { UnfoldStyle, UnfoldTheme } from "../lib";

// Leva lives in the DEMO, not the library. These hooks reconstruct the panels
// the prototype had, but instead of writing into shader uniforms directly they
// build the public `UnfoldTheme` / `UnfoldStyle` objects that get handed to
// <Unfold>. This proves the prop path: every control flows props → resolve →
// uniform, with the same visual result as the original in-component panels.
//
// Only the curated `style.edge.*` surface is exposed (see types.ts) — the ~40
// fine-tuning uniforms that were authoring-time knobs stay baked in the
// library at their tuned defaults and intentionally have no demo control.

/** Theme panel → UnfoldTheme. The two node colors map to `categories.stable` /
 *  `categories.crisis`, which the demo's nodes resolve against via their
 *  `category` field — the real node-color mechanism, not a back door. */
export function useUnfoldThemeControls(): UnfoldTheme {
  const { background, stable, crisis } = useControls("Theme", {
    background: { value: "#1a0810", label: "background" },
    stable: { value: "#8CD0FF", label: "stable color" },
    crisis: { value: "#FFB060", label: "crisis color" },
  });
  return useMemo(
    () => ({ background, categories: { stable, crisis } }),
    [background, stable, crisis],
  );
}

/** Nodes + Edges + Scene panels → UnfoldStyle. */
export function useUnfoldStyleControls(): UnfoldStyle {
  const { baseRadius, rimStrength, opacity } = useControls("Nodes", {
    baseRadius: { value: 0.2, min: 0.02, max: 1.5, step: 0.01, label: "radius" },
    rimStrength: { value: 3, min: 0, max: 3, step: 0.05, label: "rim" },
    opacity: { value: 0.07, min: 0, max: 1, step: 0.01, label: "show spheres" },
  });

  const {
    density,
    streams,
    wispAmplitude,
    wispMorphSpeed,
    wispStretch,
    threadDetail,
    streakLength,
    speed,
    shimmer,
    glintRatio,
    glintIntensity,
  } = useControls("Edges", {
    density: { value: 4000, min: 500, max: 30000, step: 500, label: "per edge" },
    streams: { value: 30, min: 1, max: 256, step: 1, label: "streams/edge" },
    wispAmplitude: { value: 0.15, min: 0, max: 3, step: 0.01, label: "wisp amp" },
    wispMorphSpeed: { value: 0.15, min: 0, max: 1, step: 0.005, label: "wisp morph" },
    wispStretch: { value: 0.7, min: 0.1, max: 20, step: 0.1, label: "wisp stretch" },
    threadDetail: { value: 0.96, min: 0, max: 1, step: 0.01, label: "thread detail" },
    streakLength: { value: 0.6, min: 0, max: 8, step: 0.05, label: "streak" },
    speed: { value: 0.32, min: 0, max: 3, step: 0.01, label: "speed" },
    shimmer: { value: 0.1, min: 0, max: 1, step: 0.01, label: "shimmer" },
    glintRatio: { value: 0.03, min: 0, max: 1, step: 0.01, label: "glint ratio" },
    glintIntensity: { value: 1, min: 1, max: 30, step: 0.1, label: "glint intensity" },
  });

  const { cameraEase, fadeSpeed } = useControls("Scene", {
    cameraEase: { value: 0.005, min: 0.005, max: 0.2, step: 0.005, label: "camera ease" },
    fadeSpeed: { value: 2.0, min: 0.3, max: 10, step: 0.1, label: "fade speed" },
  });

  return useMemo(
    () => ({
      node: { baseRadius, rimStrength, opacity },
      edge: {
        density,
        streams,
        wispAmplitude,
        wispMorphSpeed,
        wispStretch,
        threadDetail,
        streakLength,
        speed,
        shimmer,
        glintRatio,
        glintIntensity,
      },
      camera: { ease: cameraEase },
      fade: { speed: fadeSpeed },
    }),
    [
      baseRadius,
      rimStrength,
      opacity,
      density,
      streams,
      wispAmplitude,
      wispMorphSpeed,
      wispStretch,
      threadDetail,
      streakLength,
      speed,
      shimmer,
      glintRatio,
      glintIntensity,
      cameraEase,
      fadeSpeed,
    ],
  );
}
