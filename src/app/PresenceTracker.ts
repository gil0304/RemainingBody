import { CONFIG } from '../config/constants';

/**
 * Hysteresis presence detection + the slow envelope that lets the body
 * surface from darkness on entry and sink back on exit (spec §4, 33, 34).
 */
export class PresenceTracker {
  present = false;
  /** 0..1 appearance envelope for the current body */
  env = 0;
  private lastAboveExit = 0;

  update(coverage: number, now: number, dt: number): void {
    if (coverage >= CONFIG.presence.enterCoverage) {
      this.present = true;
      this.lastAboveExit = now;
    } else if (this.present && coverage >= CONFIG.presence.exitCoverage) {
      this.lastAboveExit = now;
    }
    if (this.present && now - this.lastAboveExit > CONFIG.presence.exitDelayMs) {
      this.present = false;
    }

    const rate = this.present
      ? dt / CONFIG.presence.appearSeconds
      : -dt / CONFIG.presence.disappearSeconds;
    this.env = Math.min(1, Math.max(0, this.env + rate));
  }
}
