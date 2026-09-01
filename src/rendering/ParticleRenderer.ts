import * as THREE from 'three';
import particlesVert from '../shaders/particles.vert?raw';
import particlesFrag from '../shaders/particles.frag?raw';
import dustVert from '../shaders/dust.vert?raw';
import { CONFIG } from '../config/constants';

export interface ShadowPointsVisual {
  points: THREE.Points;
  uniforms: Record<string, THREE.IUniform>;
}

function makeRandomGeometry(count: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const rand = new Float32Array(count * 4);
  for (let i = 0; i < rand.length; i++) rand[i] = Math.random();
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
  return geometry;
}

// One geometry shared by all shadow-mote systems.
let sharedMoteGeometry: THREE.BufferGeometry | null = null;

function getMoteGeometry(): THREE.BufferGeometry {
  if (!sharedMoteGeometry) sharedMoteGeometry = makeRandomGeometry(CONFIG.particles.perShadow);
  return sharedMoteGeometry;
}

export function disposeSharedParticleGeometry(): void {
  sharedMoteGeometry?.dispose();
  sharedMoteGeometry = null;
}

/** Motes that leave an aging shadow's surface (spec §24). */
export function createShadowPoints(maskTexture: THREE.Texture): ShadowPointsVisual {
  const uniforms: Record<string, THREE.IUniform> = {
    uMask: { value: maskTexture },
    uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uDrift: { value: new THREE.Vector2(0, 0) },
    uTime: { value: 0 },
    uAgeNorm: { value: 0 },
    uSeed: { value: 0 },
    uPixelRatio: { value: 1 },
    uColor: { value: new THREE.Color(0.32, 0.32, 0.38) },
    uIntensity: { value: CONFIG.visual.particleIntensity },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: particlesVert,
    fragmentShader: particlesFrag,
    uniforms,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    depthWrite: false,
    depthTest: false,
  });
  const points = new THREE.Points(getMoteGeometry(), material);
  points.frustumCulled = false;
  points.renderOrder = 4;
  points.visible = false;
  return { points, uniforms };
}

/** Near-invisible ambient dust field, alive even in the idle state (spec §3). */
export class AmbientDust {
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;

  constructor(scene: THREE.Scene) {
    this.geometry = makeRandomGeometry(CONFIG.particles.ambient);
    this.material = new THREE.ShaderMaterial({
      vertexShader: dustVert,
      fragmentShader: particlesFrag,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uColor: { value: new THREE.Color(0.5, 0.5, 0.58) },
        uIntensity: { value: CONFIG.visual.dustIntensity },
      },
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      depthWrite: false,
      depthTest: false,
    });
    const points = new THREE.Points(this.geometry, this.material);
    points.frustumCulled = false;
    points.renderOrder = 4;
    scene.add(points);
  }

  update(timeSec: number, pixelRatio: number): void {
    this.material.uniforms.uTime.value = timeSec;
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  dispose(): void {
    this.material.dispose();
    this.geometry.dispose();
  }
}
