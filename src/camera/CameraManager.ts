import { CONFIG } from '../config/constants';

/**
 * Webcam acquisition (spec §14). The video is used only as segmentation input
 * and is never drawn to the screen (spec §44); nothing is recorded or uploaded
 * (spec §45).
 */
export class CameraManager {
  readonly video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  /** called when the camera track dies (unplugged, permission revoked) */
  onEnded: (() => void) | null = null;

  constructor() {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
  }

  get ready(): boolean {
    return this.stream !== null && this.video.readyState >= 2;
  }

  get aspect(): number {
    if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
      return this.video.videoWidth / this.video.videoHeight;
    }
    return 16 / 9;
  }

  async start(): Promise<void> {
    this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: CONFIG.camera.idealWidth },
        height: { ideal: CONFIG.camera.idealHeight },
        frameRate: { ideal: CONFIG.camera.idealFps },
        facingMode: 'user',
      },
    });
    for (const track of this.stream.getVideoTracks()) {
      track.addEventListener('ended', () => this.onEnded?.());
    }
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  stop(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.video.srcObject = null;
  }
}
