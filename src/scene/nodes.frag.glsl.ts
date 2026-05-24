// Fragment shader: sun-surface look. Multi-octave 3D noise sampled in world
// space gives the cellular "granulation" pattern, and a fresnel term lifts the
// limb into a bright rim that drives the bloom into a corona.
export const nodesFrag = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uPlasmaScale;
uniform float uPlasmaSpeed;
uniform float uRimStrength;
uniform float uHotBoost;       // extra HDR brightness for the hot color
uniform vec3  uHotTint;        // a bit warmer than the base instance color
uniform vec3  uDarkTint;       // sunspot color

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vInstColor;
varying float vKind;
varying float vEmphasis;

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

float plasma(vec3 p) {
  // Two octaves — large convection cells with finer granulation.
  float n1 = vnoise(p);
  float n2 = vnoise(p * 2.7 + 11.3) * 0.55;
  return (n1 + n2) / 1.55;
}

void main() {
  vec3 p = vWorldPos * uPlasmaScale + vec3(0.0, 0.0, uTime * uPlasmaSpeed);
  float n = plasma(p);
  // Granulation: bright cell interiors, darker cell boundaries.
  float granule = smoothstep(-0.25, 0.65, n);

  float emphHotBoost = uHotBoost * (1.0 + 2.5 * vEmphasis);
  vec3 baseHot  = vInstColor * uHotTint * emphHotBoost;
  vec3 baseDark = vInstColor * uDarkTint * (1.0 + 0.8 * vEmphasis);
  vec3 surface  = mix(baseDark, baseHot, granule);

  // Fresnel-ish rim. Hotter sources (and the focused node) get a stronger corona.
  float facing = max(0.0, dot(vNormal, vViewDir));
  float rim = pow(1.0 - facing, 2.5);
  vec3 rimColor = mix(vec3(0.85, 1.0, 1.4), vec3(1.5, 0.9, 0.4), vKind);
  surface += rimColor * rim * uRimStrength * (1.0 + 2.0 * vEmphasis);

  gl_FragColor = vec4(surface, 1.0);
}
`;
