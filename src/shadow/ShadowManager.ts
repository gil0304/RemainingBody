import * as THREE from 'three';
import { CONFIG } from '../config/constants';
import { ShadowSlot } from './ShadowSnapshot';
import { FullscreenPass } from '../rendering/FullscreenPass';
import copyFrag from '../shaders/copy.frag?raw';
import type { RectUV } from '../utils/view';

/**
 * Records the live mask at snapshot intervals and ages the recorded bodies
 * until they vanish (spec §8, 9, 16, 17). All GPU resources are pooled and
 * bounded: nothing accumulates over a long exhibition run (spec §18).
 */
export class ShadowManager {
  readonly slots: ShadowSlot[] = [];
  private lastCaptureAt = -Infinity;
  private lastCenterX = 0;
  private lastCenterY = 0;
  private hasCaptured = false;
  private readonly copyPass: FullscreenPass;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < CONFIG.shadows.maxCount; i++) {
      const slot = new ShadowSlot();
      scene.add(slot.body.mesh);
      scene.add(slot.motes.points);
      this.slots.push(slot);
    }
    this.copyPass = new FullscreenPass(copyFrag, { uSrc: { value: null } });
  }

  get activeCount(): number {
    let n = 0;
    for (const s of this.slots) if (s.active) n++;
    return n;
  }

  /** Capture the live mask into a pooled slot. Returns true if recorded. */
  tryCapture(
    renderer: THREE.WebGLRenderer,
    liveMask: THREE.Texture,
    rect: RectUV,
    motionEnergy: number,
    now: number,
  ): boolean {
    if (now - this.lastCaptureAt < CONFIG.shadows.intervalMs) return false;

    // A shadow is a record of a place the body has left. While the viewer
    // stands still, no new memories are made — the old ones simply decay —
    // which keeps stillness stable and luminous instead of stacking the same
    // silhouette into white (spec §39, §41). Waving in place still records
    // (motionEnergy), so gestures leave their own traces.
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    if (this.hasCaptured) {
      const moved = Math.hypot(cx - this.lastCenterX, cy - this.lastCenterY);
      if (moved < CONFIG.shadows.minMoveDist && motionEnergy < CONFIG.shadows.minMotion) {
        return false;
      }
    }

    let slot = this.slots.find((s) => !s.active);
    if (!slot) {
      // pool exhausted: recycle the oldest memory
      slot = this.slots.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
    }

    this.copyPass.material.uniforms.uSrc.value = liveMask;
    this.copyPass.render(renderer, slot.rt);
    renderer.setRenderTarget(null);

    slot.activate(now, motionEnergy, rect, Math.random());
    this.lastCaptureAt = now;
    this.lastCenterX = cx;
    this.lastCenterY = cy;
    this.hasCaptured = true;
    return true;
  }

  /** Retire shadows past maximumShadowAge. */
  update(now: number): void {
    for (const slot of this.slots) {
      if (slot.active && now - slot.createdAt > CONFIG.shadows.maxAgeMs) slot.deactivate();
    }
  }

  dispose(): void {
    for (const slot of this.slots) slot.dispose();
    this.copyPass.dispose();
  }
}
