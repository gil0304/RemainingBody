// Current body (spec §5-7, 12, 33, 39, revised direction: the present body is
// the real person, cut out by the segmentation mask; the shadows behind remain
// monochrome memories). Premultiplied-alpha blending (ONE, ONE_MINUS_SRC_ALPHA):
// - video mode writes alpha = mask, so the present body occludes the memories
//   standing behind it;
// - silhouette mode writes alpha = 0, which under this blend mode is plain
//   additive light, identical to the shadows' behaviour.
uniform sampler2D uMask;
uniform sampler2D uVideo;
uniform float uUseVideo;
uniform vec2 uCoverScale;
uniform vec2 uTexel;
uniform float uTime;
uniform float uAppear;
uniform float uMotion;
uniform float uIntensity;
varying vec2 vUv;

void main() {
  // barely-there organic wobble; disabled in video mode so the person stays true
  float amp = 0.0016 * (1.0 + uMotion * 0.8) * (1.0 - uUseVideo);
  vec2 wob = vec2(
    snoise(vUv * 5.0 + vec2(0.0, uTime * 0.10)),
    snoise(vUv * 5.0 + vec2(3.7, uTime * 0.09))
  ) * amp;
  vec2 uv = vUv + wob;

  vec2 br = uTexel * 0.9;
  float m = texture2D(uMask, uv).r * 0.4;
  m += texture2D(uMask, uv + vec2(br.x, 0.0)).r * 0.15;
  m += texture2D(uMask, uv - vec2(br.x, 0.0)).r * 0.15;
  m += texture2D(uMask, uv + vec2(0.0, br.y)).r * 0.15;
  m += texture2D(uMask, uv - vec2(0.0, br.y)).r * 0.15;
  m = smoothstep(0.30, 0.72, m);

  // emergence from darkness: dissolve-in rather than a plain fade (spec §33)
  float d = fbm(vUv * 4.0 + vec2(0.0, uTime * 0.02)) * 0.5 + 0.5;
  float thr = (1.0 - uAppear) * 1.2;
  m *= smoothstep(thr - 0.30, thr + 0.05, d + 0.10);

  float rim = m * (1.0 - m) * 4.0;

  if (uUseVideo > 0.5) {
    // the real person: mirrored, cover-fit, softly cut out
    vec2 cam = 0.5 + (vUv - 0.5) * uCoverScale;
    cam.x = 1.0 - cam.x;
    vec3 col = texture2D(uVideo, cam).rgb;

    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(luma), 0.15);        // sit gently in the monochrome world
    col *= 1.35 * uIntensity;                // pre-compensate the soft tonemap

    float a = m * uAppear;
    vec3 rgb = col * a + vec3(0.55, 0.55, 0.60) * rim * 0.05 * uAppear;
    gl_FragColor = vec4(rgb, a);
    return;
  }

  // silhouette mode (?body=silhouette, and synthetic development runs)
  float interior = fbm(vUv * 2.6 + vec2(uTime * 0.03, -uTime * 0.022)) * 0.5 + 0.5;
  float turb = fbm(vUv * 7.0 + vec2(uTime * 0.06 * (1.0 + uMotion), uTime * 0.045)) * 0.5 + 0.5;
  float lum = mix(0.70, 1.12, interior) + (turb - 0.5) * 0.18 * (0.35 + 0.65 * uMotion);

  vec3 col = vec3(0.882, 0.882, 0.902);
  col *= 1.0 + 0.02 * snoise(vec2(uTime * 0.07, 1.3));

  float strength = uIntensity * uAppear;
  vec3 rgb = col * (m * lum + rim * 0.12) * strength;
  gl_FragColor = vec4(rgb, 0.0);
}
