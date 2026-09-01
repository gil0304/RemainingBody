// 5-tap gaussian (linear-sampled weights), one direction per pass.
uniform sampler2D uSrc;
uniform vec2 uDirection;
varying vec2 vUv;

void main() {
  vec3 c = texture2D(uSrc, vUv).rgb * 0.2270270;
  vec2 o1 = uDirection * 1.3846153;
  vec2 o2 = uDirection * 3.2307692;
  c += texture2D(uSrc, vUv + o1).rgb * 0.3162162;
  c += texture2D(uSrc, vUv - o1).rgb * 0.3162162;
  c += texture2D(uSrc, vUv + o2).rgb * 0.0702702;
  c += texture2D(uSrc, vUv - o2).rgb * 0.0702702;
  gl_FragColor = vec4(c, 1.0);
}
