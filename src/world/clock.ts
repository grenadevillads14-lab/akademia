/**
 * World time. One in-game day lasts `dayLengthSec` real seconds (24 minutes by default).
 * Time of day is in hours [0, 24). Seasons follow story chapters, but the sun's path uses the
 * day of year so that summer noons are high and winter noons low, as they are at Athens (38° N).
 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const ATHENS_LATITUDE_DEG = 37.98;

/** Representative day-of-year for each season (equinox / solstice-ish). */
const SEASON_DAY: Record<Season, number> = { spring: 100, summer: 180, autumn: 280, winter: 355 };

export class WorldClock {
  hours: number;
  day = 0;
  season: Season;
  /** Real seconds per in-game day. */
  dayLengthSec: number;
  paused = false;
  /** Multiplier for debugging (e.g. watch a whole day in a minute). */
  timeScale = 1;

  constructor(opts: { hours?: number; season?: Season; dayLengthSec?: number } = {}) {
    this.hours = opts.hours ?? 17.5;
    this.season = opts.season ?? 'spring';
    this.dayLengthSec = opts.dayLengthSec ?? 24 * 60;
  }

  update(dtSec: number): void {
    if (this.paused) return;
    this.hours += (dtSec * this.timeScale * 24) / this.dayLengthSec;
    while (this.hours >= 24) {
      this.hours -= 24;
      this.day++;
    }
    while (this.hours < 0) this.hours += 24;
  }

  get dayOfYear(): number {
    return SEASON_DAY[this.season];
  }

  /** Human-readable part of day, used by NPC schedules and ambience. */
  get period(): 'night' | 'dawn' | 'morning' | 'midday' | 'afternoon' | 'dusk' | 'evening' {
    return periodOf(this.hours);
  }
}

export function periodOf(h: number): 'night' | 'dawn' | 'morning' | 'midday' | 'afternoon' | 'dusk' | 'evening' {
  if (h < 5) return 'night';
  if (h < 7) return 'dawn';
  if (h < 11) return 'morning';
  if (h < 14) return 'midday';
  if (h < 18) return 'afternoon';
  if (h < 20) return 'dusk';
  if (h < 22) return 'evening';
  return 'night';
}

/**
 * Sun direction (unit vector pointing *toward* the sun) in world space: +x east, -z north, +y up.
 * Standard solar-position approximation; good to a degree or two, which is all a game needs.
 */
export function sunDirection(hours: number, dayOfYear: number, latitudeDeg = ATHENS_LATITUDE_DEG): [number, number, number] {
  const decl = (-23.44 * Math.PI) / 180 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const lat = (latitudeDeg * Math.PI) / 180;
  const hourAngle = ((hours - 12) / 24) * 2 * Math.PI;
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  const el = Math.asin(sinEl);
  // Azimuth measured from north, clockwise (east = +90°).
  const cosAz = (Math.sin(decl) - Math.sin(el) * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat) || 1e-6);
  let az = Math.acos(Math.min(1, Math.max(-1, cosAz)));
  if (hourAngle > 0) az = 2 * Math.PI - az;
  const horiz = Math.cos(el);
  return [Math.sin(az) * horiz, Math.sin(el), -Math.cos(az) * horiz];
}

/** Moon roughly opposite the sun, offset so it isn't a mirror image. */
export function moonDirection(hours: number, dayOfYear: number): [number, number, number] {
  const [x, y, z] = sunDirection((hours + 12.8) % 24, dayOfYear + 15);
  return [x, y, z];
}

export function elevationDeg(dir: readonly [number, number, number]): number {
  return (Math.asin(Math.max(-1, Math.min(1, dir[1]))) * 180) / Math.PI;
}

export function formatTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
