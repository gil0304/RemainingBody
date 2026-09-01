import * as THREE from 'three';
import { CONFIG } from '../config/constants';
import { computeCoverScale, type BBoxUV, type CoverScale } from '../utils/view';
import { FullscreenPass } from '../rendering/FullscreenPass';
import maskProcessFrag from '../shaders/maskProcess.frag?raw';

export interface MaskFrame {
  data: Float32Array;
  width: number;
  height: number;
}

export interface MaskStats {
  /** fraction of mask pixels above threshold */
  coverage: number;
  /** mean absolute inter-frame difference (raw, unnormalized) */
  motionRaw: number;
  /** bbox in screen-oriented camera UV (mirrored, y-up), or null */
  bbox: BBoxUV | null;
}

/**
 * CPU side: coverage / motion / bbox statistics from the raw confidence mask.
 * GPU side: raw camera-space mask -> mirrored, cover-fit, temporally smoothed
 * screen-space live mask (ping-pong R8 render targets).
 */
export class MaskProcessor {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly pass: FullscreenPass;
  private readonly rts: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private currentRt = 0;

  private rawTexture: THREE.DataTexture | null = null;
  private uploadBuffer: Uint8Array<ArrayBuffer> | null = null;
  private prevData: Float32Array | null = null;
  private hasPrev = false;

  readonly stats: MaskStats = { coverage: 0, motionRaw: 0, bbox: null };
  cover: CoverScale = { x: 1, y: 1 };
  /** latest uint8 mask for the debug panel */
  debugMask: { data: Uint8Array; width: number; height: number } | null = null;

  private camAspect = 16 / 9;
  private screenAspect = 16 / 9;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    const makeRT = () =>
      new THREE.WebGLRenderTarget(CONFIG.mask.width, CONFIG.mask.height, {
        format: THREE.RedFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      });
    this.rts = [makeRT(), makeRT()];
    this.pass = new FullscreenPass(maskProcessFrag, {
      uRaw: { value: null },
      uPrev: { value: null },
      uCoverScale: { value: new THREE.Vector2(1, 1) },
      uRawTexel: { value: new THREE.Vector2(1 / 256, 1 / 144) },
      uBlend: { value: CONFIG.segmentation.temporalBlend },
    });
  }

  get texture(): THREE.Texture {
    return this.rts[this.currentRt].texture;
  }

  setAspects(camAspect: number, screenAspect: number): void {
    this.camAspect = camAspect;
    this.screenAspect = screenAspect;
    this.cover = computeCoverScale(this.screenAspect, this.camAspect);
  }

  /** Ingest one raw segmentation frame (camera space, row 0 = image top). */
  push(frame: MaskFrame): void {
    const { data, width: w, height: h } = frame;
    const n = w * h;

    if (!this.uploadBuffer || this.uploadBuffer.length !== n) {
      this.uploadBuffer = new Uint8Array(new ArrayBuffer(n));
      this.prevData = new Float32Array(n);
      this.hasPrev = false;
      this.rawTexture?.dispose();
      this.rawTexture = new THREE.DataTexture(this.uploadBuffer, w, h, THREE.RedFormat, THREE.UnsignedByteType);
      this.rawTexture.minFilter = THREE.LinearFilter;
      this.rawTexture.magFilter = THREE.LinearFilter;
      this.rawTexture.wrapS = THREE.ClampToEdgeWrapping;
      this.rawTexture.wrapT = THREE.ClampToEdgeWrapping;
      this.rawTexture.unpackAlignment = 1;
      (this.pass.material.uniforms.uRawTexel.value as THREE.Vector2).set(1 / w, 1 / h);
      this.debugMask = { data: this.uploadBuffer, width: w, height: h };
    }

    const upload = this.uploadBuffer;
    const prev = this.prevData!;
    let coverageCount = 0;
    let diffSum = 0;
    let minX = w;
    let maxX = -1;
    let minY = h;
    let maxY = -1;

    for (let i = 0; i < n; i++) {
      const v = data[i];
      upload[i] = (v * 255) | 0;
      if (v > 0.5) {
        coverageCount++;
        const x = i % w;
        const y = (i / w) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      diffSum += Math.abs(v - prev[i]);
      prev[i] = v;
    }

    this.stats.coverage = coverageCount / n;
    this.stats.motionRaw = this.hasPrev ? diffSum / n : 0;

    if (maxX >= 0) {
      // camera px -> screen-oriented camera UV: mirror x, flip y (row 0 = top)
      this.stats.bbox = {
        minU: 1 - (maxX + 1) / w,
        maxU: 1 - minX / w,
        minV: 1 - (maxY + 1) / h,
        maxV: 1 - minY / h,
      };
    } else {
      this.stats.bbox = null;
    }

    this.rawTexture!.needsUpdate = true;
    this.runProcess();
    this.hasPrev = true;
  }

  private runProcess(): void {
    const src = this.rts[this.currentRt];
    const dst = this.rts[1 - this.currentRt];
    const u = this.pass.material.uniforms;
    u.uRaw.value = this.rawTexture;
    u.uPrev.value = src.texture;
    (u.uCoverScale.value as THREE.Vector2).set(this.cover.x, this.cover.y);
    u.uBlend.value = this.hasPrev ? CONFIG.segmentation.temporalBlend : 1;
    this.pass.render(this.renderer, dst);
    this.renderer.setRenderTarget(null);
    this.currentRt = 1 - this.currentRt;
  }

  dispose(): void {
    this.rts[0].dispose();
    this.rts[1].dispose();
    this.rawTexture?.dispose();
    this.pass.dispose();
  }
}
