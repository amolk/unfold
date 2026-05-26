import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls, folder } from "leva";
import * as THREE from "three";
import { Timeline, sampleBezier } from "../timeline/generate";
import { particlesVert } from "./particles.vert.glsl";
import { particlesFrag } from "./particles.frag.glsl";
import type { NodeBulgeData } from "./scene-projection";
import { useZoomDrivenControl } from "./useZoomDrivenControl";

export type { NodeBulgeData };

// Per-frame "did this zoom-driven control move enough to push back to leva?"
// epsilon. Below every slider's step for the affected controls; chosen once
// here so the per-control diff checks don't drift apart.
const ZOOM_PANEL_PUSH_EPSILON = 1e-4;

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
}

export function ParticleField({
  timeline,
  edgeFadeTexture,
  nodeBulge,
}: ParticleFieldProps) {
  const { size, camera, controls } = useThree();
  const materialRef = useRef<THREE.ShaderMaterial>(null!);
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

  const [{
    particlesPerEdge,
    streamsPerEdge,
    samplesPerCurve,
    pointSize,
    tubeRadius,
    wispAmp,
    wispStretch,
    wispMorphSpeed,
    edgeFlowSpread,
    streamPerturb,
    gustAmp,
    gustSpeed,
    wispOctave,
    pinHead,
    pinTail,
    tailBloom,
    nodeVolume,
    bunchFreq,
    bunchContrast,
    bunchTime,
    burstEnable,
    burstRate,
    streakAmp,
    minPointSize,
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
    grainCore,
    grainHalo,
    grainHaloAmp,
    weaveAmount,
    paletteZoneScale,
    paletteA,
    paletteB,
    paletteC,
  }, setParticles] = useControls("Particles", () => ({
    particlesPerEdge: { value: 4_000, min: 500, max: 30_000, step: 500, label: "per edge" },
    // Streams = number of distinct smoke filaments per edge. Each stream's
    // particles share a coherent path through the noise volume; fewer streams
    // → fatter, more visible wisps; more streams → smoother sheet.
    streamsPerEdge: { value: 30, min: 1, max: 256, step: 1, label: "streams/edge" },
    samplesPerCurve: { value: 64, min: 16, max: 256, step: 16 },
    pointSize: {
      value: 4, min: 0.5, max: 30, step: 0.1,
      // Zoom-driven: anchor (zoom-in) → 30.0 (zoom-out), linear.
      transient: false,
      onChange: pointSizeZoom.onChange,
    },
    tubeRadius: { value: 0, min: 0, max: 2.0, step: 0.01 },
    // Wisp: displacement from the curve spine is a dominant edge-local wind
    // (shared by all streams on the edge → adjacent threads curve together
    // into one wisp) plus a small per-stream perturbation (thread identity).
    // Gusts modulate the wind strength over time so the wisp pushes sideways
    // in bursts instead of swaying uniformly. Defaults captured from a tuned
    // max-zoom-out look.
    wispAmp: { value: 0.15, min: 0, max: 3.0, step: 0.01, label: "wisp amp" },
    wispStretch: { value: 0.7, min: 0.1, max: 20.0, step: 0.1, label: "wisp stretch" },
    wispMorphSpeed: { value: 0, min: 0, max: 1.0, step: 0.005, label: "morph speed" },
    edgeFlowSpread: { value: 0, min: 0, max: 5.0, step: 0.01, label: "edge spread" },
    streamPerturb: { value: 0.96, min: 0, max: 1.0, step: 0.01, label: "thread detail" },
    gustAmp: { value: 0, min: 0, max: 2.0, step: 0.01, label: "gust amp" },
    gustSpeed: { value: 0, min: 0, max: 3.0, step: 0.01, label: "gust speed" },
    wispOctave: { value: 0.08, min: 0, max: 1.5, step: 0.01, label: "fine octave" },
    // Pin ends: head and tail are independent so the tail can bloom outward
    // (sand peeling off the brush tip) while the head stays tied to its
    // source node. Combined with `node volume` below, segments meeting at a
    // node form a small 3D ball rather than a mathematical point — keep the
    // matching end's pin > 0 to preserve that.
    pinHead: { value: 0, min: 0, max: 0.5, step: 0.01, label: "pin head" },
    pinTail: { value: 0, min: 0, max: 0.5, step: 0.01, label: "pin tail" },
    // Tail bloom: scales wisp drift up over the back half of life so the
    // trailing end fans wider than the head. 0 = uniform amplitude.
    tailBloom: { value: 0, min: 0, max: 4, step: 0.05, label: "tail bloom" },
    // Node volume: radius of the per-stream parking ball that takes over as
    // the pinch closes. 0 = collapse to spine point; higher = larger node
    // blob. Particles converging from any segment meeting at the same world
    // position fill the same ball, so nodes read as 3D volumes.
    nodeVolume: { value: 0.07, min: 0, max: 0.5, step: 0.005, label: "node volume" },
    // Bursty emission: gate alpha by a noise function indexed by
    // (streamId, life, time). Adjacent particles share the gate so bursts
    // read as coherent clumps moving through each stream, not per-particle
    // flicker. uBunchTime drifts the burst pattern over time.
    bunchFreq: { value: 0, min: 0, max: 40, step: 0.5, label: "bunch freq" },
    bunchContrast: { value: 0, min: 0, max: 1, step: 0.01, label: "bunch contrast" },
    bunchTime: { value: 0, min: 0, max: 3, step: 0.01, label: "bunch drift" },
    // Burst gating: each stream emits rand(100..500) points continuously,
    // pauses for rand(200..700) points' worth of time, then repeats — both
    // re-rolled per cycle, per stream. Rate sets points/sec per stream.
    burstEnable: { value: false, label: "burst on/off" },
    burstRate: { value: 60, min: 1, max: 500, step: 1, label: "burst rate (pts/s)" },
    // Motion-blur streak: enlarge each point sprite along the screen-space
    // curve tangent and elongate the visible region into an ellipse aligned
    // with motion. 0 = round grain (original look).
    streakAmp: { value: 0.6, min: 0, max: 8, step: 0.05, label: "streak" },
    // Sub-pixel shimmer guard. When the intended gl_PointSize would drop
    // below this value (in pixels), we clamp the size and dim the alpha by
    // the squared coverage ratio. Keeps very small particles stable instead
    // of stuttering. 1.0 is the natural rasterizer floor.
    //
    // Zoom-driven: lerps from the anchor (zoomed-in baseline) down to 1.5
    // at zoom-out using the same cubic ease-out as `intensity`. The slider
    // shows the currently effective value; dragging it sets a new anchor
    // via the inverse-lerp pattern.
    minPointSize: {
      value: 1.5, min: 1.0, max: 8.0, step: 0.1, label: "min px (shimmer)",
      transient: false,
      onChange: minPointSizeZoom.onChange,
    },
    speedScale: { value: 0.32, min: 0, max: 3, step: 0.01 },
    intensity: {
      value: 3.25, min: 1.5, max: 6, step: 0.005,
      // `transient: false` is critical here — without it leva drops the value
      // out of the returned object as soon as we attach an onChange, leaving
      // our useFrame reading `undefined`.
      transient: false,
      onChange: intensityZoom.onChange,
    },
    stableColor: "#8aa896",
    crisisColor: "#d06030",
    Shimmer: folder({
      shimmerSpikeFreq: { value: 1.1, min: 0, max: 20, step: 0.1, label: "spike freq" },
      // Zoom-driven (linear): lerps from anchor at zoom-in down to 0 at
      // zoom-out. The slider shows the currently effective value; dragging
      // it sets a new anchor via the inverse-lerp pattern.
      shimmerSpikeAmp: {
        value: 4.65, min: 0, max: 10, step: 0.05, label: "spike amp",
        transient: false,
        onChange: shimmerSpikeAmpZoom.onChange,
      },
      shimmerSharpness: { value: 34.5, min: 1, max: 60, step: 0.5, label: "spike sharpness" },
      shimmerSlowFreq: { value: 0.2, min: 0, max: 5, step: 0.05, label: "slow freq" },
      shimmerSlowAmp: { value: 0.1, min: 0, max: 1, step: 0.01, label: "slow amp" },
      shimmerDepth: { value: 1.0, min: 0, max: 1, step: 0.01, label: "depth" },
    }),
    "Node bulge": folder({
      nodeRadius: { value: 0.13, min: 0.05, max: 3, step: 0.01, label: "radius" },
      nodeEmphRadius: { value: 0.14, min: 0.05, max: 4, step: 0.01, label: "focus radius" },
      nodeBulgeSize: { value: 0, min: 0, max: 15, step: 0.1, label: "size boost" },
      nodeColorMix: { value: 0, min: 0, max: 1, step: 0.01, label: "color mix" },
      nodeBoost: { value: 0, min: 0, max: 10, step: 0.05, label: "brightness" },
      nodeDriftBoost: { value: 0, min: 0, max: 20, step: 0.1, label: "drift boost" },
      nodeSwirlStrength: { value: 0, min: 0, max: 2, step: 0.01, label: "swirl amp" },
      nodeSwirlSpeed: { value: 0, min: 0, max: 10, step: 0.05, label: "swirl speed" },
      nodeGravity: { value: 0, min: -1, max: 1, step: 0.01, label: "radial bias" },
      nodeCenterGravity: { value: -0.22, min: -2, max: 2, step: 0.01, label: "center pull" },
      nodeCoreStrength: { value: 0, min: 0, max: 20, step: 0.1, label: "core spike" },
    }),
    Wind: folder({
      windX: { value: 0.6, min: -1, max: 1, step: 0.05, label: "x" },
      windY: { value: 0.1, min: -1, max: 1, step: 0.05, label: "y" },
      windZ: { value: 0, min: -1, max: 1, step: 0.05, label: "z" },
      windStrength: { value: 0.04, min: 0, max: 1, step: 0.005, label: "strength" },
      windSpeed: { value: 0.3, min: 0, max: 3, step: 0.05, label: "gust speed" },
    }),
    // Glints are the bright per-particle pinpricks. They take the particle's
    // own pigment (palette / stable / crisis / node tint) and the fragment
    // shader pushes it to full saturation so the hue reads at glint scale —
    // no shared tint here; the per-stream palette is what's seen.
    Glints: folder({
      glintRatio: { value: 0.03, min: 0, max: 1, step: 0.01, label: "ratio" },
      glintSizeMult: { value: 4, min: 1, max: 12, step: 0.1, label: "size mult" },
      glintIntensity: { value: 1, min: 1, max: 30, step: 0.1, label: "intensity" },
    }),
    Grain: folder({
      grainCore: { value: 80, min: 1, max: 80, step: 0.5, label: "core sharpness" },
      grainHalo: { value: 8.7, min: 0.5, max: 10, step: 0.1, label: "halo sharpness" },
      grainHaloAmp: { value: 0, min: 0, max: 1, step: 0.01, label: "halo amp" },
    }),
    // Woven multi-pigment palette: each stream is assigned one of A/B/C
    // (≈70/15/15 weighting in the vert shader) and the fragment shader
    // mixes that pigment over the stable/crisis tint by weaveAmount.
    // weaveAmount = 0 disables the effect entirely.
    Weave: folder({
      weaveAmount: { value: 1.0, min: 0, max: 1, step: 0.01, label: "weave amount" },
      // Smaller = bigger color zones (a whole branch tends to be one
      // pigment); larger = palette flips more often, approaching salt-and-
      // pepper at ~1.0. Stream-id axis is the dominant feel knob.
      paletteZoneScale: { value: 0.42, min: 0.02, max: 1.0, step: 0.01, label: "zone scale" },
      paletteA: { value: "#c0202a", label: "A (dominant)" },
      paletteB: { value: "#1a6db0", label: "B (accent)" },
      paletteC: { value: "#e0a020", label: "C (accent)" },
    }),
  })) as any;

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
      uEdgeFadeTexHeight: { value: 1 },
      uCurveTexWidth: { value: 1 },
      uCurveTexHeight: { value: 1 },
      uPointSize: { value: 1 },
      uTubeRadius: { value: 0 },
      uWispAmp: { value: 0 },
      uWispStretch: { value: 1 },
      uWispMorphSpeed: { value: 0 },
      uEdgeFlowSpread: { value: 1 },
      uStreamPerturb: { value: 0 },
      uGustAmp: { value: 0 },
      uGustSpeed: { value: 0 },
      uWispOctave: { value: 0 },
      uPinHead: { value: 0 },
      uPinTail: { value: 0 },
      uTailBloom: { value: 0 },
      uNodeVolume: { value: 0 },
      uBunchFreq: { value: 0 },
      uBunchContrast: { value: 0 },
      uBunchTime: { value: 0 },
      uBurstEnable: { value: 0 },
      uBurstRate: { value: 60 },
      uStreakAmp: { value: 0 },
      uMinPointSize: { value: 1 },
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
      // Bulge: data textures + count. Backing Float32Arrays are wrapped by
      // DataTextures owned by the parent and mutated each frame; we point the
      // sampler uniforms at the textures. Going through textures (rather than
      // uniform arrays) avoids MAX_VERTEX_UNIFORM_VECTORS limits on the GPU,
      // so we can scale to thousands of nodes.
      uNodeCount: { value: 0 },
      uNodePosFadeTex: { value: nodeBulge.posFade.texture },
      uNodeColorEmphTex: { value: nodeBulge.colorEmph.texture },
      uNodeTexHeight: { value: nodeBulge.texHeight },
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
      uGrainCore: { value: 12 },
      uGrainHalo: { value: 3 },
      uGrainHaloAmp: { value: 0.1 },
      uWeaveAmount: { value: 0 },
      uPaletteZoneScale: { value: 0.1 },
      uPaletteA: { value: new THREE.Color() },
      uPaletteB: { value: new THREE.Color() },
      uPaletteC: { value: new THREE.Color() },
    }),
    // The bulge arrays only change identity when Scene rebuilds them; otherwise
    // we just mutate in place. We don't list nodeBulge here because creating
    // new uniform objects on every render would re-bind every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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

  // Live-update scalar/color uniforms in place. Mutating the stable uniforms
  // object also reaches the material because it shares the reference. We
  // intentionally don't list each leva value in the dep array — keeping a
  // ~60-entry array in sync with the declarations above was a recurring bug
  // surface. Running on every render is cheap (scalar writes; the uniforms
  // object identity is stable).
  useEffect(() => {
    uniforms.uPointSize.value = pointSize;
    uniforms.uTubeRadius.value = tubeRadius;
    uniforms.uWispAmp.value = wispAmp;
    uniforms.uWispStretch.value = wispStretch;
    uniforms.uWispMorphSpeed.value = wispMorphSpeed;
    uniforms.uEdgeFlowSpread.value = edgeFlowSpread;
    uniforms.uStreamPerturb.value = streamPerturb;
    uniforms.uGustAmp.value = gustAmp;
    uniforms.uGustSpeed.value = gustSpeed;
    uniforms.uWispOctave.value = wispOctave;
    uniforms.uPinHead.value = pinHead;
    uniforms.uPinTail.value = pinTail;
    uniforms.uTailBloom.value = tailBloom;
    uniforms.uNodeVolume.value = nodeVolume;
    uniforms.uBunchFreq.value = bunchFreq;
    uniforms.uBunchContrast.value = bunchContrast;
    uniforms.uBunchTime.value = bunchTime;
    uniforms.uBurstEnable.value = burstEnable ? 1 : 0;
    uniforms.uBurstRate.value = burstRate;
    uniforms.uStreakAmp.value = streakAmp;
    uniforms.uMinPointSize.value = minPointSize;
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
    uniforms.uGrainCore.value = grainCore;
    uniforms.uGrainHalo.value = grainHalo;
    uniforms.uGrainHaloAmp.value = grainHaloAmp;
    uniforms.uWeaveAmount.value = weaveAmount;
    uniforms.uPaletteZoneScale.value = paletteZoneScale;
    uniforms.uPaletteA.value.set(paletteA);
    uniforms.uPaletteB.value.set(paletteB);
    uniforms.uPaletteC.value.set(paletteC);
  });

  useEffect(() => {
    uniforms.uResolution.value.set(size.width, size.height);
  }, [uniforms, size.width, size.height]);

  useFrame((_, dt) => {
    uniforms.uTime.value += dt;

    // Zoom-driven crossfade: lerp each control between its anchor (zoom-in)
    // and a fixed "wide shot" target as the camera pulls back; the result
    // drives the uniform AND is written back into the leva slider so the
    // panel shows the currently effective value. The hook owns the per-
    // control easing curve. Distance range matches OrbitControls min/max
    // in Scene.tsx.
    const target = (controls as { target?: THREE.Vector3 } | null)?.target ?? fallbackTarget;
    const dist = camera.position.distanceTo(target);
    zoomT.current = THREE.MathUtils.clamp((dist - 2) / (60 - 2), 0, 1);

    const nextPointSize = pointSizeZoom.compute();
    const nextIntensity = intensityZoom.compute();
    const nextMinPx = minPointSizeZoom.compute();
    const nextSpikeAmp = shimmerSpikeAmpZoom.compute();
    uniforms.uPointSize.value = nextPointSize;
    uniforms.uIntensity.value = nextIntensity;
    uniforms.uMinPointSize.value = nextMinPx;
    uniforms.uShimmerSpikeAmp.value = nextSpikeAmp;
    // Only push to leva when the value actually moved — avoids re-rendering
    // (and re-running the leva-watch effect) every frame while the camera is
    // still.
    const eps = ZOOM_PANEL_PUSH_EPSILON;
    if (Math.abs(nextPointSize - pointSize) > eps) setParticles({ pointSize: nextPointSize });
    if (Math.abs(nextIntensity - intensity) > eps) setParticles({ intensity: nextIntensity });
    if (Math.abs(nextMinPx - minPointSize) > eps) setParticles({ minPointSize: nextMinPx });
    if (Math.abs(nextSpikeAmp - shimmerSpikeAmp) > eps) setParticles({ shimmerSpikeAmp: nextSpikeAmp });
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
