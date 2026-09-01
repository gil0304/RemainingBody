import * as THREE from 'three';
import { getTriangleGeometry } from './FullscreenPass';
import fullscreenVert from '../shaders/fullscreen.vert?raw';
import noiseGlsl from '../shaders/noise.glsl?raw';
import backgroundFrag from '../shaders/background.frag?raw';

/** The quiet near-black space behind everything (spec §3, 25, 26). */
export class BackgroundRenderer {
  private readonly material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: noiseGlsl + '\n' + backgroundFrag,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: 16 / 9 },
      },
      blending: THREE.NoBlending,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(getTriangleGeometry(), this.material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 0;
    scene.add(mesh);
  }

  update(timeSec: number, aspect: number): void {
    this.material.uniforms.uTime.value = timeSec;
    this.material.uniforms.uAspect.value = aspect;
  }

  dispose(): void {
    this.material.dispose();
  }
}
