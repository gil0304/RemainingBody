// Downsample + soft threshold for the very weak bloom (spec §52).
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uThreshold;
varying vec2 vUv;

void main() {
  vec3 c = texture2D(uScene, vUv).rgb * 0.25;
  c += texture2D(uScene, vUv + vec2(uTexel.x, 0.0)).rgb * 0.1875;
  c += texture2D(uScene, vUv - vec2(uTexel.x, 0.0)).rgb * 0.1875;
  c += texture2D(uScene, vUv + vec2(0.0, uTexel.y)).rgb * 0.1875;
  c += texture2D(uScene, vUv - vec2(0.0, uTexel.y)).rgb * 0.1875;
  float l = dot(c, vec3(0.3333));
  float w = smoothstep(uThreshold, uThreshold + 0.4, l);
  gl_FragColor = vec4(c * w, 1.0);
}
