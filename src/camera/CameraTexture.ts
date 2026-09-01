import * as THREE from 'three';

/**
 * GPU texture over the live camera video. Used only to draw the current
 * body's cut-out (masked by segmentation); the raw frame itself is never
 * shown and never leaves the browser (spec §45).
 */
export class CameraTexture {
  readonly texture: THREE.VideoTexture;

  constructor(video: HTMLVideoElement) {
    this.texture = new THREE.VideoTexture(video);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.NoColorSpace;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
