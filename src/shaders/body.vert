// Shared quad vertex shader for the current body and shadows.
// uRect: (x, y, w, h) in screen UV. uDrift/uScale: memory wander (spec §11, 42).
// vUv stays un-drifted so the silhouette texels move with the quad.
uniform vec4 uRect;
uniform vec2 uDrift;
uniform float uScale;
varying vec2 vUv;

void main() {
  vec2 local = uRect.xy + position.xy * uRect.zw;
  vec2 center = uRect.xy + uRect.zw * 0.5;
  vec2 p = center + (local - center) * uScale + uDrift;
  vUv = local;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
