import * as THREE from 'three';
import { CONFIG } from '../config/constants';
import type { RectUV } from '../utils/view';
import { createShadowMesh, type ShadowVisual } from '../rendering/ShadowRenderer';
import { createShadowPoints, type ShadowPointsVisual } from '../rendering/ParticleRenderer';

/** Data held per recorded body (spec §49). */
export interface ShadowSnapshot {
  createdAt: number;
  motionEnergy: number;
  seed: number;
  rect: RectUV;
}

/**
 * A pooled slot: one R8 render target + one quad + one mote system, reused for
 * the lifetime of the piece so GPU memory stays flat (spec §18, 56).
 */
export class ShadowSlot implements ShadowSnapshot {
  readonly rt: THREE.WebGLRenderTarget;
  readonly body: ShadowVisual;
  readonly motes: ShadowPointsVisual;

  active = false;
  createdAt = 0;
  motionEnergy = 0;
  seed = 0;
  rect: RectUV = { x: 0, y: 0, w: 1, h: 1 };

  /** B: the memory surfaces only after its place has been left (spec §2) */
  revealed = false;
  revealEnv = 0;
  /** D: permanent decay added by the present body touching this memory */
  disturb = 0;
  /** short envelope while the touch is actively happening (drives the churn) */
  disturbActive = 0;

  constructor() {
    this.rt = new THREE.WebGLRenderTarget(CONFIG.shadows.rtWidth, CONFIG.shadows.rtHeight, {
      format: THREE.RedFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.body = createShadowMesh(this.rt.texture);
    this.motes = createShadowPoints(this.rt.texture);
  }

  activate(now: number, motionEnergy: number, rect: RectUV, seed: number): void {
    this.active = true;
    this.createdAt = now;
    this.motionEnergy = motionEnergy;
    this.rect = rect;
    this.seed = seed;
    this.revealed = false;
    this.revealEnv = 0;
    this.disturb = 0;
    this.disturbActive = 0;

    const bu = this.body.uniforms;
    (bu.uRect.value as THREE.Vector4).set(rect.x, rect.y, rect.w, rect.h);
    bu.uSeed.value = seed;
    bu.uMotion.value = motionEnergy;
    bu.uAgeNorm.value = 0;
    bu.uReveal.value = 0;
    bu.uDisturb.value = 0;
    bu.uDisturbActive.value = 0;
    // stays hidden until the reveal moment (updateShadowVisual drives it)
    this.body.mesh.visible = false;

    const pu = this.motes.uniforms;
    (pu.uRect.value as THREE.Vector4).set(rect.x, rect.y, rect.w, rect.h);
    pu.uSeed.value = seed;
    pu.uAgeNorm.value = 0;
    this.motes.points.visible = false;
  }

  deactivate(): void {
    this.active = false;
    this.body.mesh.visible = false;
    this.motes.points.visible = false;
  }

  ageNorm(now: number): number {
    const a = (now - this.createdAt) / CONFIG.shadows.maxAgeMs;
    return a < 0 ? 0 : a > 1 ? 1 : a;
  }

  dispose(): void {
    this.rt.dispose();
    (this.body.mesh.material as THREE.Material).dispose();
    (this.motes.points.material as THREE.Material).dispose();
  }
}
