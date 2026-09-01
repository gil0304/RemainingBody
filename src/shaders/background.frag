// Deep near-black space with a faint central lift and a very slow fog (spec §25, 26).
// Values are pre-tonemap; the composite exposure curve maps the base to ~rgb(3,3,4).
uniform float uTime;
uniform float uAspect;
varying vec2 vUv;

void main() {
  vec2 c = vUv - 0.5;
  c.x *= uAspect;
  float r = length(c);

  vec3 base = vec3(0.0065, 0.0065, 0.0085);
  float lift = (1.0 - smoothstep(0.05, 0.85, r)) * 0.011;
  float fog = fbm(vec2(vUv.x * uAspect, vUv.y) * 1.9 + vec2(uTime * 0.008, uTime * 0.005)) * 0.5 + 0.5;

  vec3 col = base + vec3(lift * 0.95, lift * 0.95, lift * 1.1) + fog * 0.0045;
  gl_FragColor = vec4(col, 1.0);
}
