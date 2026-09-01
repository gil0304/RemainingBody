// A remembered body. Ages through: soft blur -> edge distortion -> dissolve ->
// granular breakup -> gone (spec §10, 20-24). Additive (ONE, ONE); the post
// tonemap keeps overlaps from blowing out (spec §41).
uniform sampler2D uMask;
uniform vec2 uTexel;
uniform float uTime;
uniform float uSeed;
uniform float uAgeNorm;
uniform float uMotion;
uniform float uGlobalMotion;
uniform float uIntensity;
uniform float uReveal;
uniform float uDisturb;
uniform float uDisturbActive;
varying vec2 vUv;

void main() {
  // touching a memory ages it permanently (uDisturb, spec-D)
  float age = clamp(uAgeNorm + uDisturb * 0.35, 0.0, 1.0);

  // slow large-scale warp: the memory losing its shape; churns while touched
  float warpAmp = (0.003 + 0.075 * age * age) * (0.7 + 0.5 * uMotion + 0.3 * uGlobalMotion) +
    uDisturbActive * 0.02;
  vec2 warp = vec2(
    snoise(vUv * 3.1 + vec2(uSeed * 7.1, uTime * 0.045)),
    snoise(vUv * 3.1 + vec2(uSeed * 13.3 + 4.7, uTime * 0.038))
  ) * warpAmp;

  // fine crumbling of the contour
  float fineAmp = 0.004 * smoothstep(0.15, 0.85, age);
  vec2 fine = vec2(
    snoise(vUv * 26.0 + vec2(uSeed * 29.0, uTime * 0.09)),
    snoise(vUv * 26.0 + vec2(uSeed * 31.0 + 8.0, uTime * 0.08))
  ) * fineAmp;

  vec2 uv = vUv + warp + fine;

  // age-dependent blur, 8-tap disc
  float blurR = mix(0.6, 5.5, smoothstep(0.06, 0.9, age)) + uMotion * 1.5;
  vec2 br = uTexel * blurR;
  float m = texture2D(uMask, uv).r * 0.2;
  m += texture2D(uMask, uv + vec2(1.0, 0.0) * br).r * 0.1;
  m += texture2D(uMask, uv + vec2(-1.0, 0.0) * br).r * 0.1;
  m += texture2D(uMask, uv + vec2(0.0, 1.0) * br).r * 0.1;
  m += texture2D(uMask, uv + vec2(0.0, -1.0) * br).r * 0.1;
  m += texture2D(uMask, uv + vec2(0.707, 0.707) * br).r * 0.1;
  m += texture2D(uMask, uv + vec2(-0.707, 0.707) * br).r * 0.1;
  m += texture2D(uMask, uv + vec2(0.707, -0.707) * br).r * 0.1;
  m += texture2D(uMask, uv + vec2(-0.707, -0.707) * br).r * 0.1;
  m = smoothstep(0.22, 0.78, m);
  float mPre = m;

  // dissolve: the body loses parts of itself, not uniformly (spec §22)
  float d = fbm(vUv * 4.5 + vec2(uSeed * 17.0, uSeed * 23.0 + uTime * 0.012)) * 0.5 + 0.5;
  float dis = smoothstep(0.22, 1.0, age);
  float thr = dis * 1.15;
  m *= smoothstep(thr - 0.16, thr + 0.02, d + 0.06);

  // granular breakup into specks near the end (spec §24)
  float speck = smoothstep(0.25, 0.75, snoise(vUv * 64.0 + vec2(uSeed * 41.0, uTime * 0.05)) * 0.5 + 0.5);
  float breakup = smoothstep(0.45, 0.95, age);
  m *= mix(1.0, speck * 1.2, breakup * 0.85);

  // interior: ink / smoke density
  float interior = fbm(vUv * 3.0 + vec2(uSeed * 5.0, uTime * 0.02)) * 0.5 + 0.5;
  float lum = mix(0.80, 1.15, interior);

  // quiet rim light (spec §23: natural, not neon)
  float rim = m * (1.0 - m) * 4.0;

  // faint brightening where the body is currently being lost
  float e0 = smoothstep(thr - 0.20, thr - 0.04, d + 0.06);
  float e1 = 1.0 - smoothstep(thr - 0.04, thr + 0.06, d + 0.06);
  float dEdge = e0 * e1 * dis;

  // a memory only becomes visible once its moment has been left behind
  // (uReveal rises when the first ghost passes and the body has moved away)
  float presence = mix(0.18, 0.02, pow(smoothstep(0.02, 1.0, age), 0.7));
  float strength = uIntensity * uReveal * presence;

  vec3 cRecent = vec3(0.60, 0.60, 0.65);
  vec3 cOld = vec3(0.20, 0.20, 0.24);
  vec3 col = mix(cRecent, cOld, smoothstep(0.05, 0.75, age));
  col *= 1.0 + 0.05 * snoise(vec2(uSeed * 3.0, uTime * 0.05));

  vec3 rgb = col * (m * lum + rim * 0.10 + dEdge * mPre * 0.15) * strength;
  gl_FragColor = vec4(rgb, 1.0);
}
