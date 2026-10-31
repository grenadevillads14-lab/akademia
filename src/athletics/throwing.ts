/**
 * Discus and javelin (design §6 athletics) as pure logic. The throw has three timed inputs:
 * aim (heading), angle (an oscillating meter) and power (another meter, released at the right moment).
 * The implement then flies under gravity, quadratic drag and the wind; the mark is the distance from the
 * balbis (throwing stand) along the aim line. A throw that lands outside the sector is a foul.
 *
 * Numbers: Phayllos of Croton's legendary discus throw is given as 95 feet (about 28 m; epigram in the
 * Palatine Anthology). Javelins were thrown with a leather thong (ankyle) that spun and lengthened the throw.
 */
export type Implement = 'discus' | 'javelin';

export interface ImplementSpec {
  /** Release speed at full power (m/s). */
  vMax: number;
  /** Drag coefficient term k in a = -k |v| v (1/m). */
  drag: number;
  /** How strongly wind (m/s) pushes the implement, 0..1. */
  windCoupling: number;
  releaseHeight: number;
  /** Best release angle in degrees (for hints and the meter's sweet spot). */
  bestAngle: number;
  /** Half-width of the legal sector, degrees. */
  sector: number;
}

export const IMPLEMENTS: Record<Implement, ImplementSpec> = {
  discus: { vMax: 18.5, drag: 0.004, windCoupling: 0.35, releaseHeight: 1.5, bestAngle: 38, sector: 24 },
  javelin: { vMax: 23, drag: 0.0045, windCoupling: 0.2, releaseHeight: 1.8, bestAngle: 36, sector: 18 },
};

/** Triangle-wave meter in 0..1 with the given period (s). */
export function meter(t: number, period: number): number {
  const u = (((t / period) % 1) + 1) % 1;
  return u < 0.5 ? u * 2 : 2 - u * 2;
}

export interface ThrowInput {
  /** Aim heading in radians relative to the field's forward direction. */
  aim: number;
  /** Release angle above horizontal, degrees. */
  angle: number;
  /** 0..1 power. */
  power: number;
  /** Footwork timing error 0..1 (0 = perfect), shaves speed. */
  timing: number;
}

export interface ThrowResult {
  /** Flight path in field coordinates: x = sideways, y = up, z = forward. */
  path: [number, number, number][];
  landing: [number, number];
  /** Measured mark (m) along the forward axis. */
  distance: number;
  foul: boolean;
  flightTime: number;
}

/**
 * Fly the implement. `wind` is [sideways, forward] in m/s in field coordinates.
 */
export function simulateThrow(kind: Implement, input: ThrowInput, wind: [number, number] = [0, 0], dt = 1 / 120): ThrowResult {
  const spec = IMPLEMENTS[kind];
  const speed = spec.vMax * Math.max(0, Math.min(1, input.power)) * (1 - 0.35 * Math.min(1, Math.max(0, input.timing)) ** 2);
  const a = (input.angle * Math.PI) / 180;
  let vx = Math.sin(input.aim) * Math.cos(a) * speed;
  let vz = Math.cos(input.aim) * Math.cos(a) * speed;
  let vy = Math.sin(a) * speed;
  let x = 0;
  let y = spec.releaseHeight;
  let z = 0;
  const path: [number, number, number][] = [[x, y, z]];
  let t = 0;
  while (y > 0 && t < 20) {
    // Air velocity relative to the implement (wind couples only partly).
    const rx = vx - wind[0] * spec.windCoupling;
    const rz = vz - wind[1] * spec.windCoupling;
    const v = Math.hypot(rx, vy, rz);
    vx += -spec.drag * v * rx * dt;
    vy += (-9.81 - spec.drag * v * vy) * dt;
    vz += -spec.drag * v * rz * dt;
    const py = y;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    t += dt;
    if (y <= 0) {
      // Interpolate to the ground.
      const u = py / (py - y);
      x -= vx * dt * (1 - u);
      z -= vz * dt * (1 - u);
      y = 0;
    }
    if (path.length < 2000 && (path.length % 2 === 0 || y === 0)) path.push([x, y, z]);
    else if (path.length >= 2000 && y === 0) path.push([x, y, z]);
  }
  const off = (Math.abs(Math.atan2(x, z)) * 180) / Math.PI;
  const foul = z <= 0 || off > spec.sector;
  return { path, landing: [x, z], distance: foul ? 0 : Math.hypot(x, z), foul, flightTime: t };
}
