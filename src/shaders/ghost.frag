// A past self, still moving: replays the mask recorded delayMs ago from the
// history atlas, interpolating between the two bracketing frames. Quieter than
// the present body, more present than the frozen shadows. Additive (ONE, ONE).
uniform sampler2D uAtlas;
uniform vec2 uTileScale;
uniform vec2 uTileA;
uniform vec2 uTileB;
uniform float uMix;
uniform vec2 uInset;
uniform float uTime;
uniform float uSeed;
uniform float uIntensity;
uniform float uDistort;
varying vec2 vUv;

void main() {
  // small living wobble: the memory is not perfectly faithful
  vec2 wob = vec2(
    snoise(vUv * 4.0 + vec2(uSeed * 11.0, uTime * 0.06)),
    snoise(vUv * 4.0 + vec2(uSeed * 17.0 + 3.0, uTime * 0.05))
  ) * uDistort;

  vec2 tuv = clamp(vUv + wob, uInset, 1.0 - uInset);
  float mA = texture2D(uAtlas, uTileA + tuv * uTileScale).r;
  float mB = texture2D(uAtlas, uTileB + tuv * uTileScale).r;
  float m = mix(mA, mB, uMix);
  m = smoothstep(0.30, 0.75, m);

  float interior = fbm(vUv * 2.8 + vec2(uSeed * 5.0, uTime * 0.025)) * 0.5 + 0.5;
  float lum = mix(0.78, 1.10, interior);
  float rim = m * (1.0 - m) * 4.0;

  vec3 col = vec3(0.70, 0.70, 0.75);
  vec3 rgb = col * (m * lum + rim * 0.10) * uIntensity;
  gl_FragColor = vec4(rgb, 1.0);
}
