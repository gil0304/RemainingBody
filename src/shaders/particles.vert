// Motes leaving an aging body (spec §24). Each particle owns a random UV seed;
// it exists only where the shadow's mask is solid, and drifts slowly in all
// directions (never a plain upward stream).
attribute vec4 aRand;
uniform sampler2D uMask;
uniform vec4 uRect;
uniform vec2 uDrift;
uniform float uTime;
uniform float uAgeNorm;
uniform float uSeed;
uniform float uPixelRatio;
varying float vAlpha;

void main() {
  vec2 seedUv = uRect.xy + aRand.xy * uRect.zw;
  float m = texture2D(uMask, seedUv).r;
  float alive = step(0.4, m);

  float phase = aRand.z * 6.28318;
  float rate = 0.25 + aRand.w * 0.75;
  float t = uTime * rate * 0.3 + phase + uSeed * 10.0;

  vec2 drift = vec2(
    sin(t * 0.83 + phase) + 0.5 * sin(t * 0.31 + phase * 2.3),
    cos(t * 0.71 + phase * 1.7) + 0.5 * cos(t * 0.27)
  );
  drift *= 0.010 * smoothstep(0.30, 1.0, uAgeNorm) * (0.4 + aRand.w);

  vec2 p = seedUv + uDrift + drift;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);

  float env = smoothstep(0.30, 0.55, uAgeNorm) * (1.0 - smoothstep(0.80, 1.0, uAgeNorm));
  float cyc = 0.5 + 0.5 * sin(uTime * (0.3 + aRand.w * 0.8) + phase * 3.0);
  vAlpha = alive * env * cyc;

  gl_PointSize = (1.0 + aRand.w * 1.8) * uPixelRatio * (1.0 + uAgeNorm * 0.8);
}
