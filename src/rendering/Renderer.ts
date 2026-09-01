import * as THREE from 'three';
import { BackgroundRenderer } from './BackgroundRenderer';
import { CurrentBodyRenderer } from './CurrentBodyRenderer';
import { GhostRenderer } from './GhostRenderer';
import type { MaskHistory } from '../shadow/MaskHistory';
import { AmbientDust, disposeSharedParticleGeometry } from './ParticleRenderer';
import { updateShadowVisual } from './ShadowRenderer';
import { PostProcessing } from './PostProcessing';
import { disposeSharedGeometries } from './FullscreenPass';
import type { ShadowSlot } from '../shadow/ShadowSnapshot';
import type { CoverScale } from '../utils/view';
import { CONFIG } from '../config/constants';

export interface FrameState {
  now: number;
  timeSec: number;
  appear: number;
  motion: number;
  maskTexture: THREE.Texture | null;
  /** live person texture for the current body, or null for silhouette mode */
  videoTexture: THREE.Texture | null;
  cover: CoverScale;
  /** mask history for the delayed-replay ghosts */
  history: MaskHistory | null;
}

/**
 * Owns the WebGL renderer, the additive HDR scene and the post chain
 * (spec §19, 51, 52). Internal resolution scales with GPU load (spec §53).
 */
export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  readonly background: BackgroundRenderer;
  readonly body: CurrentBodyRenderer;
  readonly ghosts: GhostRenderer;
  readonly dust: AmbientDust;
  private readonly post = new PostProcessing();
  private readonly sceneRT: THREE.WebGLRenderTarget;

  private width = 1;
  private height = 1;
  private dpr = 1;
  private renderScale = 1;
  /** EMA of full render pass duration (ms), for the debug panel */
  drawMs = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 1);
    container.appendChild(this.renderer.domElement);

    this.sceneRT = new THREE.WebGLRenderTarget(2, 2, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });

    this.background = new BackgroundRenderer(this.scene);
    this.body = new CurrentBodyRenderer(this.scene);
    this.ghosts = new GhostRenderer(this.scene);
    this.dust = new AmbientDust(this.scene);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  get internalPixelRatio(): number {
    return (this.sceneRT.height / 1080) * 2;
  }

  get currentRenderScale(): number {
    return this.renderScale;
  }

  setSize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.applyScale();
  }

  setRenderScale(scale: number): void {
    const clamped = Math.min(1, Math.max(CONFIG.render.minScale, scale));
    if (clamped === this.renderScale) return;
    this.renderScale = clamped;
    this.applyScale();
  }

  private applyScale(): void {
    const iw = Math.max(2, Math.round(this.width * this.dpr * this.renderScale));
    const ih = Math.max(2, Math.round(this.height * this.dpr * this.renderScale));
    this.sceneRT.setSize(iw, ih);
    this.post.setSize(iw, ih);
  }

  render(state: FrameState, shadowSlots: readonly ShadowSlot[], globalMotion: number): void {
    const t0 = performance.now();
    const aspect = this.width / this.height;
    const pr = this.internalPixelRatio;

    this.background.update(state.timeSec, aspect);
    this.body.update(
      state.maskTexture,
      state.videoTexture,
      state.cover,
      state.timeSec,
      state.appear,
      state.motion,
    );
    this.ghosts.update(state.history, state.now, state.timeSec);
    this.dust.update(state.timeSec, pr);

    for (const slot of shadowSlots) {
      if (!slot.active) continue;
      updateShadowVisual(slot, state.timeSec, state.now, globalMotion);
      slot.motes.uniforms.uPixelRatio.value = pr;
    }

    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    this.post.render(this.renderer, this.sceneRT.texture, state.timeSec, aspect);
    this.renderer.setRenderTarget(null);

    this.drawMs += (performance.now() - t0 - this.drawMs) * 0.05;
  }

  dispose(): void {
    this.background.dispose();
    this.body.dispose();
    this.ghosts.dispose();
    this.dust.dispose();
    this.post.dispose();
    this.sceneRT.dispose();
    disposeSharedGeometries();
    disposeSharedParticleGeometry();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
