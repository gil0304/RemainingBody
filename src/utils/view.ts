/** Screen/camera UV mapping helpers (cover fit + mirrored bbox transform). */

export interface CoverScale {
  x: number;
  y: number;
}

export interface RectUV {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BBoxUV {
  minU: number;
  minV: number;
  maxU: number;
  maxV: number;
}

/**
 * Scale applied to (screenUV - 0.5) to get camera UV under cover fit:
 * camUV = 0.5 + (screenUV - 0.5) * scale.
 */
export function computeCoverScale(screenAspect: number, camAspect: number): CoverScale {
  if (camAspect > screenAspect) return { x: screenAspect / camAspect, y: 1 };
  return { x: 1, y: camAspect / screenAspect };
}

/**
 * Convert a bbox in screen-oriented camera UV (already mirrored, y-up) into a
 * padded, clamped screen-UV rect. Returns null if it falls outside the screen.
 */
export function camBBoxToScreenRect(bbox: BBoxUV, cover: CoverScale, pad: number): RectUV | null {
  const x0 = 0.5 + (bbox.minU - 0.5) / cover.x - pad;
  const x1 = 0.5 + (bbox.maxU - 0.5) / cover.x + pad;
  const y0 = 0.5 + (bbox.minV - 0.5) / cover.y - pad;
  const y1 = 0.5 + (bbox.maxV - 0.5) / cover.y + pad;

  const cx0 = Math.max(0, Math.min(1, x0));
  const cx1 = Math.max(0, Math.min(1, x1));
  const cy0 = Math.max(0, Math.min(1, y0));
  const cy1 = Math.max(0, Math.min(1, y1));

  if (cx1 - cx0 < 0.005 || cy1 - cy0 < 0.005) return null;
  return { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 };
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Fraction of rect b covered by the intersection with rect a (0..1). */
export function rectOverlapFrac(a: RectUV, b: RectUV): number {
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ix <= 0 || iy <= 0) return 0;
  const areaB = b.w * b.h;
  return areaB > 0 ? (ix * iy) / areaB : 0;
}
