import { CONFIG } from '../config/constants';

/**
 * motionEnergy 0..1 from inter-frame mask difference (spec §38).
 * Fast attack, slow release, so a wave of the hand lingers briefly.
 */
export class MotionAnalyzer {
  energy = 0;
  private lastUpdate = 0;

  update(motionRaw: number, now: number): void {
    const dt = this.lastUpdate === 0 ? 1 / 30 : Math.min(0.2, (now - this.lastUpdate) / 1000);
    this.lastUpdate = now;

    const target = Math.min(1, motionRaw * CONFIG.motion.gain);
    const tau = target > this.energy ? CONFIG.motion.attack : CONFIG.motion.release;
    this.energy += (target - this.energy) * Math.min(1, dt / tau);
  }
}
