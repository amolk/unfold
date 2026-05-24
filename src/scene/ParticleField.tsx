import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls, folder } from "leva";
import * as THREE from "three";
import { Timeline, sampleBezier } from "../timeline/generate";
import { particlesVert } from "./particles.vert.glsl";
import { particlesFrag } from "./particles.frag.glsl";

interface ParticleFieldProps {
  timeline: Timeline;
}

export function ParticleField({ timeline }: ParticleFieldProps) {
  const { size } = useThree();
  const materialRef = useRef<THREE.ShaderMaterial>(null!);

  const {
    particleCount,
    samplesPerCurve,
    pointSize,
    tubeRadius,
    driftAmp,
    driftScale,
    speedScale,
    intensity,
    stableColor,
    crisisColor,
    shimmerFreq1,
    shimmerFreq2,
    shimmerSharpness,
    shimmerDepth,
  } = useControls("Particles", {
    particleCount: { value: 400_000, min: 10_000, max: 800_000, step: 10_000 },
    samplesPerCurve: { value: 64, min: 16, max: 256, step: 16 },
    pointSize: { value: 3.6, min: 0.5, max: 30, step: 0.1 },
    tubeRadius: { value: 0.07, min: 0, max: 2.0, step: 0.01 },
    driftAmp: { value: 0.35, min: 0, max: 2.0, step: 0.01 },
    speedScale: { value: 0.5, min: 0, max: 3, step: 0.01 },
    driftScale: { value: 0.1, min: 0.1, max: 8.0, step: 0.05 },
    intensity: { value: 0.5, min: 0.005, max: 0.5, step: 0.005 },
    stableColor: "#6BB0FF",
    crisisColor: "#FF6A2A",
    Shimmer: folder({
      shimmerFreq1: { value: 0, min: 0, max: 20, step: 0.1, label: "freq1" },
      shimmerFreq2: { value: 0, min: 0, max: 20, step: 0.1, label: "freq2" },
      shimmerSharpness: { value: 4.9, min: 1, max: 10, step: 0.1, label: "sharpness" },
      shimmerDepth: { value: 1.0, min: 0, max: 1, step: 0.01, label: "depth" },
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
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCurves: { value: curveTexture },
      uCurveTexWidth: { value: samplesPerCurve },
      uCurveTexHeight: { value: timeline.edges.length },
      uPointSize: { value: pointSize },
      uTubeRadius: { value: tubeRadius },
      uDriftAmp: { value: driftAmp },
      uDriftScale: { value: driftScale },
      uSpeedScale: { value: speedScale },
      uIntensity: { value: intensity },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
      uStableColor: { value: new THREE.Color(stableColor) },
      uCrisisColor: { value: new THREE.Color(crisisColor) },
      uShimmerFreq1: { value: shimmerFreq1 },
      uShimmerFreq2: { value: shimmerFreq2 },
      uShimmerSharpness: { value: shimmerSharpness },
      uShimmerDepth: { value: shimmerDepth },
    }),
    // Only rebuild when the curve set changes — everything else is updated live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [curveTexture, samplesPerCurve, timeline.edges.length],
  );

  // Live-update scalar/color uniforms when their leva values change.
  useEffect(() => {
    const u = materialRef.current?.uniforms;
    if (!u) return;
    u.uPointSize.value = pointSize;
    u.uTubeRadius.value = tubeRadius;
    u.uDriftAmp.value = driftAmp;
    u.uDriftScale.value = driftScale;
    u.uSpeedScale.value = speedScale;
    u.uIntensity.value = intensity;
    u.uShimmerFreq1.value = shimmerFreq1;
    u.uShimmerFreq2.value = shimmerFreq2;
    u.uShimmerSharpness.value = shimmerSharpness;
    u.uShimmerDepth.value = shimmerDepth;
    u.uStableColor.value.set(stableColor);
    u.uCrisisColor.value.set(crisisColor);
  }, [pointSize, tubeRadius, driftAmp, driftScale, speedScale, intensity, shimmerFreq1, shimmerFreq2, shimmerSharpness, shimmerDepth, stableColor, crisisColor]);

  useEffect(() => {
    const u = materialRef.current?.uniforms;
    if (!u) return;
    u.uResolution.value.set(size.width, size.height);
  }, [size.width, size.height]);

  useFrame((_, dt) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += dt;
    }
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
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
