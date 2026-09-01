import * as THREE from 'three';
import { getUnitQuadGeometry } from './FullscreenPass';
import bodyVert from '../shaders/body.vert?raw';
import noiseGlsl from '../shaders/noise.glsl?raw';
import shadowFrag from '../shaders/shadow.frag?raw';
import { CONFIG } from '../config/constants';
import type { ShadowSlot } from '../shadow/ShadowSnapshot';

export interface ShadowVisual {
  mesh: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
}

/** Build the quad + material for one pooled shadow slot. */
export function createShadowMesh(maskTexture: THREE.Texture): ShadowVisual {
  const uniforms: Record<string, THREE.IUniform> = {
    uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uDrift: { value: new THREE.Vector2(0, 0) },
    uScale: { value: 1 },
    uMask: { value: maskTexture },
    uTexel: { value: new THREE.Vector2(1 / CONFIG.shadows.rtWidth, 1 / CONFIG.shadows.rtHeight) },
    uTime: { value: 0 },
    uSeed: { value: 0 },
    uAgeNorm: { value: 0 },
    uMotion: { value: 0 },
    uGlobalMotion: { value: 0 },
    uIntensity: { value: CONFIG.visual.shadowIntensity },
    uReveal: { value: 0 },
    uDisturb: { value: 0 },
    uDisturbActive: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: bodyVert,
    fragmentShader: noiseGlsl + '\n' + shadowFrag,
    uniforms,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(getUnitQuadGeometry(), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.visible = false;
  return { mesh, uniforms };
}

/**
 * Per-frame aging of one active shadow: drift, sink, recession and the
 * uniforms that drive blur/dissolve/breakup in the shader (spec §10, 11, 42).
 */
export function updateShadowVisual(
  slot: ShadowSlot,
  timeSec: number,
  now: number,
  globalMotion: number,
): void {
  const ageNorm = slot.ageNorm(now);
  // disturbance ages the memory permanently (matches shadow.frag)
  const effectiveAge = Math.min(1, ageNorm + slot.disturb * 0.35);
  const s = slot.seed * 100;

  const amp = 0.0015 + 0.009 * Math.pow(effectiveAge, 1.5);
  const dx = (Math.sin(timeSec * 0.21 + s * 1.3) * 0.6 + Math.sin(timeSec * 0.047 + s * 2.1)) * amp;
  const dy =
    (Math.cos(timeSec * 0.17 + s * 1.7) * 0.6 + Math.sin(timeSec * 0.061 + s * 0.9)) * amp * 0.8 -
    effectiveAge * effectiveAge * 0.006;

  const u = slot.body.uniforms;
  u.uTime.value = timeSec;
  u.uAgeNorm.value = ageNorm;
  u.uGlobalMotion.value = globalMotion;
  u.uReveal.value = slot.revealEnv;
  u.uDisturb.value = slot.disturb;
  u.uDisturbActive.value = slot.disturbActive;
  (u.uDrift.value as THREE.Vector2).set(dx, dy);
  u.uScale.value = 1 - 0.04 * effectiveAge * effectiveAge;
  slot.body.mesh.visible = slot.active && slot.revealEnv > 0.002;

  const pu = slot.motes.uniforms;
  pu.uTime.value = timeSec;
  pu.uAgeNorm.value = effectiveAge;
  (pu.uDrift.value as THREE.Vector2).set(dx, dy);
  slot.motes.points.visible =
    slot.active && slot.revealEnv > 0.1 && effectiveAge >= CONFIG.particles.minAgeNorm;
}
