import type { MaskFrame } from '../segmentation/MaskProcessor';

/**
 * Development-only stand-in for the camera + segmenter (?synthetic=1).
 * Produces an animated humanoid mask so the full visual pipeline can be
 * exercised and tuned without a webcam. Never active in exhibition mode.
 */
const W = 256;
const H = 144;
const ASPECT = W / H;

interface Pt {
  x: number;
  y: number;
}

function capsuleDist(px: number, py: number, a: Pt, b: Pt): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = px - a.x;
  const apy = py - a.y;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq > 0 ? (apx * abx + apy * aby) / lenSq : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  return Math.sqrt(dx * dx + dy * dy);
}

export class SyntheticMaskSource {
  private readonly data = new Float32Array(W * H);
  private readonly frame: MaskFrame = { data: this.data, width: W, height: H };
  private lastFrameAt = 0;
  onMask: ((frame: MaskFrame) => void) | null = null;

  /** colored figure matching the mask, standing in for the camera image */
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
  }

  private drawFigure(parts: { a: Pt; b: Pt; r: number; color: string }[], head: Pt, headR: number): void {
    const ctx = this.ctx;
    const px = (p: Pt) => ((p.x + (ASPECT - 1) / 2) / ASPECT) * W;
    const py = (p: Pt) => (1 - p.y) * H;
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
    for (const part of parts) {
      ctx.strokeStyle = part.color;
      ctx.lineWidth = part.r * 2 * H;
      ctx.beginPath();
      ctx.moveTo(px(part.a), py(part.a));
      ctx.lineTo(px(part.b), py(part.b));
      ctx.stroke();
    }
    ctx.fillStyle = '#d9a67c';
    ctx.beginPath();
    ctx.arc(px(head), py(head), headR * H, 0, Math.PI * 2);
    ctx.fill();
  }

  update(now: number): void {
    if (now - this.lastFrameAt < 33) return;
    this.lastFrameAt = now;

    const t = now / 1000;
    const cycle = t % 75;
    // present for 55s, absent for 20s (exercises entry, exit and decay states)
    const present = cycle < 55;

    if (!present) {
      this.data.fill(0);
      this.ctx.fillStyle = '#0a0a0c';
      this.ctx.fillRect(0, 0, W, H);
      this.onMask?.(this.frame);
      return;
    }

    // visitor-like behaviour: walk to a spot, stand, move on (spec §70)
    const seg = 6.5;
    const k = Math.floor(cycle / seg);
    const frac = (cycle - k * seg) / seg;
    const wpAt = (i: number) => 0.5 + 0.34 * Math.sin(i * 2.399) + 0.08 * Math.sin(i * 5.113);
    const move = Math.min(1, frac * 2.2);
    const ease = move * move * (3 - 2 * move);
    const cx = wpAt(k) + (wpAt(k + 1) - wpAt(k)) * ease;
    const entry = Math.min(1, cycle / 1.5);
    const walkSpeed = frac < 0.46 ? Math.abs(wpAt(k + 1) - wpAt(k)) / (seg * 0.46) : 0;
    const wp = t * 6 * Math.min(1, walkSpeed * 30);
    const bob = 0.006 * Math.sin(wp * 2);

    const groundY = 0.10;
    const hipY = 0.42 + bob;
    const shoulderY = 0.66 + bob;
    const headY = 0.78 + bob;

    const armSwing = 0.05 * Math.sin(wp);
    const waving = Math.sin(t * 0.19) > 0.55;
    const waveY = waving ? 0.80 + 0.03 * Math.sin(t * 4.5) : hipY - 0.02;
    const waveX = waving ? 0.13 + 0.03 * Math.sin(t * 3.7) : 0.10 + armSwing;

    const shoulderL: Pt = { x: cx - 0.055, y: shoulderY };
    const shoulderR: Pt = { x: cx + 0.055, y: shoulderY };
    const handL: Pt = { x: cx - 0.10 - armSwing, y: hipY - 0.02 };
    const handR: Pt = { x: cx + waveX, y: waveY };

    const hipL: Pt = { x: cx - 0.035, y: hipY };
    const hipR: Pt = { x: cx + 0.035, y: hipY };
    const footL: Pt = { x: cx - 0.035 - 0.05 * Math.sin(wp), y: groundY };
    const footR: Pt = { x: cx + 0.035 + 0.05 * Math.sin(wp), y: groundY };

    const torsoA: Pt = { x: cx, y: hipY };
    const torsoB: Pt = { x: cx, y: shoulderY };

    this.drawFigure(
      [
        { a: hipL, b: footL, r: 0.033, color: '#33405c' },
        { a: hipR, b: footR, r: 0.033, color: '#33405c' },
        { a: shoulderL, b: handL, r: 0.026, color: '#8a4a3a' },
        { a: shoulderR, b: handR, r: 0.026, color: '#8a4a3a' },
        { a: torsoA, b: torsoB, r: 0.085, color: '#7c4436' },
      ],
      { x: cx, y: headY },
      0.052,
    );

    const sharp = 160;
    for (let row = 0; row < H; row++) {
      // camera convention: row 0 = image top
      const y = 1 - (row + 0.5) / H;
      for (let col = 0; col < W; col++) {
        const x = ((col + 0.5) / W) * ASPECT - (ASPECT - 1) / 2;
        let d = capsuleDist(x, y, torsoA, torsoB) - 0.085;
        const dHead = Math.hypot(x - cx, (y - headY) * 1.15) - 0.052;
        if (dHead < d) d = dHead;
        const dArmL = capsuleDist(x, y, shoulderL, handL) - 0.026;
        if (dArmL < d) d = dArmL;
        const dArmR = capsuleDist(x, y, shoulderR, handR) - 0.026;
        if (dArmR < d) d = dArmR;
        const dLegL = capsuleDist(x, y, hipL, footL) - 0.033;
        if (dLegL < d) d = dLegL;
        const dLegR = capsuleDist(x, y, hipR, footR) - 0.033;
        if (dLegR < d) d = dLegR;

        let v = 0.5 - d * sharp;
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        this.data[row * W + col] = v * entry;
      }
    }
    this.onMask?.(this.frame);
  }
}
