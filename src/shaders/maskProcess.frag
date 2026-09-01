// Raw MediaPipe confidence mask (camera space) -> screen-space live mask.
// Applies mirror (spec §43), vertical flip (DataTexture row 0 = image top),
// cover-fit crop, slight spatial blur and temporal EMA smoothing.
uniform sampler2D uRaw;
uniform sampler2D uPrev;
uniform vec2 uCoverScale;
uniform vec2 uRawTexel;
uniform float uBlend;
varying vec2 vUv;

void main() {
  vec2 cam = 0.5 + (vUv - 0.5) * uCoverScale;
  cam.x = 1.0 - cam.x;
  cam.y = 1.0 - cam.y;

  float raw = texture2D(uRaw, cam).r * 0.4;
  raw += texture2D(uRaw, cam + vec2(uRawTexel.x, 0.0)).r * 0.15;
  raw += texture2D(uRaw, cam - vec2(uRawTexel.x, 0.0)).r * 0.15;
  raw += texture2D(uRaw, cam + vec2(0.0, uRawTexel.y)).r * 0.15;
  raw += texture2D(uRaw, cam - vec2(0.0, uRawTexel.y)).r * 0.15;
  raw = smoothstep(0.35, 0.75, raw);

  float prev = texture2D(uPrev, vUv).r;
  gl_FragColor = vec4(mix(prev, raw, uBlend), 0.0, 0.0, 1.0);
}
