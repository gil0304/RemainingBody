// Ambient dust: an almost invisible drifting particulate field, present even in
// the idle state (spec §3). Wraps around screen edges.
attribute vec4 aRand;
uniform float uTime;
uniform float uPixelRatio;
varying float vAlpha;

void main() {
  float phase = aRand.z * 6.28318;
  vec2 p = aRand.xy + vec2(uTime * 0.004 * (aRand.w - 0.5), uTime * 0.003 * (aRand.z - 0.5));
  p += 0.01 * vec2(sin(uTime * 0.11 + phase), cos(uTime * 0.13 + phase * 1.7));
  gl_Position = vec4(fract(p) * 2.0 - 1.0, 0.0, 1.0);

  vAlpha = 0.5 + 0.5 * sin(uTime * (0.2 + aRand.w * 0.5) + phase * 5.0);
  gl_PointSize = (0.8 + aRand.w * 1.4) * uPixelRatio;
}
