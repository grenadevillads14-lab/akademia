/**
 * Checkpoint races (design §6 athletics) as pure logic: the stadion and diaulos on the dromos, and the
 * Promethia torch race from the altar of Prometheus to the city (Pausanias 1.30.2: the runners carry lit
 * torches; whoever's torch goes out has lost, and the victory passes to the next).
 *
 * Rivals are "ghosts" with a fixed finishing time and pacing curve, so a race is deterministic for a seed.
 */
export type Vec2 = readonly [number, number];

export interface Rival {
  id: string;
  /** Finishing time in seconds if nothing goes wrong. */
  time: number;
  /** Pacing exponent: < 1 starts fast and fades, > 1 starts slow and finishes strong. */
  pace: number;
  /** Torch races: the moment (s) the rival's torch goes out, if it does. */
  outAt?: number;
}

export interface RaceDef {
  id: string;
  /** The course: the runner must pass within `radius` of each point in order. */
  course: Vec2[];
  radius: number;
  rivals: Rival[];
  /** Torch race rules (flame simulation). */
  torch?: boolean;
  countdown: number;
}

export interface TorchParams {
  /** Flame change per second at rest (recovers). */
  recover: number;
  /** Extra drain per second per m/s above `safeSpeed`. */
  drainPerSpeed: number;
  safeSpeed: number;
  /** Gust drain multiplier (wind strength 0..1 scales the drain). */
  windDrain: number;
}

export const TORCH: TorchParams = { recover: 0.06, drainPerSpeed: 0.055, safeSpeed: 4.2, windDrain: 0.004 };

export interface RaceState {
  phase: 'countdown' | 'running' | 'finished' | 'failed';
  t: number;
  /** Index of the next checkpoint to reach. */
  next: number;
  splits: number[];
  flame: number;
  /** Final placing (1 = winner) once finished. */
  place?: number;
  reason?: 'torch_out';
}

export function startRace(def: RaceDef): RaceState {
  return { phase: 'countdown', t: -def.countdown, next: 0, splits: [], flame: 1 };
}

/** Length of the course (from the first checkpoint). */
export function courseLength(course: readonly Vec2[]): number {
  let L = 0;
  for (let i = 1; i < course.length; i++) L += Math.hypot(course[i]![0] - course[i - 1]![0], course[i]![1] - course[i - 1]![1]);
  return L;
}

/** Point at distance d along the course. */
export function pointAt(course: readonly Vec2[], d: number): { x: number; z: number; heading: number } {
  let left = Math.max(0, d);
  for (let i = 1; i < course.length; i++) {
    const a = course[i - 1]!;
    const b = course[i]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= seg || i === course.length - 1) {
      const u = seg > 0 ? Math.min(1, left / seg) : 0;
      return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
    }
    left -= seg;
  }
  const p = course[course.length - 1]!;
  return { x: p[0], z: p[1], heading: 0 };
}

/** Fraction of the course a rival has covered at time t (0..1), following its pacing curve. */
export function rivalProgress(r: Rival, t: number): number {
  if (t <= 0) return 0;
  const stopped = r.outAt !== undefined && t >= r.outAt ? r.outAt : t;
  return Math.min(1, Math.pow(stopped / r.time, r.pace));
}

export function rivalOut(r: Rival, t: number): boolean {
  return r.outAt !== undefined && t >= r.outAt;
}

/**
 * Advance the race. `pos` is the player position, `speed` horizontal speed (m/s), `wind` 0..1.
 * Returns the events that happened this step.
 */
export function stepRace(def: RaceDef, st: RaceState, dt: number, pos: Vec2, speed: number, wind = 0, params: TorchParams = TORCH): { state: RaceState; events: ('go' | 'checkpoint' | 'finish' | 'torch_out')[] } {
  const events: ('go' | 'checkpoint' | 'finish' | 'torch_out')[] = [];
  if (st.phase === 'finished' || st.phase === 'failed') return { state: st, events };
  const s: RaceState = { ...st, splits: [...st.splits] };
  s.t += dt;
  if (s.phase === 'countdown') {
    if (s.t < 0) return { state: s, events };
    s.phase = 'running';
    events.push('go');
  }
  if (def.torch) {
    // Fast running fans the flame out; the wind matters more the faster you go. A steady jog lets it recover slowly.
    const drain = Math.max(0, speed - params.safeSpeed) * params.drainPerSpeed + wind * params.windDrain * (1 + speed);
    const recover = speed < params.safeSpeed ? params.recover * (1 - speed / (params.safeSpeed * 1.4)) : 0;
    s.flame = Math.min(1, s.flame + (recover - drain) * dt);
    if (s.flame <= 0) {
      s.flame = 0;
      s.phase = 'failed';
      s.reason = 'torch_out';
      events.push('torch_out');
      return { state: s, events };
    }
  }
  const cp = def.course[s.next];
  if (cp && Math.hypot(pos[0] - cp[0], pos[1] - cp[1]) <= def.radius) {
    s.splits.push(s.t);
    s.next++;
    events.push('checkpoint');
    if (s.next >= def.course.length) {
      s.phase = 'finished';
      s.place = 1 + def.rivals.filter((r) => !rivalOut(r, r.time) && r.time < s.t).length;
      events.push('finish');
    }
  }
  return { state: s, events };
}

/** Rivals that finished ahead of the player (or all live rivals, if the player failed). */
export function standings(def: RaceDef, st: RaceState): { id: string; time: number | null }[] {
  const rows: { id: string; time: number | null }[] = def.rivals.map((r) => ({ id: r.id, time: rivalOut(r, r.time) ? null : r.time }));
  if (st.phase === 'finished') rows.push({ id: 'player', time: st.t });
  else rows.push({ id: 'player', time: null });
  return rows.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
}
