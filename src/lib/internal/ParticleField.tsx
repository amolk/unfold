import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Timeline, sampleBezier } from "./timeline";
import { particlesVert } from "./particles.vert.glsl";
import { particlesFrag } from "./particles.frag.glsl";
import type { NodeBulgeData } from "./scene-projection";
import { useZoomDrivenControl } from "./useZoomDrivenControl";
import { useOrbitControls } from "./useOrbitControls";

export type { NodeBulgeData };

// Geometry-coupled defaults, formerly the "Particles" Leva panel's `value:`
// fields. Particle count scales with edge count, so a small and a complex tree
// reach the same per-segment density.
const DEFAULT_PARTICLES_PER_EDGE = 4_000;
const DEFAULT_STREAMS_PER_EDGE = 30;
const DEFAULT_SAMPLES_PER_CURVE = 64;

// No-op raycast so the particle field never participates in click intersection.
const noopRaycast = () => {};

interface ParticleFieldProps {
  timeline: Timeline;
  /** 1×N RGBA float texture; R channel = per-edge fade in [0,1]. Mutated by
   *  the owner each frame; we just point a uniform at it. */
  edgeFadeTexture: THREE.DataTexture;
  /** Per-node bulge data. Backing arrays are mutated by the owner each frame
   *  — we share the same references so the GPU sees the latest values. */
  nodeBulge: NodeBulgeData;
  /** From the shared theme — see defaults.ts / theme prop. */
  stableColor: string;
  crisisColor: string;
  /** Particles emitted per visible edge. Formerly the "per edge" Leva slider. */
  particlesPerEdge?: number;
  /** Distinct smoke filaments per edge. Formerly "streams/edge". */
  streamsPerEdge?: number;
  /** Bezier samples baked into the curve texture. Formerly "samplesPerCurve". */
  samplesPerCurve?: number;
}

export function ParticleField({
  timeline,
  edgeFadeTexture,
  nodeBulge,
  stableColor,
  crisisColor,
  particlesPerEdge = DEFAULT_PARTICLES_PER_EDGE,
  streamsPerEdge = DEFAULT_STREAMS_PER_EDGE,
  samplesPerCurve = DEFAULT_SAMPLES_PER_CURVE,
}: ParticleFieldProps) {
  const { size, camera } = useThree();
  const controls = useOrbitControls();
  // Reused each frame to avoid allocating in useFrame.
  const fallbackTarget = useMemo(() => new THREE.Vector3(), []);

  // Zoom-driven controls. The slider value shown to the user is the
  // currently *effective* (lerped) value; the hook owns the "fully zoomed
  // in" anchor and inverse-lerps it back from any panel drag so changes
  // stick at the current camera distance instead of jumping the next frame.
  // All four controls share `zoomT`, which is written once per frame in
  // useFrame from the camera-distance parameter.
  const zoomT = useRef(0);
  const pointSizeZoom = useZoomDrivenControl({
    zoomT, initialAnchor: 4, target: 30.0, ease: "linear",
  });
  const intensityZoom = useZoomDrivenControl({
    zoomT, initialAnchor: 3.25, target: 0.15, ease: "cubic-easeOut",
  });
  // Shimmer-guard floor drops off quickly from the zoomed-in anchor and then
  // hovers near 1.5 through the middle/late zoom range.
  const minPointSizeZoom = useZoomDrivenControl({
    zoomT, initialAnchor: 5, target: 1.5, ease: "cubic-easeOut",
  });
  // Glints are noticeable up close and fade out as the camera pulls back.
  const shimmerSpikeAmpZoom = useZoomDrivenControl({
    zoomT, initialAnchor: 4.65, target: 0, ease: "linear",
  });

  // Build the uniforms object once per material lifetime — values are mutated
  // in place when the leva controls change so the shader updates live without
  // recompiling. Uniforms are created ONCE per mount and mutated in place.
  // Rebuilding the object on timeline changes would reset uTime (visibly
  // freezing animation) and force three.js to rebind every uniform — instead
  // we keep the references stable and patch values via the effects below.
  //
  // IMPORTANT: defaults for transient-onChange controls (most of them, wired
  // up in the `useControls` factory below) MUST match the leva control's
  // `value:` because leva does NOT call onChange on first mount. Out-of-sync
  // defaults would silently start the shader with stale values until the
  // first slider tweak. Defaults for controls that stay in the destructure
  // (zoom-driven, colors, wind triple, burstEnable) are written on first
  // render by the smaller mirror effect, so those can remain placeholders.
  //
  // Declared before `useControls` so the inline onChange closures in the
  // factory can close over a fully-initialized `uniforms` binding.
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCurves: { value: null as THREE.DataTexture | null },
      uEdgeFades: { value: null as THREE.DataTexture | null },
      uEdgeFadeTexHeight: { value: 1 },
      uCurveTexWidth: { value: 1 },
      uCurveTexHeight: { value: 1 },
      uPointSize: { value: 1 },
      uTubeRadius: { value: 0 },
      uWispAmp: { value: 0.15 },
      uWispStretch: { value: 0.7 },
      uWispMorphSpeed: { value: 0 },
      uEdgeFlowSpread: { value: 0 },
      uStreamPerturb: { value: 0.96 },
      uGustAmp: { value: 0 },
      uGustSpeed: { value: 0 },
      uWispOctave: { value: 0.08 },
      uPinHead: { value: 0 },
      uPinTail: { value: 0 },
      uTailBloom: { value: 0 },
      uNodeVolume: { value: 0.07 },
      uBunchFreq: { value: 0 },
      uBunchContrast: { value: 0 },
      uBunchTime: { value: 0 },
      uBurstEnable: { value: 0 },
      uBurstRate: { value: 60 },
      uStreakAmp: { value: 0.6 },
      uMinPointSize: { value: 1 },
      uSpeedScale: { value: 0.32 },
      uIntensity: { value: 0.1 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uStableColor: { value: new THREE.Color() },
      uCrisisColor: { value: new THREE.Color() },
      uShimmerSpikeFreq: { value: 1.1 },
      uShimmerSpikeAmp: { value: 0 },
      uShimmerSharpness: { value: 34.5 },
      uShimmerSlowFreq: { value: 0.2 },
      uShimmerSlowAmp: { value: 0.1 },
      uShimmerDepth: { value: 1.0 },
      // Bulge: data textures + count. Backing Float32Arrays are wrapped by
      // DataTextures owned by the parent and mutated each frame; we point the
      // sampler uniforms at the textures. Going through textures (rather than
      // uniform arrays) avoids MAX_VERTEX_UNIFORM_VECTORS limits on the GPU,
      // so we can scale to thousands of nodes.
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
      // Wind triple default (0.6, 0.1, 0) — was applied by the Leva mirror
      // effect, now baked in since the panel is gone.
      uWindDir: { value: new THREE.Vector3(0.6, 0.1, 0) },
      uWindStrength: { value: 0.04 },
      uWindSpeed: { value: 0.3 },
      uGlintRatio: { value: 0.03 },
      uGlintSizeMult: { value: 4 },
      uGlintIntensity: { value: 1 },
      uGrainCore: { value: 80 },
      uGrainHalo: { value: 8.7 },
      uGrainHaloAmp: { value: 0 },
      uWeaveAmount: { value: 1.0 },
      uPaletteZoneScale: { value: 0.42 },
      // Palette A/B/C defaults — were applied by the Leva mirror effect.
      uPaletteA: { value: new THREE.Color("#c0202a") },
      uPaletteB: { value: new THREE.Color("#1a6db0") },
      uPaletteC: { value: new THREE.Color("#e0a020") },
    }),
    // The bulge arrays only change identity when Scene rebuilds them; otherwise
    // we just mutate in place. We don't list nodeBulge here because creating
    // new uniform objects on every render would re-bind every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
  // Total count scales linearly with the visible edge count so a small tree
  // and a complex tree end up at the same per-segment density.
  const particleCount = Math.max(1, particlesPerEdge * timeline.edges.length);
  const geometry = useMemo(() => {
    const totalWeight = timeline.edges.reduce((s, e) => s + e.weight, 0);
    const positions = new Float32Array(particleCount * 3); // dummy (shader overrides)
    const curveIndex = new Float32Array(particleCount);
    const phase = new Float32Array(particleCount);
    const speed = new Float32Array(particleCount);
    const seed = new Float32Array(particleCount);
    const fromCrisis = new Float32Array(particleCount);
    const toCrisis = new Float32Array(particleCount);
    // Per-stream values: all particles assigned to the same stream share these
    // so they emerge from a consistent point on the curve's cross-section.
    const radialAngle = new Float32Array(particleCount);
    const radialRadius = new Float32Array(particleCount);
    const streamId = new Float32Array(particleCount);

    // Streams are global (not per-edge) so noise sampling is distinct between
    // edges. We accumulate a global counter as we lay out edges.
    let globalStreamId = 0;
    let p = 0;
    timeline.edges.forEach((edge, idx) => {
      const share = Math.round((edge.weight / totalWeight) * particleCount);
      // Cap streams at the share — empty streams would just waste id-space.
      const streamCount = Math.max(1, Math.min(streamsPerEdge, share));
      const fc = edge.fromKind === "crisis" ? 1 : 0;
      const tc = edge.toKind === "crisis" ? 1 : 0;
      const speedBase = edge.toKind === "crisis" || edge.fromKind === "crisis" ? 0.045 : 0.06;
      // Distribute the edge's particle share evenly across streams, with the
      // remainder spilled into the first few streams.
      const perStream = Math.floor(share / streamCount);
      const remainder = share - perStream * streamCount;
      // Pick one speed per edge so wisps don't smear (different speeds within
      // a stream would stretch the filament apart). Random spread per-edge
      // keeps inter-edge motion lively.
      const edgeSpeed = speedBase * (0.6 + Math.random() * 0.9);
      for (let sIdx = 0; sIdx < streamCount; sIdx++) {
        const sid = globalStreamId++;
        // Stream-anchor: where on the tube cross-section this wisp emanates
        // from. Shared by every particle in the stream so they start aligned.
        const sAngle = Math.random() * Math.PI * 2;
        const sRadius = Math.sqrt(Math.random());
        const count = perStream + (sIdx < remainder ? 1 : 0);
        for (let k = 0; k < count && p < particleCount; k++, p++) {
          curveIndex[p] = idx;
          // Phases evenly staggered + slight jitter — staggered so the wisp
          // is continuously populated, jittered so it doesn't beat in lockstep.
          phase[p] = (k / Math.max(1, count) + Math.random() * 0.03) % 1;
          speed[p] = edgeSpeed;
          seed[p] = Math.random() * 1000;
          fromCrisis[p] = fc;
          toCrisis[p] = tc;
          radialAngle[p] = sAngle;
          radialRadius[p] = sRadius;
          streamId[p] = sid;
        }
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
      streamId[p] = globalStreamId;
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
    geom.setAttribute("aStreamId", new THREE.BufferAttribute(streamId, 1));
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 100);
    return geom;
  }, [timeline, particleCount, streamsPerEdge]);

  // Repoint the bulge texture uniforms whenever the textures themselves are
  // recreated (rare — only on hot-reload or component remount).
  useEffect(() => {
    uniforms.uNodePosFadeTex.value = nodeBulge.posFade.texture;
    uniforms.uNodeColorEmphTex.value = nodeBulge.colorEmph.texture;
    uniforms.uNodeTexHeight.value = nodeBulge.texHeight;
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
    // Sample UV math in the shader divides by this row count (NOT by
    // uCurveTexHeight, which tracks the active edge count and is correct
    // for the per-edge curve texture but not for the fixed-capacity
    // edge-fade texture). Reading off .image.height keeps this in sync
    // with whatever the projection allocates.
    uniforms.uEdgeFadeTexHeight.value = edgeFadeTexture.image.height;
  }, [uniforms, edgeFadeTexture]);

  // Theme colors are the only formerly-Leva uniforms still driven from React;
  // they arrive as props now. Everything else (wind, palette, burst, and the
  // ~40 transient-onChange tunables) is baked into the uniforms object's
  // defaults above and will be re-exposed as `style` props in Phase 3.
  useEffect(() => {
    uniforms.uStableColor.value.set(stableColor);
    uniforms.uCrisisColor.value.set(crisisColor);
  }, [uniforms, stableColor, crisisColor]);

  useEffect(() => {
    uniforms.uResolution.value.set(size.width, size.height);
  }, [uniforms, size.width, size.height]);

  useFrame((_, dt) => {
    uniforms.uTime.value += dt;

    // Zoom-driven crossfade: lerp each control between its anchor (zoom-in)
    // and a fixed "wide shot" target as the camera pulls back; the result
    // drives the uniform. (Pre-extraction this also pushed the effective value
    // back into the Leva slider; with the panel gone, only the uniform write
    // remains.) The hook owns the per-control easing curve. Distance range
    // matches OrbitControls min/max in Scene.tsx.
    const target = controls?.target ?? fallbackTarget;
    const dist = camera.position.distanceTo(target);
    zoomT.current = THREE.MathUtils.clamp((dist - 2) / (60 - 2), 0, 1);

    uniforms.uPointSize.value = pointSizeZoom.compute();
    uniforms.uIntensity.value = intensityZoom.compute();
    uniforms.uMinPointSize.value = minPointSizeZoom.compute();
    uniforms.uShimmerSpikeAmp.value = shimmerSpikeAmpZoom.compute();
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
