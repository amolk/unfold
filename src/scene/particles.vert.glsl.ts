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
uniform float uTubeRadius;
uniform float uSpeedScale;
uniform vec2  uResolution;
uniform float uShimmerFreq1;
uniform float uShimmerFreq2;
uniform float uShimmerSharpness;
uniform float uShimmerDepth;

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
  vec3 q = p * s + vec3(seed * 13.37, seed * 7.13, uTime * 0.18);
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

  // Soft per-particle shimmer: each grain pulses gently on its own phase.
  // Two slightly-detuned frequencies prevent a visible global rhythm. The
  // exponent stays modest so the shimmer feels like granular twinkle, not
  // specular flashing.
  float p1 = 0.5 + 0.5 * sin(uTime * uShimmerFreq1 + aSeed * 31.4);
  float p2 = 0.5 + 0.5 * sin(uTime * uShimmerFreq2 + aSeed * 17.7 + 1.3);
  float shimmer = pow(p1 * p2, uShimmerSharpness);
  vAlpha = fadeIn * fadeOut * mix(1.0, 0.3 + 1.7 * shimmer, uShimmerDepth);

  // Per-edge fade: sample the 1×numEdges fade texture at this particle's
  // curve. Each particle has its own pseudo-random threshold derived from
  // aSeed; particles whose threshold exceeds the current fade are dropped.
  // This gives a gradual "thinning" of the branch as the fade animates from
  // 1 → 0 (or fills in 0 → 1) rather than a uniform dim.
  float edgeFade = texture2D(uEdgeFades, vec2(0.5, (aCurveIndex + 0.5) / uCurveTexHeight)).r;
  float dropThreshold = fract(aSeed * 0.13782 + 0.317);
  vAlpha *= step(dropThreshold, edgeFade);

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

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = max(-mv.z, 0.0001);
  gl_PointSize = uPointSize * (10.0 / dist);
}
`;
