/**
 * Development-only overlay, shown exclusively with ?debug=true (spec §28).
 * Never constructed in normal operation.
 */
export interface DebugStats {
  fps: number;
  segFps: number;
  segMs: number;
  drawMs: number;
  shadowCount: number;
  maxShadows: number;
  ghostCount: number;
  historyFrames: number;
  coverage: number;
  motion: number;
  present: boolean;
  appear: number;
  renderScale: number;
  resolution: string;
  gpu: string;
}

export class DebugPanel {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLPreElement;
  private readonly maskCanvas: HTMLCanvasElement;
  private readonly maskCtx: CanvasRenderingContext2D;
  private imageData: ImageData | null = null;
  private lastTextUpdate = 0;

  constructor(video: HTMLVideoElement | null) {
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:10;background:rgba(0,0,0,0.65);' +
      'color:#9fa4b8;font:10px/1.5 ui-monospace,monospace;padding:8px;border-radius:4px;' +
      'pointer-events:none;user-select:none;';

    this.text = document.createElement('pre');
    this.text.style.cssText = 'margin:0 0 6px 0;white-space:pre;';
    this.root.appendChild(this.text);

    if (video) {
      video.style.cssText = 'width:160px;display:block;margin-bottom:6px;opacity:0.9;';
      this.root.appendChild(video);
    }

    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.style.cssText = 'width:160px;display:block;image-rendering:pixelated;';
    this.maskCtx = this.maskCanvas.getContext('2d')!;
    this.root.appendChild(this.maskCanvas);

    document.body.appendChild(this.root);
  }

  update(stats: DebugStats, mask: { data: Uint8Array; width: number; height: number } | null): void {
    const now = performance.now();
    if (now - this.lastTextUpdate > 250) {
      this.lastTextUpdate = now;
      this.text.textContent = [
        `render   ${stats.fps.toFixed(1)} fps  ${stats.drawMs.toFixed(2)} ms`,
        `segment  ${stats.segFps.toFixed(1)} fps  ${stats.segMs.toFixed(2)} ms`,
        `shadows  ${stats.shadowCount}/${stats.maxShadows}`,
        `ghosts   ${stats.ghostCount}  history ${stats.historyFrames}`,
        `coverage ${(stats.coverage * 100).toFixed(2)} %`,
        `motion   ${stats.motion.toFixed(3)}`,
        `presence ${stats.present ? 'PRESENT' : 'absent'}  env ${stats.appear.toFixed(2)}`,
        `scale    ${stats.renderScale.toFixed(2)}  ${stats.resolution}`,
        `gpu      ${stats.gpu}`,
      ].join('\n');
    }

    if (mask) {
      const { data, width, height } = mask;
      if (this.maskCanvas.width !== width || this.maskCanvas.height !== height) {
        this.maskCanvas.width = width;
        this.maskCanvas.height = height;
        this.imageData = this.maskCtx.createImageData(width, height);
      }
      const px = this.imageData!.data;
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        const o = i * 4;
        px[o] = v;
        px[o + 1] = v;
        px[o + 2] = v;
        px[o + 3] = 255;
      }
      this.maskCtx.putImageData(this.imageData!, 0, 0);
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
