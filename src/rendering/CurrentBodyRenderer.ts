import * as THREE from 'three';
import { getUnitQuadGeometry } from './FullscreenPass';
import bodyVert from '../shaders/body.vert?raw';
import noiseGlsl from '../shaders/noise.glsl?raw';
import bodyFrag from '../shaders/body.frag?raw';
import { CONFIG } from '../config/constants';
import type { CoverScale } from '../utils/view';

/**
 * The present body: real-time, sharpest layer (spec §5-7, 12). By revised
 * direction it shows the real person (camera cut-out) in front of the
 * monochrome memories; silhouette mode remains available (?body=silhouette).
 * Premultiplied-alpha blending — see body.frag for how both modes share it.
 */
export class CurrentBodyRenderer {
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: bodyVert,
      fragmentShader: noiseGlsl + '\n' + bodyFrag,
      uniforms: {
        uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
        uDrift: { value: new THREE.Vector2(0, 0) },
        uScale: { value: 1 },
        uMask: { value: null },
        uVideo: { value: null },
        uUseVideo: { value: 0 },
        uCoverScale: { value: new THREE.Vector2(1, 1) },
        uTexel: { value: new THREE.Vector2(1 / CONFIG.mask.width, 1 / CONFIG.mask.height) },
        uTime: { value: 0 },
        uAppear: { value: 0 },
        uMotion: { value: 0 },
        uIntensity: { value: CONFIG.visual.bodyIntensity },
      },
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(getUnitQuadGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(
    maskTexture: THREE.Texture | null,
    videoTexture: THREE.Texture | null,
    cover: CoverScale,
    timeSec: number,
    appear: number,
    motion: number,
  ): void {
    const u = this.material.uniforms;
    u.uMask.value = maskTexture;
    u.uVideo.value = videoTexture;
    u.uUseVideo.value = videoTexture ? 1 : 0;
    (u.uCoverScale.value as THREE.Vector2).set(cover.x, cover.y);
    u.uTime.value = timeSec;
    u.uAppear.value = appear;
    u.uMotion.value = motion;
    this.mesh.visible = appear > 0.002 && maskTexture !== null;
  }

  dispose(): void {
    this.material.dispose();
  }
}
