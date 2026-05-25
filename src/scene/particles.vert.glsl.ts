// Vertex shader for the sand-pigment particle field.
// Each particle is assigned to one curve baked into uCurves (a DataTexture
// where each row is a sampled cubic bezier). We look up its position along
// the curve, offset it perpendicular to the curve direction so the trunk has
// a circular cross-section, and add curl-noise-style drift for the granular
// pigment feel.
export const particlesVert = /* glsl */ `
precision highp float;

uniform float uTime;
uniform sampler2D uCurves;
uniform sampler2D uEdgeFades;   // 1×N texture, R = current per-edge fade (0..1)
uniform float uCurveTexWidth;   // samples per curve
uniform float uCurveTexHeight;  // number of curves
uniform float uPointSize;
// Wisp formulation: particles are grouped into streams (aStreamId), and the
// displacement from the curve spine is sampled from a 3D noise volume indexed
// by (streamId, age, time). Adjacent ages within a stream → adjacent positions
// → particles in a stream form a coherent filament. Time advances the noise
// slowly so the filament curves morph over time without any per-particle
// integration.
uniform float uWispAmp;            // overall wisp displacement amplitude
uniform float uWispStretch;        // how fast wind varies along age (curl tightness)
uniform float uWispMorphSpeed;     // how fast the wisp paths evolve over time
uniform float uEdgeFlowSpread;     // noise distance between adjacent edges' wind regimes
uniform float uStreamPerturb;      // per-thread variation as a fraction of wisp amp
uniform float uGustAmp;            // amplitude of time-varying wind strength
uniform float uGustSpeed;          // rate of wind-strength variation
uniform float uWispOctave;         // amplitude of a second finer octave (0 = single octave)
// Endpoint pinning: the wisp displacement is multiplied by a pinch that goes
// to 0 at life=0 and life=1, so threads converge to the curve spine at the
// nodes. Multiple segments meeting at a node then visibly tie together at
// that point instead of fraying. uPinEnds = 0 disables the pinch.
uniform float uPinEnds;
// Node volume: as the pinch closes the wisp at an endpoint, each stream is
// instead anchored at a small stable per-stream offset around the spine
// point. Threads converge into a 3D ball at the node rather than a single
// mathematical point. Deterministic from aStreamId so the ball is stable
// in time (no shimmer) and consistent across particles in the stream.
uniform float uNodeVolume;
// Variable-frequency emission: per-particle alpha is gated by a 3D noise
// keyed on (streamId, life * uBunchFreq, time * uBunchTime). Peaks of the
// noise → bursts of visible particles; valleys → gaps. The third axis lets
// the rhythm pattern itself drift over real time.
uniform float uBunchFreq;
uniform float uBunchContrast;      // 0 = no gating (uniform), 1 = full gate
uniform float uBunchTime;          // how fast the bunch pattern drifts in time
// Motion-blur stretch: each point sprite is enlarged along the screen-space
// curve tangent so the particle reads as a short streak rather than a dot.
// 0 = round, higher = longer streak.
uniform float uStreakAmp;
// Sub-pixel shimmer guard. When gl_PointSize drops below ~1 pixel the
// rasterizer's coverage decision flips frame-to-frame, producing visible
// flicker that the additive blending + bloom amplifies. We clamp the size
// at this floor and dim the alpha by the squared coverage ratio so smaller
// intent reads as "dimmer", not "stuttering".
uniform float uMinPointSize;
uniform float uTubeRadius;
uniform float uSpeedScale;
uniform vec2  uResolution;
uniform float uShimmerSpikeFreq;   // how often per-particle spikes fire
uniform float uShimmerSpikeAmp;    // height of spikes above baseline
uniform float uShimmerSharpness;   // pow exponent — bigger = briefer spikes
uniform float uShimmerSlowFreq;    // baseline oscillation rate
uniform float uShimmerSlowAmp;     // baseline oscillation depth
uniform float uShimmerDepth;       // overall mix toward flat 1.0

// Node bulge: particles near a node grow and take on the node's color, so
// nodes appear as spherical concentrations of the flow rather than separate
// solid spheres. Data lives in two 1×N RGBA float textures (xyz=pos,w=fade
// and rgb=color,w=emph) so we aren't bounded by MAX_VERTEX_UNIFORM_VECTORS.
// The loop runs up to MAX_NODES_HARD_CAP iterations but breaks at uNodeCount,
// so cost scales with the actual node count, not the cap.
#define MAX_NODES_HARD_CAP 4096
uniform int       uNodeCount;
uniform sampler2D uNodePosFadeTex;     // height = uNodeTexHeight; xyz=pos, w=fade
uniform sampler2D uNodeColorEmphTex;   // height = uNodeTexHeight; rgb=color, w=emph
uniform float     uNodeTexHeight;
uniform float uNodeRadius;                // base proximity radius (world units)
uniform float uNodeEmphRadius;            // radius for the focused node
uniform float uNodeBulgeSize;             // gl_PointSize multiplier near nodes
uniform float uNodeDriftBoost;            // extra drift amplitude near nodes
uniform float uNodeSwirlStrength;         // tangential displacement near nodes
uniform float uNodeSwirlSpeed;            // swirl rotation rate (rad/s-ish)
uniform float uNodeGravity;               // per-particle radial bias amplitude
uniform float uNodeCenterGravity;         // uniform pull toward (+) or away (-) center
uniform float uNodeCoreStrength;          // tight inner pinprick on top of the bulge

// Global wind: a unified offset applied to every particle, slowly gusting over
// time. Gives the field a directional bias instead of pure turbulent drift.
uniform vec3  uWindDir;
uniform float uWindStrength;
uniform float uWindSpeed;

// Two-tier particles: ~uGlintRatio of the field is dedicated to bright
// specular "glints" that drive the bloom into pinpricks; the rest is dim
// matte grain. Derived deterministically from aSeed.
uniform float uGlintRatio;
uniform float uGlintSizeMult;

attribute float aCurveIndex;
attribute float aPhase;
attribute float aSpeed;
attribute float aSeed;
attribute float aFromCrisis;
attribute float aToCrisis;
attribute float aRadialAngle;   // per-stream (all particles in a stream share this)
attribute float aRadialRadius;  // per-stream
attribute float aStreamId;      // unique id of the stream this particle belongs to

varying float vAlpha;
varying float vKindMix;
varying float vNodeProx;
varying vec3  vNodeCol;
varying float vIsGlint;
varying float vStreamId;        // forwarded so the fragment shader can pick a pigment later
// Screen-space direction of the particle's motion (unit vector in gl_PointCoord
// space — y is inverted relative to NDC). Used by the fragment shader to align
// the elongated streak shape with the motion direction.
varying vec2  vScreenTangent;
// How much the point sprite has been stretched along the screen tangent. The
// fragment shader uses this to compress the perpendicular axis so the visible
// ellipse stays narrow even though the sprite quad is enlarged.
varying float vStreakFactor;

// --- compact 3D value noise -----------------------------------------------
vec3 hash3(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7,  74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0));
  float n100 = dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0));
  float n010 = dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0));
  float n110 = dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0));
  float n001 = dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1));
  float n101 = dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1));
  float n011 = dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1));
  float n111 = dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

// Wisp displacement = dominant edge-local wind  +  small per-stream detail.
//
// The wind field is keyed on (curveIdx, age, time), NOT on streamId — so
// every particle on the same edge at the same age samples the same wind
// vector. That gives neighboring threads a shared contour: they bend
// together, which is what makes a cluster of threads read as a single
// smoke wisp instead of an uncorrelated jumble.
//
// Adjacent edges sit a small step apart in the curveIdx axis of the noise,
// so the wind on a neighboring branch resembles the wind on this one —
// regional coherence, not edge-local randomness.
//
// The age axis is what gives a wisp its curvature: as a particle ages, the
// wind direction it sees drifts, so the trail of particles strings out
// along a curving path. Time advances slowly on the third axis so the
// wisp shape itself morphs in place.
//
//   curveIdx           → which edge's local wind regime (adjacent → similar)
//   age (= life [0,1]) → position along the wisp; drives curvature
//   uTime              → slow morph of the wisp curve over real time
vec3 windField(float curveIdx, float age, float t) {
  vec3 q = vec3(
    curveIdx * uEdgeFlowSpread,
    age * uWispStretch,
    t * uWispMorphSpeed
  );
  vec3 a = vec3(
    vnoise(q),
    vnoise(q + vec3(31.4,  0.0,  0.0)),
    vnoise(q + vec3( 0.0, 17.2,  0.0))
  );
  // Fine octave: subtle spatial detail along the wisp's length.
  vec3 b = vec3(
    vnoise(q * 2.3 + vec3( 5.1,  0.0,  0.0)),
    vnoise(q * 2.3 + vec3(31.4 + 5.1, 0.0, 0.0)),
    vnoise(q * 2.3 + vec3( 0.0, 17.2 + 5.1, 0.0))
  );
  return a + b * uWispOctave;
}

// Per-stream perturbation: a small unique offset per thread so adjacent
// threads in the same wisp don't perfectly overlap. Kept much smaller than
// the wind itself — the wind decides the contour, the perturbation adds
// thread identity.
vec3 streamDetail(float streamId, float age, float t) {
  vec3 q = vec3(
    streamId * 7.31,
    age * uWispStretch * 1.4,
    t * uWispMorphSpeed * 1.7
  );
  return vec3(
    vnoise(q),
    vnoise(q + vec3(31.4,  0.0,  0.0)),
    vnoise(q + vec3( 0.0, 17.2,  0.0))
  );
}

vec3 wispOffset(float curveIdx, float streamId, float age, float t) {
  // Gust: the wind's strength is not constant. A low-frequency noise on time
  // (with a faint curve-id component so different parts of the tree don't
  // gust in perfect lockstep) modulates the wind amplitude. This produces
  // the "pushes sideways sometimes" feel — the wisp lulls and lurches
  // instead of swaying at uniform speed.
  float gust = 1.0 + uGustAmp * vnoise(vec3(t * uGustSpeed, curveIdx * 0.31, 0.0));
  vec3 wind = windField(curveIdx, age, t) * uWispAmp * gust;
  vec3 detail = streamDetail(streamId, age, t) * uWispAmp * uStreamPerturb;
  return wind + detail;
}

vec4 nodePosFade(int i) {
  return texture2D(uNodePosFadeTex, vec2(0.5, (float(i) + 0.5) / uNodeTexHeight));
}
vec4 nodeColorEmph(int i) {
  return texture2D(uNodeColorEmphTex, vec2(0.5, (float(i) + 0.5) / uNodeTexHeight));
}

vec3 sampleCurve(float idx, float t) {
  float s = clamp(t, 0.0, 1.0) * (uCurveTexWidth - 1.0);
  float s0 = floor(s);
  float s1 = s0 + 1.0;
  float f = s - s0;
  vec2 uv0 = vec2((s0 + 0.5) / uCurveTexWidth, (idx + 0.5) / uCurveTexHeight);
  vec2 uv1 = vec2((s1 + 0.5) / uCurveTexWidth, (idx + 0.5) / uCurveTexHeight);
  vec3 p0 = texture2D(uCurves, uv0).rgb;
  vec3 p1 = texture2D(uCurves, uv1).rgb;
  return mix(p0, p1, f);
}

void main() {
  vStreamId = aStreamId;
  float life = fract(aPhase + uTime * aSpeed * uSpeedScale);
  float fadeIn  = smoothstep(0.0, 0.02, life);
  float fadeOut = smoothstep(0.0, 0.02, 1.0 - life);

  // Glitter shimmer:
  //   intensity = baseline + spike
  // Baseline is 1.0 plus an optional slow gentle wave.
  //
  // The spike is a discrete event model: each particle fires a flash at
  // moments spaced ~1/uShimmerSpikeFreq seconds apart, and the flash decays
  // exponentially with a time constant set ONLY by uShimmerSharpness (not
  // by spike frequency). Dropping uShimmerSpikeFreq produces fewer total
  // glints without slowing each individual flash.
  //
  //   sharpness ≈  1 → ~700 ms half-life (soft swell)
  //   sharpness ≈ 10 → ~70  ms half-life (snappy)
  //   sharpness ≈ 35 → ~20  ms half-life (sharp quick reflection)
  //
  // Critically, each particle's *rate* is jittered around uShimmerSpikeFreq
  // (deterministic hash of aSeed). Without this jitter, every particle
  // would re-fire on the same global period — even with uniform phase
  // offsets the field reads as faintly synchronized, because each
  // particle's cadence is identical. With per-particle freq jitter, phases
  // drift apart continuously and no global beat exists.
  float slowOsc  = sin(uTime * uShimmerSlowFreq + aSeed * 7.13);
  float baseline = 1.0 + uShimmerSlowAmp * slowOsc;
  // Two hashes off aSeed: one for the firing phase, one for the per-particle
  // rate jitter. sin/fract is the standard cheap GLSL hash.
  float h1 = fract(sin(aSeed * 78.233) * 43758.5453);
  float h2 = fract(sin(aSeed * 12.989 + 4.21) * 43758.5453);
  // Symmetric jitter (0.6× .. 1.4× the slider value) → mean firing rate
  // stays close to what the slider says, no two particles share a clock.
  float perParticleFreq = max(uShimmerSpikeFreq * mix(0.6, 1.4, h2), 0.0001);
  // fract(...)/freq is the seconds elapsed since this particle's last spike
  // event — exponential decay over real time, not over phase.
  float spikePhase = uTime * perParticleFreq + h1;
  float secondsSinceSpike = fract(spikePhase) / perParticleFreq;
  float spike = exp(-secondsSinceSpike * uShimmerSharpness) * uShimmerSpikeAmp;
  float shimmerIntensity = baseline + spike;
  vAlpha = fadeIn * fadeOut * mix(1.0, shimmerIntensity, uShimmerDepth);

  // Per-edge fade: sample the 1×numEdges fade texture at this particle's
  // curve. Each particle has its own pseudo-random threshold derived from
  // aSeed; particles whose threshold exceeds the current fade are dropped.
  // This gives a gradual "thinning" of the branch as the fade animates from
  // 1 → 0 (or fills in 0 → 1) rather than a uniform dim.
  vec4 edgeFadeSample = texture2D(uEdgeFades, vec2(0.5, (aCurveIndex + 0.5) / uCurveTexHeight));
  float edgeFade = edgeFadeSample.r;
  float entryRamp = edgeFadeSample.g; // 1 on edges that should dissolve from life=0
  float dropThreshold = fract(aSeed * 0.13782 + 0.317);
  vAlpha *= step(dropThreshold, edgeFade);
  // Ramp particle alpha from the dangling head of the curve into the
  // destination node, so the stub edge fades into the background instead of
  // ending abruptly in mid-space. Pow > 1 keeps the upstream end faint for
  // longer before brightening toward the root.
  float entryAlpha = pow(smoothstep(0.0, 1.0, life), 2.2);
  vAlpha *= mix(1.0, entryAlpha, entryRamp);

  // Bursty emission: gate alpha by a 3D noise indexed on (streamId, life,
  // time). Peaks of the noise are "bursts" along the stream (bright clumps),
  // valleys are "gaps" (dark). All particles in the stream share the noise
  // function, so the bunches read as coherent clumps moving through the wisp
  // rather than per-particle flicker. The third axis lets the bunch pattern
  // itself drift over real time.
  if (uBunchContrast > 0.001) {
    float bunchN = vnoise(vec3(
      aStreamId * 2.13,
      life * uBunchFreq + aStreamId * 0.71,
      uTime * uBunchTime
    ));
    float gate = clamp(0.5 + 0.5 * bunchN, 0.0, 1.0);
    // Sharpen the gate so bursts read as clear "dots" vs "gaps" rather than
    // a uniform haze — the contrast control feeds both how much we modulate
    // and how steep the cutoff is.
    gate = smoothstep(0.5 - 0.5 * uBunchContrast, 0.5 + 0.5 * uBunchContrast, gate);
    vAlpha *= mix(1.0, gate, uBunchContrast);
  }

  vKindMix = mix(aFromCrisis, aToCrisis, life);

  // Local tangent → perpendicular basis → place particle at (angle, radius)
  // around the curve axis so the trunk reads as a 3D tube.
  float dt = 0.01;
  float lifeAhead = clamp(life + dt, 0.0, 1.0);
  float lifeBack  = clamp(life - dt, 0.0, 1.0);
  vec3 base   = sampleCurve(aCurveIndex, life);
  vec3 ahead  = sampleCurve(aCurveIndex, lifeAhead);
  vec3 behind = sampleCurve(aCurveIndex, lifeBack);
  vec3 tangent = normalize(ahead - behind + vec3(1e-5, 0.0, 0.0));
  vec3 ref = abs(tangent.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 b1 = normalize(cross(tangent, ref));
  vec3 b2 = normalize(cross(tangent, b1));

  float radWobble = 1.0 + 0.25 * sin(uTime * 0.8 + aSeed * 4.13);
  float r = aRadialRadius * uTubeRadius * radWobble;
  vec3 tubeOffset = (cos(aRadialAngle) * b1 + sin(aRadialAngle) * b2) * r;

  // Wisp displacement: every particle on the same edge at the same age sees
  // the same dominant wind, so adjacent streams curve together into one
  // visible wisp. A small per-stream perturbation keeps individual threads
  // distinct within the wisp.
  vec3 drift = wispOffset(aCurveIndex, aStreamId, life, uTime);
  // Endpoint pinch: collapse the off-spine displacement at life=0 and life=1
  // so threads visibly converge at the nodes. The pinch is a product of two
  // smoothsteps rising over the first/last uPinEnds fraction of life.
  float pinch = uPinEnds > 0.001
    ? smoothstep(0.0, uPinEnds, life) * smoothstep(0.0, uPinEnds, 1.0 - life)
    : 1.0;
  // Node volume: as the pinch closes (pinch → 0), each stream is parked at
  // a small stable per-stream offset around the spine. The three components
  // are independent noise samples of aStreamId — deterministic in time, so
  // the ball doesn't shimmer; different per stream, so threads fill the
  // ball instead of stacking on one point. Streams from other segments
  // converging at the same world position add more particles to the ball.
  vec3 nodeBlob = vec3(
    vnoise(vec3(aStreamId * 1.71,  1.3, 0.0)),
    vnoise(vec3(aStreamId * 1.71,  7.1, 0.0)),
    vnoise(vec3(aStreamId * 1.71, 13.7, 0.0))
  ) * uNodeVolume;
  vec3 pos = base + (tubeOffset + drift) * pinch + nodeBlob * (1.0 - pinch);

  // --- node proximity / bulge / motion ---------------------------------
  // One pass per node: accumulate Gaussian proximity (for the bulge tint and
  // size boost), then add tangential swirl + per-particle radial bias as a
  // single displacement vector. Particles near a node visibly thicken,
  // tangentially circulate, and split between "infallers" and "orbiters".
  float prox = 0.0;
  vec3 colSum = vec3(0.0);
  float colWeight = 0.0;
  vec3 nodeWarp = vec3(0.0);
  for (int i = 0; i < MAX_NODES_HARD_CAP; i++) {
    if (i >= uNodeCount) break;
    vec4 pf = nodePosFade(i);
    vec3 npos = pf.xyz;
    float nf = pf.w;
    if (nf < 0.001) continue;
    vec4 ce = nodeColorEmph(i);
    float emph = ce.w;
    float effR = mix(uNodeRadius, uNodeEmphRadius, emph);
    vec3 toP = pos - npos;
    float d = length(toP);

    float k = exp(-(d * d) / max(effR * effR, 1e-5)) * nf;
    // Tight inner pinprick on top of the wide bulge — gives the "sun core"
    // look where the center reads as a defined hot point.
    float coreR = effR * 0.3;
    float kCore = exp(-(d * d) / max(coreR * coreR, 1e-5)) * nf;
    prox += k * (1.0 + emph * 0.8) + kCore * uNodeCoreStrength * (1.0 + emph * 2.0);
    colSum += ce.rgb * (k + kCore * 0.5);
    colWeight += k + kCore * 0.5;

    // Swirl + gravity zone extends slightly beyond the proximity radius.
    float swirlR = effR * 1.8;
    if (d < swirlR && d > 0.001) {
      vec3 radial = toP / d;
      vec3 axisRef = abs(radial.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
      vec3 tangent = normalize(cross(radial, axisRef));
      float falloff = (1.0 - d / swirlR) * nf;
      float phase = uTime * uNodeSwirlSpeed + aSeed * 12.7 + float(i) * 2.1;
      nodeWarp += tangent * sin(phase) * uNodeSwirlStrength * falloff;
      // Per-particle radial bias: deterministic from aSeed gives a stable mix
      // of "infallers" (positive) and "orbiters/escapers" (negative).
      float pull = sin(aSeed * 0.231 + 1.7) * uNodeGravity * falloff;
      nodeWarp -= radial * pull;
      // Uniform center pull: every particle in the zone, same direction.
      nodeWarp -= radial * uNodeCenterGravity * falloff;
    }
  }
  vNodeProx = prox;
  vNodeCol = colWeight > 0.0001 ? colSum / colWeight : vec3(1.0);

  // Extra wisp turbulence near nodes — pass a perturbed curve/stream/age so
  // the near-node puffing reads as additional curl on top of the main
  // filament path, not a clone of it. Pinched the same way so the endpoint
  // convergence isn't undone by the near-node turbulence boost.
  vec3 nearDrift = wispOffset(aCurveIndex + 3.7, aStreamId + 11.3, life + 0.27, uTime * 1.7)
                   * uNodeDriftBoost * prox * pinch;
  pos += nodeWarp + nearDrift;

  // Global wind: a single direction modulated by slow gusts. Same offset for
  // every particle — the field leans together rather than each grain doing
  // its own thing.
  float gust = 0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * uWindSpeed));
  pos += uWindDir * uWindStrength * gust;

  // Glint partition: ~uGlintRatio fraction of particles are bright specular
  // grains; the rest are dim matte base. Pure aSeed derivation keeps the
  // partition stable for each particle.
  vIsGlint = step(1.0 - uGlintRatio, fract(aSeed * 0.0317 + 0.456));

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = max(-mv.z, 0.0001);
  // Glint particles get bigger so they read as defined pinpricks under bloom.
  float glintBoost = mix(1.0, uGlintSizeMult, vIsGlint);
  float baseSize = uPointSize * (10.0 / dist) * (1.0 + uNodeBulgeSize * prox) * glintBoost;

  // --- motion-blur streak --------------------------------------------------
  // Project the world-space curve tangent into screen space; that direction
  // is where the particle is heading. We enlarge the point sprite by
  // streakFactor along this axis, and the fragment shader compresses the
  // perpendicular axis by the same factor — so the visible region inside
  // the (now larger) sprite is an ellipse aligned with motion.
  if (uStreakAmp > 0.001) {
    vec4 mvT = modelViewMatrix * vec4(pos + tangent * 0.05, 1.0);
    vec4 clT = projectionMatrix * mvT;
    vec2 ndcHere = gl_Position.xy / max(gl_Position.w, 1e-4);
    vec2 ndcT    = clT.xy / max(clT.w, 1e-4);
    // NDC y is up; gl_PointCoord y is down. Flip y so the varying is in the
    // same frame the fragment shader's gl_PointCoord uses.
    vec2 screenDir = vec2((ndcT.x - ndcHere.x), -(ndcT.y - ndcHere.y)) * uResolution;
    float L = length(screenDir);
    vScreenTangent = L > 1e-4 ? screenDir / L : vec2(1.0, 0.0);
    vStreakFactor = 1.0 + uStreakAmp;
  } else {
    vScreenTangent = vec2(1.0, 0.0);
    vStreakFactor = 1.0;
  }

  // Sub-pixel shimmer guard. The intended sprite size (post-streak) might
  // drop below 1 pixel as the camera pulls back or the user picks a tiny
  // point size; in that regime the rasterizer's coverage decision flips
  // per-frame and the particle visibly stutters. Clamp the actual size at
  // uMinPointSize and dim the alpha by the squared coverage ratio so the
  // intended energy is preserved while the rendering stays stable.
  float intendedSize = baseSize * vStreakFactor;
  float floorPx = max(uMinPointSize, 1.0);
  float coverage = clamp(intendedSize / floorPx, 0.0, 1.0);
  vAlpha *= coverage * coverage;
  gl_PointSize = max(intendedSize, floorPx);
}
`;
