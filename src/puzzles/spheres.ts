/**
 * Eudoxus' homocentric spheres (Aristotle, Metaphysics Λ.8 1073b; Simplicius on De Caelo) as pure logic,
 * following the standard modern reconstruction (Schiaparelli; Yavetz).
 *
 * For a planet: sphere 1 turns daily (ignored here: we look at the planet against the stars); sphere 2
 * carries it along the zodiac once per zodiacal period; spheres 3 and 4 turn in opposite directions at
 * the same speed (once per synodic period) about axes inclined to each other by an angle i. Together 3 and 4
 * trace a figure-eight, the hippopede, centred on the ecliptic. Added to the steady zodiacal motion, the
 * hippopede makes the planet slow down, stop, go backwards (retrograde) and go forward again.
 *
 * Output: ecliptic longitude and latitude (degrees) over time, and a detector for retrograde loops.
 */
export interface SphereParams {
  /** Inclination between the axes of spheres 3 and 4, degrees. */
  inclination: number;
  /** Synodic period (days): spheres 3 and 4. */
  synodic: number;
  /** Zodiacal (sidereal) period (days): sphere 2. */
  zodiacal: number;
}

type V3 = [number, number, number];

function rotX(v: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}
function rotY(v: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

/**
 * Position of the planet at time t (days): [longitude, latitude] in degrees, relative to the ecliptic.
 * Frame: the ecliptic is the xy-plane (z = its pole). Sphere 3's axis lies IN the ecliptic (y), 90° from the
 * hippopede's centre (x). Result: longitude swings once per synodic period (amplitude about i), latitude twice
 * (amplitude (1 − cos i) / 2): the figure-eight.
 */
export function planetAt(p: SphereParams, t: number): [number, number] {
  const w = (2 * Math.PI * t) / p.synodic;
  const i = (p.inclination * Math.PI) / 180;
  // The planet sits on sphere 4's equator. Sphere 4 turns by -w about its own axis, which is tilted by i
  // from sphere 3's axis; sphere 3 turns by +w about its axis (y, in the ecliptic).
  let v: V3 = [1, 0, 0];
  v = rotY(v, -w); // sphere 4's own turn (its axis is its local y)
  v = rotX(v, i); // tilt of sphere 4's axis against sphere 3's
  v = rotY(v, w); // sphere 3's turn
  const lon = Math.atan2(v[1], v[0]);
  const lat = Math.asin(Math.max(-1, Math.min(1, v[2])));
  const zod = (360 * t) / p.zodiacal;
  return [zod + (lon * 180) / Math.PI, (lat * 180) / Math.PI];
}

export function path(p: SphereParams, days: number, step = 2): [number, number][] {
  const out: [number, number][] = [];
  for (let t = 0; t <= days; t += step) out.push(planetAt(p, t));
  return out;
}

export interface LoopInfo {
  /** Number of retrograde arcs in the span. */
  loops: number;
  /** Mean arc length of a retrograde arc in longitude (degrees). */
  arc: number;
  /** Mean duration of a retrograde arc (days). */
  duration: number;
}

/** Find retrograde arcs (longitude decreasing). */
export function retrogrades(p: SphereParams, days: number, step = 1): LoopInfo {
  let loops = 0;
  let arcSum = 0;
  let durSum = 0;
  let start: { t: number; lon: number } | null = null;
  let prev = planetAt(p, 0)[0];
  for (let t = step; t <= days; t += step) {
    const lon = planetAt(p, t)[0];
    const back = lon < prev;
    if (back && !start) start = { t, lon: prev };
    if (!back && start) {
      loops++;
      arcSum += start.lon - prev;
      durSum += t - start.t;
      start = null;
    }
    prev = lon;
  }
  return { loops, arc: loops ? arcSum / loops : 0, duration: loops ? durSum / loops : 0 };
}

/** Mismatch between a model and an observed target (0 = perfect). */
export function mismatch(p: SphereParams, target: LoopInfo, days: number): number {
  const r = retrogrades(p, days);
  if (r.loops === 0) return Infinity;
  return Math.abs(r.arc - target.arc) / Math.max(1, target.arc) + Math.abs(r.duration - target.duration) / Math.max(1, target.duration) + Math.abs(r.loops - target.loops);
}
