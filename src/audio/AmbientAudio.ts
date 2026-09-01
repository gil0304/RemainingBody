/**
 * Optional, extremely minimal ambience (?audio=1; spec §35, 36). No BGM —
 * only a low air drone whose character shifts very slowly as shadows
 * accumulate. Starts on the first user gesture (browser autoplay policy).
 */
export class AmbientAudio {
  private ctx: AudioContext | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private airGain: GainNode | null = null;
  private started = false;
  private lastSwellAt = 0;
  private swellUntil = 0;
  private lastBucket = 0;
  private readonly gestureHandler = () => this.startGraph();

  constructor() {
    window.addEventListener('pointerdown', this.gestureHandler);
    window.addEventListener('keydown', this.gestureHandler);
  }

  private startGraph(): void {
    if (this.started) return;
    this.started = true;
    window.removeEventListener('pointerdown', this.gestureHandler);
    window.removeEventListener('keydown', this.gestureHandler);

    const ctx = new AudioContext();
    this.ctx = ctx;

    // 4s brown-noise loop
    const len = 4 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }

    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    // low air drone
    const droneSrc = ctx.createBufferSource();
    droneSrc.buffer = buffer;
    droneSrc.loop = true;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 80;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    droneGain.gain.setTargetAtTime(0.05, ctx.currentTime, 6);
    droneSrc.connect(this.droneFilter).connect(droneGain).connect(master);
    droneSrc.start();

    // distant wind
    const airSrc = ctx.createBufferSource();
    airSrc.buffer = buffer;
    airSrc.loop = true;
    airSrc.playbackRate.value = 1.31;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 1400;
    airFilter.Q.value = 0.6;
    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0;
    airSrc.connect(airFilter).connect(this.airGain).connect(master);
    airSrc.start();
  }

  update(shadowCount: number, presenceEnv: number, now: number): void {
    if (!this.ctx || !this.droneFilter || !this.airGain) return;
    const t = this.ctx.currentTime;

    const density = Math.min(1, shadowCount / 50);
    this.droneFilter.frequency.setTargetAtTime(80 + 70 * density, t, 4);
    // while a swell is playing, leave the air gain to its scheduled curve
    if (now >= this.swellUntil) {
      this.airGain.gain.setTargetAtTime(0.0015 + 0.004 * presenceEnv + 0.003 * density, t, 5);
    }

    // one very slow swell when accumulation crosses a threshold (spec §36:
    // never a sound per snapshot)
    const bucket = shadowCount >= 40 ? 3 : shadowCount >= 20 ? 2 : shadowCount >= 8 ? 1 : 0;
    if (bucket > this.lastBucket && now - this.lastSwellAt > 20_000) {
      this.lastSwellAt = now;
      this.swellUntil = now + 16_000;
      const g = this.airGain.gain;
      g.setTargetAtTime(0.014, t, 3);
      g.setTargetAtTime(0.004, t + 5, 6);
    }
    this.lastBucket = bucket;
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.gestureHandler);
    window.removeEventListener('keydown', this.gestureHandler);
    this.ctx?.close();
    this.ctx = null;
  }
}
