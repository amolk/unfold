import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Timeline } from "./timeline";
import { particlesVert } from "./particles.vert.glsl";
import { particlesFrag } from "./particles.frag.glsl";
import type { NodeBulgeData } from "./scene-projection";
import {
  buildParticleAttributes,
  buildCurveTexture,
  buildEdgeColorTexture,
  toDataTexture,
} from "./particle-core";
import { createParticleUniforms } from "./particle-uniforms";
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
  // --- style.edge.* tunables (Phase 3). Each maps to a single uniform; the
  // effect below pushes them live. Defaults match the baked uniform values. ---
  wispAmplitude?: number;
  wispMorphSpeed?: number;
  wispStretch?: number;
  threadDetail?: number;
  streakLength?: number;
  speed?: number;
  shimmer?: number;
  glintRatio?: number;
  glintIntensity?: number;
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
  wispAmplitude = 0.15,
  wispMorphSpeed = 0.15,
  wispStretch = 0.7,
  threadDetail = 0.96,
  streakLength = 0.6,
  speed = 0.32,
  shimmer = 0.1,
  glintRatio = 0.03,
  glintIntensity = 1,
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

  // Build the uniforms once per material lifetime and mutate values in place;
  // the effects/frame loop below patch the style.edge.* + zoom subset. The
  // ~60-uniform bag lives in particle-uniforms.ts, organized into named
  // semantic groups (the flattened result is identical to the old inline
  // object — see particle-uniforms.test.ts). Built empty-deps so it isn't
  // rebuilt on render (that would reset uTime and force a full rebind).
  const uniforms = useMemo(
    () => createParticleUniforms(nodeBulge),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // --- bake curves into a DataTexture (rows = curves, cols = samples) ---
  const curveTexture = useMemo(
    () => toDataTexture(buildCurveTexture(timeline, samplesPerCurve)),
    [timeline, samplesPerCurve],
  );

  // --- bake the EdgeFlow palette into an 8×(edge count) RGBA texture ---
  // Row = edge (matches the curve texture row / aCurveIndex), column = color
  // slot 0..7. Empty slots repeat color 0 so an over-index reads a valid color.
  const edgeColorTexture = useMemo(
    () => toDataTexture(buildEdgeColorTexture(timeline)),
    [timeline],
  );

  // --- per-particle attribute buffers, distributed by edge weight ---
  // Total count scales linearly with the visible edge count so a small tree
  // and a complex tree end up at the same per-segment density.
  const particleCount = Math.max(1, particlesPerEdge * timeline.edges.length);
  const geometry = useMemo(() => {
    // The weighted per-particle distribution now lives in particle-core
    // (pure + seedable). rng is omitted → Math.random, identical to before.
    const a = buildParticleAttributes(timeline, { particleCount, streamsPerEdge });
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(a.position, 3));
    geom.setAttribute("aCurveIndex", new THREE.BufferAttribute(a.curveIndex, 1));
    geom.setAttribute("aPhase", new THREE.BufferAttribute(a.phase, 1));
    geom.setAttribute("aSpeed", new THREE.BufferAttribute(a.speed, 1));
    geom.setAttribute("aSeed", new THREE.BufferAttribute(a.seed, 1));
    geom.setAttribute("aColorIndex", new THREE.BufferAttribute(a.colorIndex, 1));
    geom.setAttribute("aRadialAngle", new THREE.BufferAttribute(a.radialAngle, 1));
    geom.setAttribute("aRadialRadius", new THREE.BufferAttribute(a.radialRadius, 1));
    geom.setAttribute("aStreamId", new THREE.BufferAttribute(a.streamId, 1));
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 100);
    return geom;
  }, [timeline, particleCount, streamsPerEdge]);

  // Dispose the previous geometry / curve / edge-color GPU resources when they
  // are rebuilt (on timeline change) or on unmount. These are created per
  // timeline and passed by prop, so R3F does not auto-dispose them — without
  // this they leak steadily as the active set changes.
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => curveTexture.dispose(), [curveTexture]);
  useEffect(() => () => edgeColorTexture.dispose(), [edgeColorTexture]);

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

  // Point the EdgeFlow palette sampler at the freshly baked color texture.
  // Its row count matches uCurveTexHeight, so the vertex shader reuses that
  // uniform for the row coordinate.
  useEffect(() => {
    uniforms.uEdgeColors.value = edgeColorTexture;
  }, [uniforms, edgeColorTexture]);

  useEffect(() => {
    uniforms.uEdgeFades.value = edgeFadeTexture;
    // Sample UV math in the shader divides by this row count (NOT by
    // uCurveTexHeight, which tracks the active edge count and is correct
    // for the per-edge curve texture but not for the fixed-capacity
    // edge-fade texture). Reading off .image.height keeps this in sync
    // with whatever the projection allocates.
    uniforms.uEdgeFadeTexHeight.value = edgeFadeTexture.image.height;
  }, [uniforms, edgeFadeTexture]);

  // Theme colors arrive as props (the internal kind-based model until Phase 5).
  useEffect(() => {
    uniforms.uStableColor.value.set(stableColor);
    uniforms.uCrisisColor.value.set(crisisColor);
  }, [uniforms, stableColor, crisisColor]);

  // style.edge.* tunables → uniforms. The long tail of fine-tuning uniforms
  // (wind, palette weave, node-bulge, burst, grain, and the zoom-driven
  // point-size/intensity anchors) stays baked at the uniforms-object defaults;
  // see the `style.edge` JSDoc in types.ts for why they aren't exposed.
  useEffect(() => {
    uniforms.uWispAmp.value = wispAmplitude;
    uniforms.uWispMorphSpeed.value = wispMorphSpeed;
    uniforms.uWispStretch.value = wispStretch;
    uniforms.uStreamPerturb.value = threadDetail;
    uniforms.uStreakAmp.value = streakLength;
    uniforms.uSpeedScale.value = speed;
    uniforms.uShimmerSlowAmp.value = shimmer;
    uniforms.uGlintRatio.value = glintRatio;
    uniforms.uGlintIntensity.value = glintIntensity;
  }, [
    uniforms,
    wispAmplitude,
    wispMorphSpeed,
    wispStretch,
    threadDetail,
    streakLength,
    speed,
    shimmer,
    glintRatio,
    glintIntensity,
  ]);

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
