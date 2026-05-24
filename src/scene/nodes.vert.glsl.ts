// Vertex shader for the node sphere instances. Passes worldspace position,
// view direction, and instance color through to the fragment for plasma
// shading + fresnel rim.
export const nodesVert = /* glsl */ `
precision highp float;

attribute vec3 aInstanceColor;
attribute float aInstanceKind; // 0 = stable, 1 = crisis
attribute float aInstanceScale;
attribute float aInstanceEmphasis; // 0 = normal, 1 = focused
attribute float aInstanceFade;     // 0 = invisible, 1 = full size

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vInstColor;
varying float vKind;
varying float vEmphasis;

void main() {
  // Multiply by fade so leaving nodes shrink to a point and new ones grow in.
  vec3 scaled = position * aInstanceScale * aInstanceFade;
  vec4 worldPos = instanceMatrix * vec4(scaled, 1.0);
  worldPos = modelMatrix * worldPos;
  vWorldPos = worldPos.xyz;

  // The instanceMatrix is translation-only here, so the normal is unchanged
  // by it; modelMatrix is also identity-ish for our group so the object-space
  // normal works as-is.
  vNormal = normalize(normalMatrix * normal);

  vec4 mv = viewMatrix * worldPos;
  vViewDir = normalize(-mv.xyz);

  vInstColor = aInstanceColor;
  vKind = aInstanceKind;
  vEmphasis = aInstanceEmphasis;

  gl_Position = projectionMatrix * mv;
}
`;
