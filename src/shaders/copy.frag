// Blit the live mask into a pooled snapshot render target.
uniform sampler2D uSrc;
varying vec2 vUv;

void main() {
  gl_FragColor = vec4(texture2D(uSrc, vUv).r, 0.0, 0.0, 1.0);
}
