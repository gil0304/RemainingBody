import * as THREE from 'three';
import { FullscreenPass } from './FullscreenPass';
import noiseGlsl from '../shaders/noise.glsl?raw';
import brightpassFrag from '../shaders/brightpass.frag?raw';
import blurFrag from '../shaders/blur.frag?raw';
import compositeFrag from '../shaders/composite.frag?raw';
import { CONFIG } from '../config/constants';

function makeRT(w: number, h: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

/** Weak bloom + soft tonemap + vignette + grain (spec §52). */
export class PostProcessing {
  private readonly brightRT = makeRT(2, 2);
  private readonly blurART = makeRT(2, 2);
  private readonly blurBRT = makeRT(2, 2);

  private readonly brightPass: FullscreenPass;
  private readonly blurHPass: FullscreenPass;
  private readonly blurVPass: FullscreenPass;
  private readonly compositePass: FullscreenPass;

  constructor() {
    this.brightPass = new FullscreenPass(brightpassFrag, {
      uScene: { value: null },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uThreshold: { value: CONFIG.visual.bloomThreshold },
    });
    this.blurHPass = new FullscreenPass(blurFrag, {
      uSrc: { value: null },
      uDirection: { value: new THREE.Vector2(0, 0) },
    });
    this.blurVPass = new FullscreenPass(blurFrag, {
      uSrc: { value: null },
      uDirection: { value: new THREE.Vector2(0, 0) },
    });
    this.compositePass = new FullscreenPass(noiseGlsl + '\n' + compositeFrag, {
      uScene: { value: null },
      uBloom: { value: null },
      uBloomStrength: { value: CONFIG.visual.bloomStrength },
      uExposure: { value: CONFIG.visual.exposure },
      uVignette: { value: CONFIG.visual.vignette },
      uGrain: { value: CONFIG.visual.grain },
      uTime: { value: 0 },
      uAspect: { value: 16 / 9 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    });
  }

  /** internalW/H: scene render target size in pixels. */
  setSize(internalW: number, internalH: number): void {
    const bw = Math.max(1, internalW >> 2);
    const bh = Math.max(1, internalH >> 2);
    this.brightRT.setSize(bw, bh);
    this.blurART.setSize(bw, bh);
    this.blurBRT.setSize(bw, bh);
    (this.brightPass.material.uniforms.uTexel.value as THREE.Vector2).set(1 / internalW, 1 / internalH);
    (this.blurHPass.material.uniforms.uDirection.value as THREE.Vector2).set(1 / bw, 0);
    (this.blurVPass.material.uniforms.uDirection.value as THREE.Vector2).set(0, 1 / bh);
    (this.compositePass.material.uniforms.uResolution.value as THREE.Vector2).set(internalW, internalH);
  }

  render(renderer: THREE.WebGLRenderer, sceneTexture: THREE.Texture, timeSec: number, aspect: number): void {
    this.brightPass.material.uniforms.uScene.value = sceneTexture;
    this.brightPass.render(renderer, this.brightRT);

    this.blurHPass.material.uniforms.uSrc.value = this.brightRT.texture;
    this.blurHPass.render(renderer, this.blurART);

    this.blurVPass.material.uniforms.uSrc.value = this.blurART.texture;
    this.blurVPass.render(renderer, this.blurBRT);

    const cu = this.compositePass.material.uniforms;
    cu.uScene.value = sceneTexture;
    cu.uBloom.value = this.blurBRT.texture;
    cu.uTime.value = timeSec;
    cu.uAspect.value = aspect;
    this.compositePass.render(renderer, null);
  }

  dispose(): void {
    this.brightRT.dispose();
    this.blurART.dispose();
    this.blurBRT.dispose();
    this.brightPass.dispose();
    this.blurHPass.dispose();
    this.blurVPass.dispose();
    this.compositePass.dispose();
  }
}
