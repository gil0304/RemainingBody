import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { CONFIG } from '../config/constants';
import type { MaskFrame } from './MaskProcessor';

/**
 * On-device person segmentation via MediaPipe (spec §13). Whole-body
 * silhouettes only — no face recognition, no identification, and every byte
 * stays in this browser (spec §45). Model + wasm are served locally (§46).
 */
export class SegmentationManager {
  private segmenter: ImageSegmenter | null = null;
  private personIndex: number | null = null;
  private readonly maskIndexOverride: number | null;

  private lastVideoTime = -1;
  private lastRunAt = 0;
  private buffer: Float32Array | null = null;

  readonly stats = { fps: 0, ms: 0 };
  private fpsCount = 0;
  private fpsWindowStart = 0;

  onMask: ((frame: MaskFrame) => void) | null = null;

  constructor(maskIndexOverride: number | null = null) {
    this.maskIndexOverride = maskIndexOverride;
  }

  get ready(): boolean {
    return this.segmenter !== null;
  }

  async init(modelPath: string): Promise<void> {
    this.close();
    const base = import.meta.env.BASE_URL;
    const fileset = await FilesetResolver.forVisionTasks(base + CONFIG.segmentation.wasmPath);
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: base + modelPath, delegate },
      runningMode: 'VIDEO' as const,
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
    try {
      this.segmenter = await ImageSegmenter.createFromOptions(fileset, options('GPU'));
    } catch {
      this.segmenter = await ImageSegmenter.createFromOptions(fileset, options('CPU'));
    }
  }

  private resolvePersonIndex(maskCount: number): number {
    if (this.maskIndexOverride !== null) return this.maskIndexOverride;
    if (this.personIndex !== null) return this.personIndex;
    if (maskCount === 1) {
      this.personIndex = 0;
    } else {
      let idx = -1;
      try {
        const labels = this.segmenter?.getLabels() ?? [];
        idx = labels.findIndex((l) => /person|selfie|foreground/i.test(l));
      } catch {
        idx = -1;
      }
      if (idx < 0) idx = maskCount === 21 ? 15 : 1;
      this.personIndex = idx;
    }
    return this.personIndex;
  }

  /** Run segmentation if a new video frame is available (throttled, spec §55). */
  update(video: HTMLVideoElement, now: number): void {
    if (!this.segmenter || video.readyState < 2) return;
    if (now - this.lastRunAt < 1000 / CONFIG.segmentation.maxFps) return;
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;
    this.lastRunAt = now;

    const t0 = performance.now();
    this.segmenter.segmentForVideo(video, now, (result) => {
      const masks = result.confidenceMasks;
      if (!masks || masks.length === 0) return;
      const idx = Math.min(this.resolvePersonIndex(masks.length), masks.length - 1);
      const mask = masks[idx];
      const src = mask.getAsFloat32Array();
      if (!this.buffer || this.buffer.length !== src.length) {
        this.buffer = new Float32Array(src.length);
      }
      this.buffer.set(src);

      this.stats.ms += (performance.now() - t0 - this.stats.ms) * 0.1;
      this.fpsCount++;
      if (now - this.fpsWindowStart > 1000) {
        this.stats.fps = (this.fpsCount * 1000) / Math.max(1, now - this.fpsWindowStart);
        this.fpsCount = 0;
        this.fpsWindowStart = now;
      }

      this.onMask?.({ data: this.buffer, width: mask.width, height: mask.height });
    });
  }

  close(): void {
    this.segmenter?.close();
    this.segmenter = null;
  }
}
