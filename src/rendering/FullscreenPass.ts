import * as THREE from 'three';
import fullscreenVert from '../shaders/fullscreen.vert?raw';

// Shared geometries. Disposed once via disposeSharedGeometries().
let triangleGeometry: THREE.BufferGeometry | null = null;
let quadGeometry: THREE.BufferGeometry | null = null;

/** Single fullscreen triangle in clip space. */
export function getTriangleGeometry(): THREE.BufferGeometry {
  if (!triangleGeometry) {
    triangleGeometry = new THREE.BufferGeometry();
    triangleGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    triangleGeometry.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2),
    );
  }
  return triangleGeometry;
}

/** Unit quad (0..1) used by body/shadow meshes; placed via uRect uniform. */
export function getUnitQuadGeometry(): THREE.BufferGeometry {
  if (!quadGeometry) {
    quadGeometry = new THREE.BufferGeometry();
    quadGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3),
    );
    quadGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  }
  return quadGeometry;
}

export function disposeSharedGeometries(): void {
  triangleGeometry?.dispose();
  triangleGeometry = null;
  quadGeometry?.dispose();
  quadGeometry = null;
}

const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/** A single fullscreen shader pass rendering into a target (or the canvas). */
export class FullscreenPass {
  readonly material: THREE.ShaderMaterial;
  private readonly scene: THREE.Scene;

  constructor(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader,
      uniforms,
      blending: THREE.NoBlending,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(getTriangleGeometry(), this.material);
    mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(mesh);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null): void {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, passCamera);
  }

  dispose(): void {
    this.material.dispose();
  }
}
