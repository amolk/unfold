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
uniform float uDriftAmp;
uniform float uDriftScale;
uniform float uDriftCoherence; // 0 = chaotic per-particle, 1 = position-locked
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
// solid spheres. Up to MAX_NODES of them — extras are ignored.
#define MAX_NODES 32
uniform int   uNodeCount;
uniform vec4  uNodePosFade[MAX_NODES];    // xyz = world position, w = fade
uniform vec4  uNodeColorEmph[MAX_NODES];  // rgb = color, w = 0/1 emphasis
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
attribute float aRadialAngle;
attribute float aRadialRadius;

varying float vAlpha;
varying float vKindMix;
varying float vNodeProx;
varying vec3  vNodeCol;
varying float vIsGlint;

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

vec3 driftField(vec3 p, float seed) {
  float s = uDriftScale;
  // Coherence: shrink the per-particle seed offset toward 0 so adjacent
  // particles sample the same noise direction and form visible streams.
  float spread = 1.0 - uDriftCoherence;
  vec3 q = p * s + vec3(seed * 13.37 * spread, seed * 7.13 * spread, uTime * 0.18);
  return vec3(
    vnoise(q),
    vnoise(q + vec3(31.4, 0.0, 0.0)),
    vnoise(q + vec3(0.0, 17.2, 0.0))
  );
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
  float life = fract(aPhase + uTime * aSpeed * uSpeedScale);
  float fadeIn  = smoothstep(0.0, 0.02, life);
  float fadeOut = smoothstep(0.0, 0.02, 1.0 - life);

  // Glitter shimmer:
  //   intensity = baseline + spike
  // Baseline is 1.0 plus an optional slow gentle wave. Spike fires only on
  // the positive half of a sine, raised to a high power so it's flat most of
  // the time with brief sharp peaks. Each particle has its own phase.
  float slowOsc  = sin(uTime * uShimmerSlowFreq + aSeed * 7.13);
  float baseline = 1.0 + uShimmerSlowAmp * slowOsc;
  float spikeRaw = sin(uTime * uShimmerSpikeFreq + aSeed * 31.4);
  float spike    = pow(max(0.0, spikeRaw), uShimmerSharpness) * uShimmerSpikeAmp;
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

  vec3 drift = driftField(base, aSeed) * uDriftAmp;
  vec3 pos = base + tubeOffset + drift;

  // --- node proximity / bulge / motion ---------------------------------
  // One pass per node: accumulate Gaussian proximity (for the bulge tint and
  // size boost), then add tangential swirl + per-particle radial bias as a
  // single displacement vector. Particles near a node visibly thicken,
  // tangentially circulate, and split between "infallers" and "orbiters".
  float prox = 0.0;
  vec3 colSum = vec3(0.0);
  float colWeight = 0.0;
  vec3 nodeWarp = vec3(0.0);
  for (int i = 0; i < MAX_NODES; i++) {
    if (i >= uNodeCount) break;
    vec3 npos = uNodePosFade[i].xyz;
    float nf = uNodePosFade[i].w;
    if (nf < 0.001) continue;
    float emph = uNodeColorEmph[i].w;
    float effR = mix(uNodeRadius, uNodeEmphRadius, emph);
    vec3 toP = pos - npos;
    float d = length(toP);

    float k = exp(-(d * d) / max(effR * effR, 1e-5)) * nf;
    // Tight inner pinprick on top of the wide bulge — gives the "sun core"
    // look where the center reads as a defined hot point.
    float coreR = effR * 0.3;
    float kCore = exp(-(d * d) / max(coreR * coreR, 1e-5)) * nf;
    prox += k * (1.0 + emph * 0.8) + kCore * uNodeCoreStrength * (1.0 + emph * 2.0);
    colSum += uNodeColorEmph[i].rgb * (k + kCore * 0.5);
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

  // Extra drift turbulence scales with bulge proximity, so streams "puff out"
  // near nodes.
  vec3 nearDrift = driftField(pos + vec3(uTime * 0.4, 0.0, 0.0), aSeed * 1.7)
                   * uDriftAmp * uNodeDriftBoost * prox;
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
  gl_PointSize = uPointSize * (10.0 / dist) * (1.0 + uNodeBulgeSize * prox) * glintBoost;
}
`;
