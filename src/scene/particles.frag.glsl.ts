// Fragment shader for sand-pigment particles.
// Soft circular sprite, additive in the framebuffer; bloom in postprocessing
// turns dense concentrations into the glowing pigment look.
export const particlesFrag = /* glsl */ `
precision highp float;

uniform vec3 uStableColor;
uniform vec3 uCrisisColor;
uniform float uIntensity;
uniform float uNodeColorMix;
uniform float uNodeBoost;

// Two-Gaussian grain: tight bright core + thin halo gives a crystalline
// pinhead instead of a soft gaussian blob.
uniform float uGrainCore;     // exponent for the core (higher = tighter)
uniform float uGrainHalo;     // exponent for the halo
uniform float uGrainHaloAmp;  // halo amplitude

uniform float uGlintIntensity;
uniform vec3  uGlintTint;

varying float vAlpha;
varying float vKindMix;
varying float vNodeProx;
varying vec3  vNodeCol;
varying float vIsGlint;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(uv, uv);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * uGrainCore);
  float halo = exp(-r2 * uGrainHalo) * uGrainHaloAmp;
  float falloff = core + halo;
  float a = falloff * vAlpha * uIntensity;

  vec3 col = mix(uStableColor, uCrisisColor, smoothstep(0.0, 1.0, vKindMix));
  col *= 1.0 + 0.5 * vKindMix; // crisis particles run hotter

  // Near nodes, tint toward the node's color and crank brightness so the
  // accumulation reads as a glowing sphere and triggers bloom.
  float tint = clamp(vNodeProx, 0.0, 1.0) * uNodeColorMix;
  col = mix(col, vNodeCol, tint);
  a *= 1.0 + uNodeBoost * clamp(vNodeProx, 0.0, 4.0);

  // Glint particles: tint toward a warm-white and multiply intensity so they
  // pop into bright specular pinpricks through bloom.
  col = mix(col, uGlintTint, vIsGlint * 0.6);
  a *= mix(1.0, uGlintIntensity, vIsGlint);

  gl_FragColor = vec4(col * a, a);
}
`;
