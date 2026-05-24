// Fragment shader for sand-pigment particles.
// Soft circular sprite, additive in the framebuffer; bloom in postprocessing
// turns dense concentrations into the glowing pigment look.
export const particlesFrag = /* glsl */ `
precision highp float;

uniform vec3 uStableColor;
uniform vec3 uCrisisColor;
uniform float uIntensity;

varying float vAlpha;
varying float vKindMix;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(uv, uv);
  if (r2 > 1.0) discard;
  float falloff = exp(-r2 * 3.5);
  float a = falloff * vAlpha * uIntensity;

  vec3 col = mix(uStableColor, uCrisisColor, smoothstep(0.0, 1.0, vKindMix));
  col *= 1.0 + 0.5 * vKindMix; // crisis particles run hotter

  gl_FragColor = vec4(col * a, a);
}
`;
