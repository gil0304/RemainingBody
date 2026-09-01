import * as THREE from 'three';
import { getUnitQuadGeometry } from './FullscreenPass';
import bodyVert from '../shaders/body.vert?raw';
import noiseGlsl from '../shaders/noise.glsl?raw';
import ghostFrag from '../shaders/ghost.frag?raw';
import { CONFIG } from '../config/constants';
import type { MaskHistory } from '../shadow/MaskHistory';

interface GhostTap {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  uniforms: Record<string, THREE.IUniform>;
  delayMs: number;
}

/**
 * The moving past: delayed replays of the viewer's own motion. Each tap is a
 * fullscreen quad reading the mask history atlas at a fixed delay. Draws
 * between the frozen shadows and the present body, so the present occludes it.
 */
export class GhostRenderer {
  private readonly taps: GhostTap[] = [];

  constructor(scene: THREE.Scene) {
    const { size, tileW, tileH } = CONFIG.ghosts.atlas;
    CONFIG.ghosts.taps.forEach((tap, i) => {
      const uniforms: Record<string, THREE.IUniform> = {
        uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
        uDrift: { value: new THREE.Vector2(0, 0) },
        uScale: { value: 1 },
        uAtlas: { value: null },
        uTileScale: { value: new THREE.Vector2(tileW / size, tileH / size) },
        uTileA: { value: new THREE.Vector2(0, 0) },
        uTileB: { value: new THREE.Vector2(0, 0) },
        uMix: { value: 0 },
        uInset: { value: new THREE.Vector2(0.5 / tileW, 0.5 / tileH) },
        uTime: { value: 0 },
        uSeed: { value: i * 7.31 + 2.1 },
        uIntensity: { value: tap.intensity },
        uDistort: { value: tap.distort },
      };
      const material = new THREE.ShaderMaterial({
        vertexShader: bodyVert,
        fragmentShader: noiseGlsl + '\n' + ghostFrag,
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
      mesh.renderOrder = 2;
      mesh.visible = false;
      scene.add(mesh);
      this.taps.push({ mesh, material, uniforms, delayMs: tap.delayMs });
    });
  }

  get activeCount(): number {
    let n = 0;
    for (const t of this.taps) if (t.mesh.visible) n++;
    return n;
  }

  update(history: MaskHistory | null, now: number, timeSec: number): void {
    for (const tap of this.taps) {
      const s = history ? history.sample(now, tap.delayMs) : null;
      if (!s) {
        tap.mesh.visible = false;
        continue;
      }
      tap.mesh.visible = true;
      const u = tap.uniforms;
      u.uAtlas.value = history!.texture;
      (u.uTileA.value as THREE.Vector2).set(s.ax, s.ay);
      (u.uTileB.value as THREE.Vector2).set(s.bx, s.by);
      u.uMix.value = s.mix;
      u.uTime.value = timeSec;
    }
  }

  dispose(): void {
    for (const tap of this.taps) tap.material.dispose();
  }
}
