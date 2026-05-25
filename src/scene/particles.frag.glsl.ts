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
// Stream identity, forwarded for the upcoming per-stream pigment palette.
// Currently unused in the fragment shader — declared so the link matches
// the vertex shader.
varying float vStreamId;
// Screen-space tangent direction (gl_PointCoord frame, y-down) and the
// stretch factor the vertex shader applied to gl_PointSize. The fragment
// shader uses these to draw an elongated ellipse oriented along the
// tangent inside the enlarged point sprite.
varying vec2  vScreenTangent;
varying float vStreakFactor;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  // Streak shape: project uv onto the screen tangent and its perpendicular,
  // then compress the perpendicular axis by vStreakFactor. The sprite was
  // enlarged by the same factor in the vertex shader, so the visible region
  // ends up as an ellipse aligned with the motion direction. When
  // vStreakFactor == 1 this reduces to the original circular grain.
  vec2 perpDir = vec2(-vScreenTangent.y, vScreenTangent.x);
  float par  = dot(uv, vScreenTangent);
  float perp = dot(uv, perpDir) * vStreakFactor;
  float r2 = par * par + perp * perp;
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
