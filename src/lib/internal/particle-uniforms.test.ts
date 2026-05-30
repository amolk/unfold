import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createParticleUniforms } from "./particle-uniforms";
import { createMirroredTexture } from "./gpu-mirror";

// Guards the grouped-uniform refactor: the flattened map must have EXACTLY the
// same uniform keys (no drop/rename/typo) and the same default values as the
// previous inline object, so the shader receives byte-identical input.

// The full set of uniform names the shader binds (captured from the original
// inline object). A drift here is the exact failure mode the regroup risks.
const EXPECTED_KEYS = [
  "uBunchContrast", "uBunchFreq", "uBunchTime", "uBurstEnable", "uBurstRate",
  "uCrisisColor", "uCurveTexHeight", "uCurveTexWidth", "uCurves", "uEdgeColors",
  "uEdgeFadeTexHeight", "uEdgeFades", "uEdgeFlowSpread", "uGlintIntensity",
  "uGlintRatio", "uGlintSizeMult", "uGrainCore", "uGrainHalo", "uGrainHaloAmp",
  "uGustAmp", "uGustSpeed", "uIntensity", "uMinPointSize", "uNodeBoost",
  "uNodeBulgeSize", "uNodeCenterGravity", "uNodeColorEmphTex", "uNodeColorMix",
  "uNodeCoreStrength", "uNodeCount", "uNodeDriftBoost", "uNodeEmphRadius",
  "uNodeGravity", "uNodePosFadeTex", "uNodeRadius", "uNodeSwirlSpeed",
  "uNodeSwirlStrength", "uNodeTexHeight", "uNodeVolume", "uPinHead", "uPinTail",
  "uPointSize", "uResolution", "uShimmerDepth", "uShimmerSharpness",
  "uShimmerSlowAmp", "uShimmerSlowFreq", "uShimmerSpikeAmp", "uShimmerSpikeFreq",
  "uSpeedScale", "uStableColor", "uStreakAmp", "uStreamPerturb", "uTailBloom",
  "uTime", "uTubeRadius", "uWindDir", "uWindSpeed", "uWindStrength", "uWispAmp",
  "uWispMorphSpeed", "uWispOctave", "uWispStretch",
].sort();

const makeBulge = () => ({
  posFade: createMirroredTexture(4),
  colorEmph: createMirroredTexture(4),
  count: { value: 0 },
  texHeight: 4,
});

describe("createParticleUniforms", () => {
  const bulge = makeBulge();
  const u = createParticleUniforms(bulge);

  it("produces exactly the expected uniform key set", () => {
    expect(Object.keys(u).sort()).toEqual(EXPECTED_KEYS);
  });

  it("every entry is an { value } cell", () => {
    for (const k of Object.keys(u)) expect(u[k]).toHaveProperty("value");
  });

  it("preserves representative scalar defaults across groups", () => {
    expect(u.uTime.value).toBe(0);
    expect(u.uPointSize.value).toBe(1);
    expect(u.uWispAmp.value).toBe(0.15);
    expect(u.uStreamPerturb.value).toBe(0.96);
    expect(u.uSpeedScale.value).toBe(0.32);
    expect(u.uShimmerSharpness.value).toBe(34.5);
    expect(u.uNodeCenterGravity.value).toBe(-0.22);
    expect(u.uWindStrength.value).toBe(0.04);
    expect(u.uBurstRate.value).toBe(60);
    expect(u.uGrainCore.value).toBe(80);
    expect(u.uGrainHalo.value).toBe(8.7);
    expect(u.uNodeRadius.value).toBe(0.13);
  });

  it("preserves vector/color defaults", () => {
    expect(u.uResolution.value).toBeInstanceOf(THREE.Vector2);
    expect((u.uResolution.value as THREE.Vector2).toArray()).toEqual([1, 1]);
    expect((u.uWindDir.value as THREE.Vector3).toArray()).toEqual([0.6, 0.1, 0]);
    expect(u.uStableColor.value).toBeInstanceOf(THREE.Color);
    expect(u.uCrisisColor.value).toBeInstanceOf(THREE.Color);
  });

  it("points node samplers at the provided bulge textures", () => {
    expect(u.uNodePosFadeTex.value).toBe(bulge.posFade.texture);
    expect(u.uNodeColorEmphTex.value).toBe(bulge.colorEmph.texture);
    expect(u.uNodeTexHeight.value).toBe(4);
  });
});
