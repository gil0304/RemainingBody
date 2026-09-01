uniform vec3 uColor;
uniform float uIntensity;
varying float vAlpha;

void main() {
  vec2 q = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.08, length(q)) * vAlpha;
  gl_FragColor = vec4(uColor * a * uIntensity, 1.0);
}
