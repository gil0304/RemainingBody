// Final pass: HDR scene + weak bloom -> soft tonemap (protects overlaps from
// clipping, spec §41) -> subtle vignette -> film grain that doubles as dither
// in the near-black field (spec §52).
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uAspect;
uniform vec2 uResolution;
varying vec2 vUv;

void main() {
  vec3 hdr = texture2D(uScene, vUv).rgb + texture2D(uBloom, vUv).rgb * uBloomStrength;
  vec3 c = 1.0 - exp(-hdr * uExposure);

  vec2 q = vUv - 0.5;
  q.x *= uAspect;
  c *= 1.0 - uVignette * smoothstep(0.45, 1.1, length(q));

  float g = hash12(vUv * uResolution + vec2(mod(uTime, 61.0) * 13.7, mod(uTime, 47.0) * 8.9));
  float luma = dot(c, vec3(0.333));
  c += (g - 0.5) * uGrain * (0.2 + 0.8 * smoothstep(0.0, 0.4, luma));
  c += (g - 0.5) * (1.5 / 255.0);

  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
}
