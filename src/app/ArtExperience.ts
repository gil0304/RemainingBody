import * as THREE from 'three';
import { CONFIG } from '../config/constants';
import { SceneRenderer } from '../rendering/Renderer';
import { CameraTexture } from '../camera/CameraTexture';
import { MaskProcessor } from '../segmentation/MaskProcessor';
import { SegmentationManager } from '../segmentation/SegmentationManager';
import { CameraManager } from '../camera/CameraManager';
import { MotionAnalyzer } from '../motion/MotionAnalyzer';
import { PresenceTracker } from './PresenceTracker';
import { ShadowManager } from '../shadow/ShadowManager';
import { MaskHistory } from '../shadow/MaskHistory';
import { camBBoxToScreenRect, rectOverlapFrac } from '../utils/view';
import { DebugPanel } from '../debug/DebugPanel';
import { SyntheticMaskSource } from '../debug/SyntheticMaskSource';
import { AmbientAudio } from '../audio/AmbientAudio';

export interface ArtExperienceOptions {
  debug: boolean;
  synthetic: boolean;
  audio: boolean;
  model: string;
  maskIndex: number | null;
  /** 'video': the current body is the real person; 'silhouette': legacy look */
  bodyMode: 'video' | 'silhouette';
}

/**
 * The piece itself: wires camera -> segmentation -> live mask -> shadows ->
 * rendering, and runs the presence state machine (spec §3, 4, 16, 17, 34).
 */
export class ArtExperience {
  private readonly options: ArtExperienceOptions;
  private readonly sceneRenderer: SceneRenderer;
  private readonly maskProcessor: MaskProcessor;
  private readonly motion = new MotionAnalyzer();
  private readonly presence = new PresenceTracker();
  private readonly shadows: ShadowManager;
  private readonly history = new MaskHistory();

  private camera: CameraManager | null = null;
  private cameraTexture: CameraTexture | null = null;
  private syntheticTexture: THREE.CanvasTexture | null = null;
  private segmentation: SegmentationManager | null = null;
  private synthetic: SyntheticMaskSource | null = null;
  private debugPanel: DebugPanel | null = null;
  private audio: AmbientAudio | null = null;

  private rafId = 0;
  private disposed = false;
  private cameraRetryTimer = 0;
  private segRetryTimer = 0;
  private startTime = 0;
  private frameNow = 0;
  /** timestamp of the most recent segmentation mask (0 = none yet) */
  private lastMaskAt = 0;
  private cameraHealthy = false;
  private segmenterHealthy = false;

  private fpsEma = 60;
  private lastFrameAt = 0;
  private lastAdaptAt = 0;
  private gpuName = 'unknown';

  private readonly onResize = () => this.resize();
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'f') this.toggleFullscreen();
  };
  private readonly onContextLost = (e: Event) => {
    e.preventDefault();
    // exhibition resilience: recover by reloading (spec §18)
    setTimeout(() => location.reload(), 1500);
  };

  constructor(options: ArtExperienceOptions) {
    this.options = options;
    const container = document.getElementById('app')!;
    this.sceneRenderer = new SceneRenderer(container);
    this.maskProcessor = new MaskProcessor(this.sceneRenderer.renderer);
    this.shadows = new ShadowManager(this.sceneRenderer.scene);
    if (options.audio) this.audio = new AmbientAudio();

    this.sceneRenderer.canvas.addEventListener('webglcontextlost', this.onContextLost);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    this.readGpuName();

    if (options.debug) {
      // debug-only handle for development tooling; never present in exhibition mode
      (window as unknown as Record<string, unknown>).__remainingBody = this;
    }
  }

  private readGpuName(): void {
    try {
      const gl = this.sceneRenderer.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) this.gpuName = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    } catch {
      /* debug info only */
    }
  }

  async start(): Promise<void> {
    this.startTime = performance.now();
    this.resize();

    if (this.options.synthetic) {
      this.synthetic = new SyntheticMaskSource();
      if (this.options.bodyMode === 'video') {
        this.syntheticTexture = new THREE.CanvasTexture(this.synthetic.canvas);
        this.syntheticTexture.minFilter = THREE.LinearFilter;
        this.syntheticTexture.magFilter = THREE.LinearFilter;
        this.syntheticTexture.generateMipmaps = false;
        this.syntheticTexture.colorSpace = THREE.NoColorSpace;
      }
      this.synthetic.onMask = (frame) => {
        this.maskProcessor.push(frame);
        this.motion.update(this.maskProcessor.stats.motionRaw, this.frameNow);
        this.lastMaskAt = this.frameNow;
        if (this.syntheticTexture) this.syntheticTexture.needsUpdate = true;
      };
      this.cameraHealthy = true;
      this.segmenterHealthy = true;
      this.maskProcessor.setAspects(16 / 9, window.innerWidth / window.innerHeight);
      if (this.options.debug) this.debugPanel = new DebugPanel(null);
    } else {
      this.camera = new CameraManager();
      this.camera.onEnded = () => this.onCameraEnded();
      this.segmentation = new SegmentationManager(this.options.maskIndex);
      this.segmentation.onMask = (frame) => {
        this.maskProcessor.push(frame);
        this.motion.update(this.maskProcessor.stats.motionRaw, this.frameNow);
        this.lastMaskAt = this.frameNow;
      };
      if (this.options.debug) this.debugPanel = new DebugPanel(this.camera.video);

      await this.initSegmentation();
      await this.startCamera();
    }

    this.loop(performance.now());
  }

  private async initSegmentation(): Promise<void> {
    if (!this.segmentation || this.disposed) return;
    const modelPath =
      CONFIG.segmentation.models[this.options.model] ??
      CONFIG.segmentation.models[CONFIG.segmentation.defaultModel];
    try {
      await this.segmentation.init(modelPath);
      this.segmenterHealthy = true;
    } catch (err) {
      console.error('[remaining-body] segmentation init failed:', err);
      this.segmenterHealthy = false;
      clearTimeout(this.segRetryTimer);
      this.segRetryTimer = window.setTimeout(
        () => void this.initSegmentation(),
        CONFIG.segmentation.retryMs,
      );
    }
    this.updateStaffMessage();
  }

  private async startCamera(): Promise<void> {
    if (!this.camera || this.disposed) return;
    try {
      await this.camera.start();
      this.cameraHealthy = true;
      if (this.options.bodyMode === 'video' && !this.cameraTexture) {
        this.cameraTexture = new CameraTexture(this.camera.video);
      }
      this.maskProcessor.setAspects(this.camera.aspect, window.innerWidth / window.innerHeight);
    } catch {
      this.cameraHealthy = false;
      clearTimeout(this.cameraRetryTimer);
      this.cameraRetryTimer = window.setTimeout(() => void this.startCamera(), CONFIG.camera.retryMs);
    }
    this.updateStaffMessage();
  }

  private onCameraEnded(): void {
    if (this.disposed) return;
    this.cameraHealthy = false;
    this.updateStaffMessage();
    clearTimeout(this.cameraRetryTimer);
    this.cameraRetryTimer = window.setTimeout(() => void this.startCamera(), CONFIG.camera.retryMs);
  }

  /** Staff-only indicator: visible whenever perception is down (spec §63). */
  private updateStaffMessage(): void {
    const broken = !this.options.synthetic && (!this.cameraHealthy || !this.segmenterHealthy);
    document.getElementById('staff-message')?.classList.toggle('visible', broken);
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio);
    this.sceneRenderer.setSize(w, h, dpr);
    this.maskProcessor.setAspects(
      this.options.synthetic ? 16 / 9 : (this.camera?.aspect ?? 16 / 9),
      w / h,
    );
  }

  private loop = (now: number): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);
    this.step(now);
  };

  /**
   * One frame of the piece. Public only so debug tooling can drive frames
   * manually (e.g. in a hidden tab where rAF never fires).
   */
  step(now: number): void {
    if (this.disposed) return;
    this.frameNow = now;

    const dt =
      this.lastFrameAt === 0 ? 1 / 60 : Math.min(0.1, Math.max(0, (now - this.lastFrameAt) / 1000));
    if (this.lastFrameAt !== 0) {
      const instFps = 1000 / Math.max(1, now - this.lastFrameAt);
      this.fpsEma += (instFps - this.fpsEma) * 0.05;
    }
    this.lastFrameAt = now;

    // 1. perception
    if (this.synthetic) {
      this.synthetic.update(now);
    } else if (this.camera && this.segmentation) {
      this.segmentation.update(this.camera.video, now);
    }

    // 2. presence + snapshots
    // If masks stop arriving (camera dead, segmenter stalled) the last stats
    // freeze; treat them as "nobody" so the current body fades out and no
    // frozen snapshots are recorded (long-run resilience, spec §17, §18).
    const stats = this.maskProcessor.stats;
    const maskFresh = now - this.lastMaskAt < CONFIG.segmentation.staleMs;
    this.presence.update(maskFresh ? stats.coverage : 0, now, dt);

    if (
      maskFresh &&
      this.presence.present &&
      this.presence.env > 0.5 &&
      stats.coverage > CONFIG.shadows.minCoverage &&
      stats.bbox
    ) {
      const rect = camBBoxToScreenRect(stats.bbox, this.maskProcessor.cover, CONFIG.shadows.bboxPadding);
      if (rect) {
        this.shadows.tryCapture(
          this.sceneRenderer.renderer,
          this.maskProcessor.texture,
          rect,
          this.motion.energy,
          now,
        );
      }
    }
    this.shadows.update(now);

    // continuous mask history for the delayed-replay ghosts (10fps, ring)
    this.history.record(this.sceneRenderer.renderer, this.maskProcessor.texture, now);

    // B + D: reveal memories once their place is left; touching them ages them
    const bodyRect =
      maskFresh && this.presence.env > 0.1 && stats.bbox
        ? camBBoxToScreenRect(stats.bbox, this.maskProcessor.cover, 0.02)
        : null;
    for (const slot of this.shadows.slots) {
      if (!slot.active) continue;
      const overlap = bodyRect ? rectOverlapFrac(bodyRect, slot.rect) : 0;
      if (
        !slot.revealed &&
        now - slot.createdAt > CONFIG.shadows.revealDelayMs &&
        overlap < CONFIG.shadows.revealOverlapMax
      ) {
        slot.revealed = true;
      }
      const revealRate = dt / 1.4;
      slot.revealEnv = slot.revealed
        ? Math.min(1, slot.revealEnv + revealRate)
        : Math.max(0, slot.revealEnv - revealRate);

      if (
        slot.revealed &&
        overlap > CONFIG.shadows.disturbOverlapMin &&
        this.presence.env > 0.5
      ) {
        slot.disturb = Math.min(1, slot.disturb + dt / CONFIG.shadows.disturbSeconds);
        slot.disturbActive = Math.min(1, slot.disturbActive + dt * 3);
      } else {
        slot.disturbActive = Math.max(0, slot.disturbActive - dt * 1.5);
      }
    }

    // While the piece is empty, occasionally rebase the shader clock so uTime
    // stays within float32 precision over multi-day exhibition runs.
    if (
      now - this.startTime > 1_800_000 &&
      this.presence.env < 0.001 &&
      this.shadows.activeCount === 0
    ) {
      this.startTime = now;
    }

    // 3. image
    this.sceneRenderer.render(
      {
        now,
        timeSec: (now - this.startTime) / 1000,
        appear: this.presence.env,
        motion: this.motion.energy,
        maskTexture: this.maskProcessor.texture,
        videoTexture:
          this.options.bodyMode === 'video'
            ? (this.cameraTexture?.texture ?? this.syntheticTexture)
            : null,
        cover: this.maskProcessor.cover,
        history: this.history,
      },
      this.shadows.slots,
      this.motion.energy,
    );

    // 4. adaptation + ambience + debug
    this.adaptResolution(now);
    this.audio?.update(this.shadows.activeCount, this.presence.env, now);
    this.debugPanel?.update(
      {
        fps: this.fpsEma,
        segFps: this.segmentation?.stats.fps ?? 30,
        segMs: this.segmentation?.stats.ms ?? 0,
        drawMs: this.sceneRenderer.drawMs,
        shadowCount: this.shadows.activeCount,
        maxShadows: CONFIG.shadows.maxCount,
        ghostCount: this.sceneRenderer.ghosts.activeCount,
        historyFrames: this.history.recordedCount,
        coverage: stats.coverage,
        motion: this.motion.energy,
        present: this.presence.present,
        appear: this.presence.env,
        renderScale: this.sceneRenderer.currentRenderScale,
        resolution: `${window.innerWidth}x${window.innerHeight}`,
        gpu: this.gpuName,
      },
      this.maskProcessor.debugMask,
    );
  }

  private adaptResolution(now: number): void {
    if (now - this.lastAdaptAt < CONFIG.render.adaptIntervalMs) return;
    this.lastAdaptAt = now;
    // threshold below 30 so a healthy vsync'd 30Hz display (projectors) is
    // never mistaken for GPU overload
    const scale = this.sceneRenderer.currentRenderScale;
    if (this.fpsEma < 28 && scale > CONFIG.render.minScale) {
      this.sceneRenderer.setRenderScale(scale - 0.15);
    } else if (this.fpsEma > 55 && scale < 1) {
      this.sceneRenderer.setRenderScale(scale + 0.1);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.cameraRetryTimer);
    clearTimeout(this.segRetryTimer);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    this.sceneRenderer.canvas.removeEventListener('webglcontextlost', this.onContextLost);

    this.camera?.stop();
    this.cameraTexture?.dispose();
    this.syntheticTexture?.dispose();
    this.segmentation?.close();
    this.audio?.dispose();
    this.debugPanel?.dispose();
    this.history.dispose();
    this.shadows.dispose();
    this.maskProcessor.dispose();
    this.sceneRenderer.dispose();
  }
}
