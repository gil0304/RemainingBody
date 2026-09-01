import * as THREE from 'three';
import { CONFIG } from '../config/constants';
import { FullscreenPass } from '../rendering/FullscreenPass';
import copyFrag from '../shaders/copy.frag?raw';

export interface HistorySample {
  /** normalized atlas offset of the older frame */
  ax: number;
  ay: number;
  /** normalized atlas offset of the newer frame */
  bx: number;
  by: number;
  /** interpolation toward the newer frame */
  mix: number;
}

/**
 * Continuous ring-buffer recording of the live mask, tiled into one R8 atlas
 * (fixed GPU memory, spec §18). The delayed taps read from it so past bodies
 * can move through the space again. Empty rooms record empty frames, so a
 * ghost naturally vanishes exactly delayMs after its person left — and a new
 * visitor can meet the previous visitor's moving past (spec §16, §71).
 */
export class MaskHistory {
  private readonly atlas: THREE.WebGLRenderTarget;
  private readonly pass: FullscreenPass;
  private readonly times: Float64Array;
  private readonly cap: number;
  private readonly intervalMs: number;
  private count = 0;
  private lastRecordAt = -Infinity;

  constructor() {
    const { size, cols, rows } = CONFIG.ghosts.atlas;
    this.cap = cols * rows;
    this.intervalMs = 1000 / CONFIG.ghosts.recordFps;
    this.times = new Float64Array(this.cap).fill(Number.NEGATIVE_INFINITY);
    this.atlas = new THREE.WebGLRenderTarget(size, size, {
      format: THREE.RedFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.atlas.scissorTest = true;
    this.pass = new FullscreenPass(copyFrag, { uSrc: { value: null } });
  }

  get texture(): THREE.Texture {
    return this.atlas.texture;
  }

  get recordedCount(): number {
    return Math.min(this.count, this.cap);
  }

  record(renderer: THREE.WebGLRenderer, source: THREE.Texture, now: number): void {
    if (now - this.lastRecordAt < this.intervalMs) return;
    this.lastRecordAt = now;

    const { cols, tileW, tileH } = CONFIG.ghosts.atlas;
    const idx = this.count % this.cap;
    const col = idx % cols;
    const row = (idx / cols) | 0;
    this.atlas.viewport.set(col * tileW, row * tileH, tileW, tileH);
    this.atlas.scissor.set(col * tileW, row * tileH, tileW, tileH);
    this.pass.material.uniforms.uSrc.value = source;
    this.pass.render(renderer, this.atlas);
    renderer.setRenderTarget(null);

    this.times[idx] = now;
    this.count++;
  }

  /** Frames bracketing (now - delayMs), or null if not recorded / aged out. */
  sample(now: number, delayMs: number): HistorySample | null {
    const newest = this.count - 1;
    if (newest < 1) return null;
    const target = now - delayMs;
    const newestTime = this.times[newest % this.cap];

    let stepsBack = Math.floor((newestTime - target) / this.intervalMs);
    if (stepsBack < 0) stepsBack = 0;
    let iB = newest - stepsBack;
    let iA = iB - 1;
    const oldest = Math.max(0, this.count - this.cap);

    // correct for recording jitter (bounded walks)
    while (iA > oldest && target < this.times[iA % this.cap]) {
      iB = iA;
      iA--;
    }
    while (iB < newest && target > this.times[iB % this.cap]) {
      iA = iB;
      iB++;
    }
    if (iA < oldest) return null;

    const tA = this.times[iA % this.cap];
    const tB = this.times[iB % this.cap];
    const mix = tB > tA ? Math.min(1, Math.max(0, (target - tA) / (tB - tA))) : 1;

    const { size, cols, tileW, tileH } = CONFIG.ghosts.atlas;
    const a = iA % this.cap;
    const b = iB % this.cap;
    return {
      ax: ((a % cols) * tileW) / size,
      ay: (((a / cols) | 0) * tileH) / size,
      bx: ((b % cols) * tileW) / size,
      by: (((b / cols) | 0) * tileH) / size,
      mix,
    };
  }

  dispose(): void {
    this.atlas.dispose();
    this.pass.dispose();
  }
}
