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

// Woven multi-pigment palette: three categorical colors, picked per stream
// in the vertex shader (vPaletteIdx). uWeaveAmount mixes the picked color
// in over the base stable/crisis tint — 0 = no weaving (original behavior),
// 1 = pure palette. Lets the field read as red ribbons with blue/gold
// strands woven through rather than a single tint.
uniform vec3  uPaletteA;
uniform vec3  uPaletteB;
uniform vec3  uPaletteC;
uniform float uWeaveAmount;

varying float vAlpha;
varying float vKindMix;
varying float vNodeProx;
varying vec3  vNodeCol;
varying float vIsGlint;
// Per-particle base color, sampled in the vertex shader from the edge's
// EdgeFlow palette (uEdgeColors) at this particle's aColorIndex. Replaces the
// former kind-based stable/crisis mix + per-stream palette weave.
varying vec3  vColor;
// Stream identity, forwarded for downstream debugging — not currently read
// here (the palette is selected via vPaletteIdx instead).
varying float vStreamId;
// Per-stream palette bucket: 0=A, 1=B, 2=C. See vertex shader for weights.
varying float vPaletteIdx;
// Screen-space tangent direction (gl_PointCoord frame, y-down) and the
// stretch factor the vertex shader applied to gl_PointSize. The fragment
// shader uses these to draw an elongated ellipse oriented along the
// tangent inside the enlarged point sprite.
varying vec2  vScreenTangent;
varying float vStreakFactor;

// Push an RGB color to full saturation while preserving hue. Standard
// branchless HSV via Sam Hocevar's formulation; we then force S=1 and
// reconstruct. Glints use this so the per-stream pigment reads at full
// chroma — without it, woven palette colors look identical at glint scale.
vec3 saturateHue(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  const float e = 1.0e-10;
  vec3 hsv = vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), 1.0, q.x);
  vec4 K2 = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 pp = abs(fract(hsv.xxx + K2.xyz) * 6.0 - K2.www);
  return hsv.z * mix(K2.xxx, clamp(pp - K2.xxx, 0.0, 1.0), hsv.y);
}

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

  // Per-particle EdgeFlow color (set in the vertex shader). The up-to-8 colors
  // declared on an edge are interleaved across its particles in the requested
  // proportions, so this varies particle-to-particle within one edge.
  vec3 col = vColor;

  // Near nodes, tint toward the node's color and crank brightness so the
  // accumulation reads as a glowing sphere and triggers bloom.
  float tint = clamp(vNodeProx, 0.0, 1.0) * uNodeColorMix;
  col = mix(col, vNodeCol, tint);
  a *= 1.0 + uNodeBoost * clamp(vNodeProx, 0.0, 4.0);

  // Glint particles: push to full saturation so the per-stream pigment
  // (woven palette) reads clearly at glint scale, and multiply intensity
  // so they pop as bright pinpricks through bloom. Saturating preserves
  // hue — a red stream's glints stay red, a cobalt stream's stay cobalt.
  col = mix(col, saturateHue(col), vIsGlint);
  a *= mix(1.0, uGlintIntensity, vIsGlint);

  gl_FragColor = vec4(col * a, a);
}
`;
