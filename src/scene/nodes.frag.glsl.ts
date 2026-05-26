// Fragment shader: flat-shaded sphere body with a fresnel rim. The body is
// a uniform dark tint of the per-instance color; the rim drives the bloom
// corona and the selected-node "light up".
export const nodesFrag = /* glsl */ `
precision highp float;

uniform float uRimStrength;
uniform vec3  uDarkTint;       // body color tint (multiplied with instance color)
uniform float uOpacity;        // 0 = invisible (still raycast), 1 = full

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vInstColor;
varying float vKind;
varying float vEmphasis;

void main() {
  // Flat dark surface — emphasis (focused node) brightens it a touch.
  vec3 surface = vInstColor * uDarkTint * (1.0 + 0.8 * vEmphasis);

  // Fresnel-ish rim. The emphasis multiplier here is what makes the
  // *selected* node visibly "light up" without changing its size — 8.0
  // gives a 9× rim boost on focus.
  float facing = max(0.0, dot(vNormal, vViewDir));
  float rim = pow(1.0 - facing, 2.5);
  vec3 rimColor = mix(vec3(0.85, 1.0, 1.4), vec3(1.5, 0.9, 0.4), vKind);
  surface += rimColor * rim * uRimStrength * (1.0 + 8.0 * vEmphasis);

  // Fully opaque output — the whole sphere body acts as a solid occluder,
  // so front spheres hide back spheres (and wisps) regardless of which
  // instance in the InstancedMesh rasterises first. uOpacity dims the
  // color toward black instead of fading alpha, which preserves correct
  // depth ordering (alpha-blended low-alpha would let back rims bleed
  // through). At uOpacity=0 we discard entirely so the sphere genuinely
  // vanishes (no invisible black occluder swallowing wisps).
  if (uOpacity < 0.005) discard;
  gl_FragColor = vec4(surface * uOpacity, 1.0);
}
`;
