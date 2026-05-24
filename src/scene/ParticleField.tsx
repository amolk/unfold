import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls, folder } from "leva";
import * as THREE from "three";
import { Timeline, sampleBezier } from "../timeline/generate";
import { particlesVert } from "./particles.vert.glsl";
import { particlesFrag } from "./particles.frag.glsl";

// No-op raycast so the particle field never participates in click intersection.
const noopRaycast = () => {};

export interface NodeBulgeData {
  /** xyz = world position, w = per-node fade. Length = MAX_NODES * 4. */
  posFade: Float32Array;
  /** rgb = color, w = focus emphasis (0 or 1). Length = MAX_NODES * 4. */
  colorEmph: Float32Array;
  /** Number of valid entries in the arrays (capped at MAX_NODES). */
  count: { value: number };
}

interface ParticleFieldProps {
  timeline: Timeline;
  /** 1×N RGBA float texture; R channel = per-edge fade in [0,1]. Mutated by
   *  the owner each frame; we just point a uniform at it. */
  edgeFadeTexture: THREE.DataTexture;
  /** Per-node bulge data. Backing arrays are mutated by the owner each frame
   *  — we share the same references so the GPU sees the latest values. */
  nodeBulge: NodeBulgeData;
}

export function ParticleField({
  timeline,
  edgeFadeTexture,
  nodeBulge,
}: ParticleFieldProps) {
  const { size } = useThree();
  const materialRef = useRef<THREE.ShaderMaterial>(null!);

  const {
    particleCount,
    samplesPerCurve,
    pointSize,
    tubeRadius,
    driftAmp,
    driftScale,
    driftCoherence,
    speedScale,
    intensity,
    stableColor,
    crisisColor,
    shimmerSpikeFreq,
    shimmerSpikeAmp,
    shimmerSharpness,
    shimmerSlowFreq,
    shimmerSlowAmp,
    shimmerDepth,
    nodeBulgeSize,
    nodeRadius,
    nodeEmphRadius,
    nodeColorMix,
    nodeBoost,
    nodeDriftBoost,
    nodeSwirlStrength,
    nodeSwirlSpeed,
    nodeGravity,
    nodeCenterGravity,
    nodeCoreStrength,
    windX,
    windY,
    windZ,
    windStrength,
    windSpeed,
    glintRatio,
    glintSizeMult,
    glintIntensity,
    glintTint,
    grainCore,
    grainHalo,
    grainHaloAmp,
  } = useControls("Particles", {
    particleCount: { value: 400_000, min: 10_000, max: 800_000, step: 10_000 },
    samplesPerCurve: { value: 64, min: 16, max: 256, step: 16 },
    pointSize: { value: 3.6, min: 0.5, max: 30, step: 0.1 },
    tubeRadius: { value: 0.12, min: 0, max: 2.0, step: 0.01 },
    driftAmp: { value: 0.19, min: 0, max: 2.0, step: 0.01 },
    driftCoherence: { value: 0.85, min: 0, max: 1, step: 0.01, label: "drift coherence" },
    speedScale: { value: 1.22, min: 0, max: 3, step: 0.01 },
    driftScale: { value: 0.1, min: 0.1, max: 8.0, step: 0.05 },
    intensity: { value: 0.15, min: 0.005, max: 1, step: 0.005 },
    stableColor: "#8aa896",
    crisisColor: "#d06030",
    Shimmer: folder({
      shimmerSpikeFreq: { value: 1.1, min: 0, max: 20, step: 0.1, label: "spike freq" },
      shimmerSpikeAmp: { value: 5.0, min: 0, max: 10, step: 0.05, label: "spike amp" },
      shimmerSharpness: { value: 34.5, min: 1, max: 60, step: 0.5, label: "spike sharpness" },
      shimmerSlowFreq: { value: 0.2, min: 0, max: 5, step: 0.05, label: "slow freq" },
      shimmerSlowAmp: { value: 0.1, min: 0, max: 1, step: 0.01, label: "slow amp" },
      shimmerDepth: { value: 1.0, min: 0, max: 1, step: 0.01, label: "depth" },
    }),
    "Node bulge": folder({
      nodeRadius: { value: 0.32, min: 0.05, max: 3, step: 0.01, label: "radius" },
      nodeEmphRadius: { value: 0.35, min: 0.05, max: 4, step: 0.01, label: "focus radius" },
      nodeBulgeSize: { value: 0.2, min: 0, max: 15, step: 0.1, label: "size boost" },
      nodeColorMix: { value: 0, min: 0, max: 1, step: 0.01, label: "color mix" },
      nodeBoost: { value: 1.55, min: 0, max: 10, step: 0.05, label: "brightness" },
      nodeDriftBoost: { value: 0, min: 0, max: 20, step: 0.1, label: "drift boost" },
      nodeSwirlStrength: { value: 0, min: 0, max: 2, step: 0.01, label: "swirl amp" },
      nodeSwirlSpeed: { value: 0, min: 0, max: 10, step: 0.05, label: "swirl speed" },
      nodeGravity: { value: 0, min: -1, max: 1, step: 0.01, label: "radial bias" },
      nodeCenterGravity: { value: 0, min: -2, max: 2, step: 0.01, label: "center pull" },
      nodeCoreStrength: { value: 4.0, min: 0, max: 20, step: 0.1, label: "core spike" },
    }),
    Wind: folder({
      windX: { value: 0.6, min: -1, max: 1, step: 0.05, label: "x" },
      windY: { value: 0.1, min: -1, max: 1, step: 0.05, label: "y" },
      windZ: { value: 0, min: -1, max: 1, step: 0.05, label: "z" },
      windStrength: { value: 0.04, min: 0, max: 1, step: 0.005, label: "strength" },
      windSpeed: { value: 0.3, min: 0, max: 3, step: 0.05, label: "gust speed" },
    }),
    Glints: folder({
      glintRatio: { value: 0.07, min: 0, max: 1, step: 0.01, label: "ratio" },
      glintSizeMult: { value: 1.3, min: 1, max: 8, step: 0.1, label: "size mult" },
      glintIntensity: { value: 3.6, min: 1, max: 30, step: 0.1, label: "intensity" },
      glintTint: { value: "#ffd9a0", label: "tint" },
    }),
    Grain: folder({
      grainCore: { value: 40, min: 1, max: 80, step: 0.5, label: "core sharpness" },
      grainHalo: { value: 1.3, min: 0.5, max: 10, step: 0.1, label: "halo sharpness" },
      grainHaloAmp: { value: 0, min: 0, max: 1, step: 0.01, label: "halo amp" },
    }),
  });

  // --- bake curves into a DataTexture (rows = curves, cols = samples) ---
  const curveTexture = useMemo(() => {
    const w = samplesPerCurve;
    const h = timeline.edges.length;
    const data = new Float32Array(w * h * 4);
    const tmp = new THREE.Vector3();
    for (let row = 0; row < h; row++) {
      const edge = timeline.edges[row];
      for (let col = 0; col < w; col++) {
        const t = col / (w - 1);
        sampleBezier(edge.controls, t, tmp);
        const i = (row * w + col) * 4;
        data[i + 0] = tmp.x;
        data[i + 1] = tmp.y;
        data[i + 2] = tmp.z;
        data[i + 3] = 1.0;
      }
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }, [timeline, samplesPerCurve]);

  // --- per-particle attribute buffers, distributed by edge weight ---
  const geometry = useMemo(() => {
    const totalWeight = timeline.edges.reduce((s, e) => s + e.weight, 0);
    const positions = new Float32Array(particleCount * 3); // dummy (shader overrides)
    const curveIndex = new Float32Array(particleCount);
    const phase = new Float32Array(particleCount);
    const speed = new Float32Array(particleCount);
    const seed = new Float32Array(particleCount);
    const fromCrisis = new Float32Array(particleCount);
    const toCrisis = new Float32Array(particleCount);
    const radialAngle = new Float32Array(particleCount);
    const radialRadius = new Float32Array(particleCount);

    let p = 0;
    timeline.edges.forEach((edge, idx) => {
      const share = Math.round((edge.weight / totalWeight) * particleCount);
      const fc = edge.fromKind === "crisis" ? 1 : 0;
      const tc = edge.toKind === "crisis" ? 1 : 0;
      const speedBase = edge.toKind === "crisis" || edge.fromKind === "crisis" ? 0.045 : 0.06;
      for (let k = 0; k < share && p < particleCount; k++, p++) {
        curveIndex[p] = idx;
        phase[p] = Math.random();
        speed[p] = speedBase * (0.6 + Math.random() * 0.9);
        seed[p] = Math.random() * 1000;
        fromCrisis[p] = fc;
        toCrisis[p] = tc;
        radialAngle[p] = Math.random() * Math.PI * 2;
        // sqrt for uniform area distribution across the disc cross-section
        // (otherwise particles cluster near the axis).
        radialRadius[p] = Math.sqrt(Math.random());
      }
    });
    while (p < particleCount) {
      curveIndex[p] = 0;
      phase[p] = Math.random();
      speed[p] = 0.06;
      seed[p] = Math.random() * 1000;
      fromCrisis[p] = 0;
      toCrisis[p] = 0;
      radialAngle[p] = Math.random() * Math.PI * 2;
      radialRadius[p] = Math.sqrt(Math.random());
      p++;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("aCurveIndex", new THREE.BufferAttribute(curveIndex, 1));
    geom.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    geom.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
    geom.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geom.setAttribute("aFromCrisis", new THREE.BufferAttribute(fromCrisis, 1));
    geom.setAttribute("aToCrisis", new THREE.BufferAttribute(toCrisis, 1));
    geom.setAttribute("aRadialAngle", new THREE.BufferAttribute(radialAngle, 1));
    geom.setAttribute("aRadialRadius", new THREE.BufferAttribute(radialRadius, 1));
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 100);
    return geom;
  }, [timeline, particleCount]);

  // Build the uniforms object once per material lifetime — values are mutated
  // in place when the leva controls change so the shader updates live without
  // recompiling.
  // Uniforms are created ONCE per mount and mutated in place. Rebuilding the
  // object on timeline changes would reset uTime (visibly freezing animation)
  // and force three.js to rebind every uniform — instead we keep the references
  // stable and patch values via the effects below.
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCurves: { value: null as THREE.DataTexture | null },
      uEdgeFades: { value: null as THREE.DataTexture | null },
      uCurveTexWidth: { value: 1 },
      uCurveTexHeight: { value: 1 },
      uPointSize: { value: 1 },
      uTubeRadius: { value: 0 },
      uDriftAmp: { value: 0 },
      uDriftScale: { value: 1 },
      uDriftCoherence: { value: 0 },
      uSpeedScale: { value: 1 },
      uIntensity: { value: 0.1 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uStableColor: { value: new THREE.Color() },
      uCrisisColor: { value: new THREE.Color() },
      uShimmerSpikeFreq: { value: 0 },
      uShimmerSpikeAmp: { value: 0 },
      uShimmerSharpness: { value: 1 },
      uShimmerSlowFreq: { value: 0 },
      uShimmerSlowAmp: { value: 0 },
      uShimmerDepth: { value: 0 },
      // Bulge: arrays + count. Backing Float32Arrays are owned by the parent
      // and mutated each frame; we point the uniform value at them.
      uNodeCount: { value: 0 },
      uNodePosFade: { value: nodeBulge.posFade },
      uNodeColorEmph: { value: nodeBulge.colorEmph },
      uNodeRadius: { value: 0.45 },
      uNodeEmphRadius: { value: 0.8 },
      uNodeBulgeSize: { value: 0 },
      uNodeColorMix: { value: 0 },
      uNodeBoost: { value: 0 },
      uNodeDriftBoost: { value: 0 },
      uNodeSwirlStrength: { value: 0 },
      uNodeSwirlSpeed: { value: 0 },
      uNodeGravity: { value: 0 },
      uNodeCenterGravity: { value: 0 },
      uNodeCoreStrength: { value: 0 },
      uWindDir: { value: new THREE.Vector3() },
      uWindStrength: { value: 0 },
      uWindSpeed: { value: 0 },
      uGlintRatio: { value: 0 },
      uGlintSizeMult: { value: 1 },
      uGlintIntensity: { value: 1 },
      uGlintTint: { value: new THREE.Color(1, 0.85, 0.65) },
      uGrainCore: { value: 12 },
      uGrainHalo: { value: 3 },
      uGrainHaloAmp: { value: 0.1 },
    }),
    // The bulge arrays only change identity when Scene rebuilds them; otherwise
    // we just mutate in place. We don't list nodeBulge here because creating
    // new uniform objects on every render would re-bind every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Repoint the bulge array uniforms whenever the arrays themselves are
  // recreated (rare — only on hot-reload or component remount).
  useEffect(() => {
    uniforms.uNodePosFade.value = nodeBulge.posFade;
    uniforms.uNodeColorEmph.value = nodeBulge.colorEmph;
  }, [uniforms, nodeBulge]);

  // Count updates every frame via the shared ref object — push to uniform.
  useFrame(() => {
    uniforms.uNodeCount.value = nodeBulge.count.value;
  });

  // Curve-related uniforms: re-point to the freshly baked texture and update
  // the height (= number of edges) whenever the visible set changes.
  useEffect(() => {
    uniforms.uCurves.value = curveTexture;
    uniforms.uCurveTexWidth.value = samplesPerCurve;
    uniforms.uCurveTexHeight.value = timeline.edges.length;
  }, [uniforms, curveTexture, samplesPerCurve, timeline.edges.length]);

  useEffect(() => {
    uniforms.uEdgeFades.value = edgeFadeTexture;
  }, [uniforms, edgeFadeTexture]);

  // Live-update scalar/color uniforms in place. Mutating the stable uniforms
  // object also reaches the material because it shares the reference.
  useEffect(() => {
    uniforms.uPointSize.value = pointSize;
    uniforms.uTubeRadius.value = tubeRadius;
    uniforms.uDriftAmp.value = driftAmp;
    uniforms.uDriftScale.value = driftScale;
    uniforms.uDriftCoherence.value = driftCoherence;
    uniforms.uSpeedScale.value = speedScale;
    uniforms.uIntensity.value = intensity;
    uniforms.uShimmerSpikeFreq.value = shimmerSpikeFreq;
    uniforms.uShimmerSpikeAmp.value = shimmerSpikeAmp;
    uniforms.uShimmerSharpness.value = shimmerSharpness;
    uniforms.uShimmerSlowFreq.value = shimmerSlowFreq;
    uniforms.uShimmerSlowAmp.value = shimmerSlowAmp;
    uniforms.uShimmerDepth.value = shimmerDepth;
    uniforms.uStableColor.value.set(stableColor);
    uniforms.uCrisisColor.value.set(crisisColor);
    uniforms.uNodeRadius.value = nodeRadius;
    uniforms.uNodeEmphRadius.value = nodeEmphRadius;
    uniforms.uNodeBulgeSize.value = nodeBulgeSize;
    uniforms.uNodeColorMix.value = nodeColorMix;
    uniforms.uNodeBoost.value = nodeBoost;
    uniforms.uNodeDriftBoost.value = nodeDriftBoost;
    uniforms.uNodeSwirlStrength.value = nodeSwirlStrength;
    uniforms.uNodeSwirlSpeed.value = nodeSwirlSpeed;
    uniforms.uNodeGravity.value = nodeGravity;
    uniforms.uNodeCenterGravity.value = nodeCenterGravity;
    uniforms.uNodeCoreStrength.value = nodeCoreStrength;
    uniforms.uWindDir.value.set(windX, windY, windZ);
    uniforms.uWindStrength.value = windStrength;
    uniforms.uWindSpeed.value = windSpeed;
    uniforms.uGlintRatio.value = glintRatio;
    uniforms.uGlintSizeMult.value = glintSizeMult;
    uniforms.uGlintIntensity.value = glintIntensity;
    uniforms.uGlintTint.value.set(glintTint);
    uniforms.uGrainCore.value = grainCore;
    uniforms.uGrainHalo.value = grainHalo;
    uniforms.uGrainHaloAmp.value = grainHaloAmp;
  }, [uniforms, pointSize, tubeRadius, driftAmp, driftScale, driftCoherence, speedScale, intensity, shimmerSpikeFreq, shimmerSpikeAmp, shimmerSharpness, shimmerSlowFreq, shimmerSlowAmp, shimmerDepth, stableColor, crisisColor, nodeRadius, nodeEmphRadius, nodeBulgeSize, nodeColorMix, nodeBoost, nodeDriftBoost, nodeSwirlStrength, nodeSwirlSpeed, nodeGravity, nodeCenterGravity, nodeCoreStrength, windX, windY, windZ, windStrength, windSpeed, glintRatio, glintSizeMult, glintIntensity, glintTint, grainCore, grainHalo, grainHaloAmp]);

  useEffect(() => {
    uniforms.uResolution.value.set(size.width, size.height);
  }, [uniforms, size.width, size.height]);

  useFrame((_, dt) => {
    uniforms.uTime.value += dt;
  });

  return (
    <points
      geometry={geometry}
      frustumCulled={false}
      // Raycaster sees the dummy base positions (all at origin), not the
      // shader-displaced positions, so without this the particles act as an
      // invisible click trap around the world origin.
      raycast={noopRaycast}
    >
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={particlesVert}
        fragmentShader={particlesFrag}
        transparent
        depthWrite={false}
        depthTest
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
