/** 2D helpers on the ground plane (x, z). */
export type Vec2 = readonly [number, number];

export interface SegmentHit {
  /** Distance from the point to the closest point on the polyline. */
  dist: number;
  /** Arc length along the polyline at the closest point. */
  along: number;
  /** Closest point. */
  x: number;
  z: number;
  /** Index of the segment. */
  segment: number;
}

export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): { d: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return { d: Math.hypot(px - cx, pz - cz), t };
}

export function closestOnPolyline(px: number, pz: number, pts: readonly Vec2[]): SegmentHit {
  let best: SegmentHit = { dist: Infinity, along: 0, x: 0, z: 0, segment: 0 };
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const { d, t } = distToSegment(px, pz, a[0], a[1], b[0], b[1]);
    if (d < best.dist) {
      best = { dist: d, along: acc + t * segLen, x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, segment: i };
    }
    acc += segLen;
  }
  return best;
}

export function polylineLength(pts: readonly Vec2[]): number {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) len += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
  return len;
}

/** Point and unit tangent at arc length `s` along a polyline. */
export function samplePolyline(pts: readonly Vec2[], s: number): { x: number; z: number; tx: number; tz: number } {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + len >= s || i === pts.length - 2) {
      const t = len > 0 ? Math.min(1, Math.max(0, (s - acc) / len)) : 0;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / (len || 1), tz: (b[1] - a[1]) / (len || 1) };
    }
    acc += len;
  }
  const p = pts[0] ?? [0, 0];
  return { x: p[0], z: p[1], tx: 1, tz: 0 };
}

export function pointInPolygon(px: number, pz: number, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Signed-ish distance to an axis-aligned rectangle (negative inside). */
export function rectDistance(px: number, pz: number, cx: number, cz: number, hw: number, hd: number, rot = 0): number {
  const c = Math.cos(-rot);
  const s = Math.sin(-rot);
  const lx = (px - cx) * c - (pz - cz) * s;
  const lz = (px - cx) * s + (pz - cz) * c;
  const qx = Math.abs(lx) - hw;
  const qz = Math.abs(lz) - hd;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
  return outside + Math.min(Math.max(qx, qz), 0);
}
