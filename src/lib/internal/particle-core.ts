import * as THREE from "three";
import { Timeline, sampleBezier } from "./timeline";
import type { Rng } from "./rng";

// Pure builders extracted from ParticleField. The distribution algorithm
// (buildParticleAttributes) imports NO THREE and routes every random draw
// through the injected `rng`, so it is deterministic under a seed and testable
// in plain Node. The texture builders return raw RGBA payloads (data + dims) so
// tests assert on `.data` without a GL context; toDataTexture wraps a payload
// into the THREE.DataTexture the shaders sample.

const SPEED_BASE = 0.06;

/** The nine per-particle attribute arrays + the count they were sized to.
 *  This is the test boundary — plain Float32Arrays. Keys are the shader
 *  attribute names minus the "a" prefix. */
export interface ParticleAttributes {
  count: number;
  position: Float32Array<ArrayBuffer>; // count*3, dummy (shader overrides), all 0
  curveIndex: Float32Array<ArrayBuffer>;
  phase: Float32Array<ArrayBuffer>;
  speed: Float32Array<ArrayBuffer>;
  seed: Float32Array<ArrayBuffer>;
  colorIndex: Float32Array<ArrayBuffer>; // CDF-drawn palette slot 0..7
  radialAngle: Float32Array<ArrayBuffer>; // per-stream shared
  radialRadius: Float32Array<ArrayBuffer>; // per-stream shared
  streamId: Float32Array<ArrayBuffer>; // global monotonic
  /** Number of streams allocated (= final globalStreamId). */
  streamCount: number;
}

export interface ParticleAttributeOptions {
  /** Resolved total = max(1, particlesPerEdge * edges.length). */
  particleCount: number;
  /** Distinct streams (filaments) per edge, clamped to [1, edgeShare]. */
  streamsPerEdge: number;
  /** Base per-particle speed before per-edge jitter & speedMultiplier. */
  speedBase?: number;
}

/** Distribute `particleCount` particles across edges proportional to weight,
 *  into streams that share a cross-section anchor, sampling a flow color per
 *  particle from the edge's proportions. Pure given (timeline, opts, rng).
 *  Ported verbatim from ParticleField's geometry useMemo, with Math.random
 *  replaced by rng(). */
export function buildParticleAttributes(
  timeline: Timeline,
  opts: ParticleAttributeOptions,
  rng: Rng = Math.random,
): ParticleAttributes {
  const { particleCount, streamsPerEdge } = opts;
  const speedBase = opts.speedBase ?? SPEED_BASE;

  const totalWeight = timeline.edges.reduce((s, e) => s + e.weight, 0);
  const position = new Float32Array(particleCount * 3); // dummy (shader overrides)
  const curveIndex = new Float32Array(particleCount);
  const phase = new Float32Array(particleCount);
  const speed = new Float32Array(particleCount);
  const seed = new Float32Array(particleCount);
  const colorIndex = new Float32Array(particleCount);
  const radialAngle = new Float32Array(particleCount);
  const radialRadius = new Float32Array(particleCount);
  const streamId = new Float32Array(particleCount);

  // Streams are global (not per-edge) so noise sampling is distinct between
  // edges; accumulate a global counter as we lay out edges.
  let globalStreamId = 0;
  let p = 0;
  timeline.edges.forEach((edge, idx) => {
    const share = Math.round((edge.weight / totalWeight) * particleCount);
    // Cap streams at the share — empty streams would just waste id-space.
    const streamCount = Math.max(1, Math.min(streamsPerEdge, share));
    // Normalized cumulative distribution over this edge's flow proportions,
    // capped at the 8 palette slots. pickColor() draws a slot per particle.
    const props = edge.proportions.slice(0, 8);
    const propTotal = props.reduce((s, x) => s + x, 0) || 1;
    let acc = 0;
    const cum = props.map((x) => (acc += x / propTotal));
    const pickColor = () => {
      const r = rng();
      for (let i = 0; i < cum.length; i++) if (r <= cum[i]) return i;
      return cum.length - 1;
    };
    // Distribute the share evenly across streams, remainder into the first few.
    const perStream = Math.floor(share / streamCount);
    const remainder = share - perStream * streamCount;
    // One speed per edge so wisps don't smear; random spread keeps inter-edge
    // motion lively; EdgeFlow.speed (speedMultiplier) is a caller multiplier.
    const edgeSpeed =
      speedBase * (0.6 + rng() * 0.9) * edge.speedMultiplier;
    for (let sIdx = 0; sIdx < streamCount; sIdx++) {
      const sid = globalStreamId++;
      // Stream-anchor: cross-section point this wisp emanates from, shared by
      // every particle in the stream so they start aligned.
      const sAngle = rng() * Math.PI * 2;
      const sRadius = Math.sqrt(rng());
      const count = perStream + (sIdx < remainder ? 1 : 0);
      for (let k = 0; k < count && p < particleCount; k++, p++) {
        curveIndex[p] = idx;
        // Phases evenly staggered + slight jitter so the wisp is continuously
        // populated and doesn't beat in lockstep.
        phase[p] = (k / Math.max(1, count) + rng() * 0.03) % 1;
        speed[p] = edgeSpeed;
        seed[p] = rng() * 1000;
        colorIndex[p] = pickColor();
        radialAngle[p] = sAngle;
        radialRadius[p] = sRadius;
        streamId[p] = sid;
      }
    }
  });
  // Tail-fill any slots left by rounding (Σ round(share) can be < count).
  while (p < particleCount) {
    curveIndex[p] = 0;
    phase[p] = rng();
    speed[p] = speedBase;
    seed[p] = rng() * 1000;
    colorIndex[p] = 0;
    radialAngle[p] = rng() * Math.PI * 2;
    radialRadius[p] = Math.sqrt(rng());
    streamId[p] = globalStreamId;
    p++;
  }

  return {
    count: particleCount,
    position,
    curveIndex,
    phase,
    speed,
    seed,
    colorIndex,
    radialAngle,
    radialRadius,
    streamId,
    streamCount: globalStreamId,
  };
}

/** RGBA float texture payload: raw buffer + dimensions. */
export interface TexturePayload {
  data: Float32Array<ArrayBuffer>;
  width: number;
  height: number;
}

/** Bake each edge's cubic bezier into an RGBA payload: width = samplesPerCurve
 *  (columns), height = edges (rows). xyz = sampled point, w = 1. */
export function buildCurveTexture(
  timeline: Timeline,
  samplesPerCurve: number,
): TexturePayload {
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
  return { data, width: w, height: h };
}

/** Bake each edge's <=8-color EdgeFlow palette into an 8x(edges) RGBA payload.
 *  Empty slots repeat color 0 (then white); height floored at 1. */
export function buildEdgeColorTexture(timeline: Timeline): TexturePayload {
  const h = Math.max(1, timeline.edges.length);
  const data = new Float32Array(8 * h * 4);
  const c = new THREE.Color();
  for (let row = 0; row < timeline.edges.length; row++) {
    const cols = timeline.edges[row].colors;
    for (let s = 0; s < 8; s++) {
      c.set(cols[s] ?? cols[0] ?? "#ffffff");
      const i = (row * 8 + s) * 4;
      data[i + 0] = c.r;
      data[i + 1] = c.g;
      data[i + 2] = c.b;
      data[i + 3] = 1.0;
    }
  }
  return { data, width: 8, height: h };
}

/** Wrap a payload into the nearest-filtered, clamped RGBA float DataTexture the
 *  shaders sample. */
export function toDataTexture(p: TexturePayload): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    p.data,
    p.width,
    p.height,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
