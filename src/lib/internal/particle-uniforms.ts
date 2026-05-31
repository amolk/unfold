import * as THREE from "three";
import type { NodeBulgeData } from "./scene-projection";

// The particle ShaderMaterial's ~60 uniforms, organized into named semantic
// groups for readability and merged into the single flat map three.js wants.
// Values are the live defaults (the only source of truth now that the Leva
// panels are gone); a subset is patched from style.edge.* and the zoom controls
// by the effects/frame loop in ParticleField. Grouping is purely organizational
// — the flattened result is byte-identical to the previous inline object, which
// particle-uniforms.test.ts asserts.

/** Build the flat uniform map. Called once per material lifetime; values are
 *  mutated in place afterward (rebuilding would reset uTime + force a rebind). */
export function createParticleUniforms(
  nodeBulge: NodeBulgeData,
): Record<string, THREE.IUniform> {
  const time = {
    uTime: { value: 0 },
  };
  const textures = {
    uCurves: { value: null as THREE.DataTexture | null },
    uEdgeColors: { value: null as THREE.DataTexture | null },
    uEdgeFades: { value: null as THREE.DataTexture | null },
    uEdgeFadeTexHeight: { value: 1 },
    uCurveTexWidth: { value: 1 },
    uCurveTexHeight: { value: 1 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  };
  const render = {
    uPointSize: { value: 1 },
    uMinPointSize: { value: 1 },
    uTubeRadius: { value: 0 },
    uStreakAmp: { value: 0.6 },
    uSpeedScale: { value: 0.32 },
    uIntensity: { value: 0.1 },
  };
  const wisp = {
    uWispAmp: { value: 0.15 },
    uWispStretch: { value: 0.7 },
    uWispMorphSpeed: { value: 0.15 },
    uWispOctave: { value: 0.08 },
    uEdgeFlowSpread: { value: 0 },
    uStreamPerturb: { value: 0.96 },
  };
  const wind = {
    uWindDir: { value: new THREE.Vector3(0.6, 0.1, 0) },
    uWindStrength: { value: 0.04 },
    uWindSpeed: { value: 0.3 },
    uGustAmp: { value: 0 },
    uGustSpeed: { value: 0 },
  };
  // Misc per-particle dynamics (pin/tail/bunch/burst) that don't group cleanly.
  const dynamics = {
    uPinHead: { value: 0 },
    uPinTail: { value: 0 },
    uTailBloom: { value: 0 },
    uBunchFreq: { value: 0 },
    uBunchContrast: { value: 0 },
    uBunchTime: { value: 0 },
    uBurstEnable: { value: 0 },
    uBurstRate: { value: 60 },
  };
  const color = {
    uStableColor: { value: new THREE.Color() },
    uCrisisColor: { value: new THREE.Color() },
  };
  const shimmer = {
    uShimmerSpikeFreq: { value: 1.1 },
    uShimmerSpikeAmp: { value: 0 },
    uShimmerSharpness: { value: 34.5 },
    uShimmerSlowFreq: { value: 0.2 },
    uShimmerSlowAmp: { value: 0.1 },
    uShimmerDepth: { value: 1.0 },
  };
  // Node-bulge samplers + shaping. The texture uniforms point at the parent's
  // mirrored DataTextures (mutated each frame); see scene-projection.
  const node = {
    uNodeCount: { value: 0 },
    uNodePosFadeTex: { value: nodeBulge.posFade.texture },
    uNodeColorEmphTex: { value: nodeBulge.colorEmph.texture },
    uNodeTexHeight: { value: nodeBulge.texHeight },
    uNodeRadius: { value: 0.13 },
    uNodeEmphRadius: { value: 0.14 },
    uNodeBulgeSize: { value: 0 },
    uNodeColorMix: { value: 0 },
    uNodeBoost: { value: 0 },
    uNodeDriftBoost: { value: 0 },
    uNodeSwirlStrength: { value: 0 },
    uNodeSwirlSpeed: { value: 0 },
    uNodeGravity: { value: 0 },
    uNodeCenterGravity: { value: -0.22 },
    uNodeCoreStrength: { value: 0 },
    uNodeVolume: { value: 0.07 },
  };
  const glint = {
    uGlintRatio: { value: 0.03 },
    uGlintSizeMult: { value: 4 },
    uGlintIntensity: { value: 1 },
  };
  // Per-edge selection highlight. uEdgeSelected is a 1×(edge count) texture
  // (R = 0/1) sampled by aCurveIndex; selected edges get their particles
  // brightened and enlarged. See ParticleField / particles.vert.
  const selected = {
    uEdgeSelected: { value: null as THREE.DataTexture | null },
    uSelectedBrightness: { value: 2 },
    uSelectedSizeMul: { value: 1.7 },
  };
  const grain = {
    uGrainCore: { value: 80 },
    uGrainHalo: { value: 8.7 },
    uGrainHaloAmp: { value: 0 },
  };

  return Object.assign(
    {},
    time,
    textures,
    render,
    wisp,
    wind,
    dynamics,
    color,
    shimmer,
    node,
    glint,
    selected,
    grain,
  );
}
