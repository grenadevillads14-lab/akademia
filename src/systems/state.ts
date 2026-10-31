import { EventBus } from '../core/events';

/**
 * The whole persistent game state: plain JSON, so saving is just serialising it.
 * Everything else (dialogue tags, quest rewards, puzzles) changes it through `runCommand`, a tiny
 * command language that content files can use: e.g. "xp logos 10", "idea forms", "rep aristotle 1".
 */
export const DISCIPLINES = ['logos', 'mathesis', 'gymnastike', 'mousike'] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export interface QuestProgress {
  state: 'active' | 'done' | 'failed';
  step: string;
  completed: string[];
}

export interface GameStateData {
  version: 1;
  player: { name: string; homeCity: 'athens' | 'thebes' | 'syracuse' | 'miletus'; appearance: Record<string, unknown> | null };
  flags: Record<string, boolean | number | string>;
  reputation: Record<string, number>;
  ideas: string[];
  inventory: Record<string, number>;
  xp: Record<Discipline, number>;
  skills: string[];
  quests: Record<string, QuestProgress>;
  discovered: { herms: string[]; zones: string[]; codex: string[]; collectibles: Record<string, string[]>; fog: string };
  clock: { hours: number; day: number; season: 'spring' | 'summer' | 'autumn' | 'winter'; chapter: string };
  position: { world: string; x: number; z: number; heading: number } | null;
  ink: Record<string, string>;
  journal: { day: number; text: string }[];
  playSeconds: number;
}

export function newGameState(): GameStateData {
  return {
    version: 1,
    player: { name: 'Lysis', homeCity: 'athens', appearance: null },
    flags: {},
    reputation: {},
    ideas: [],
    inventory: {},
    xp: { logos: 0, mathesis: 0, gymnastike: 0, mousike: 0 },
    skills: [],
    quests: {},
    discovered: { herms: [], zones: [], codex: [], collectibles: {}, fog: '' },
    clock: { hours: 17.6, day: 0, season: 'spring', chapter: 'prologue' },
    position: null,
    ink: {},
    journal: [],
    playSeconds: 0,
  };
}

export const FOG_N = 64;

/** XP needed for each discipline level (level 1 at 0 XP). */
export const LEVEL_XP = [0, 60, 160, 320, 560, 900, 1350, 1950];
export function levelOf(xp: number): number {
  let lvl = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]!) lvl = i + 1;
  return lvl;
}

export interface StateEvents {
  'state:flag': { key: string; value: boolean | number | string };
  'state:xp': { discipline: Discipline; amount: number; total: number; levelUp: boolean };
  'state:rep': { who: string; delta: number; total: number };
  'state:idea': { idea: string };
  'state:item': { item: string; delta: number; total: number };
  'state:quest': { quest: string; event: 'start' | 'step' | 'complete' | 'fail'; step?: string };
  'state:codex': { entry: string };
  'state:collect': { set: string; id: string; count: number };
  'state:herm': { id: string };
  'state:toast': { text: string };
  'state:command': { command: string };
  'state:puzzle': { id: string; arg?: string };
  'state:time': { hours: number; nextDay: boolean };
  'state:athletics': { kind: string; id: string };
  'state:season': { season: 'spring' | 'summer' | 'autumn' | 'winter' };
  'state:cave': { action: string };
  'state:lesbos': { action: string };
}

export class GameState {
  readonly bus = new EventBus<StateEvents>();
  data: GameStateData;

  constructor(data: GameStateData = newGameState()) {
    this.data = data;
  }

  flag(key: string): boolean | number | string | undefined {
    return this.data.flags[key];
  }
  hasIdea(id: string): boolean {
    return this.data.ideas.includes(id);
  }
  level(d: Discipline): number {
    return levelOf(this.data.xp[d]);
  }
  rep(who: string): number {
    return this.data.reputation[who] ?? 0;
  }
  items(id: string): number {
    return this.data.inventory[id] ?? 0;
  }
  quest(id: string): QuestProgress | undefined {
    return this.data.quests[id];
  }

  /**
   * Run one command. Grammar (space-separated):
   *   flag <key> [value]          set a flag (default true)
   *   xp <discipline> <amount>
   *   rep <who> <delta>
   *   idea <id>
   *   item <id> [delta]
   *   quest start|step|complete|fail <id> [step]
   *   codex <entry>
   *   collect <set> <id>
   *   herm <id>
   *   toast <text…>
   *   time <hours> [next]        set the clock (next = the following day), e.g. after a night passes
   *   season spring|summer|autumn|winter
   *   lesbos enter               the Lesbos lagoon interlude (Act 4, if the player goes with Aristotle)
   *   cave enter                 start the Allegory of the Cave interlude
   *   athletics race|throw|wrestle <id>  start an athletic event (content/athletics/events.json)
   *   puzzle <id> [arg]          open a puzzle (meno, waterworks, debate <id>); the game applies its rewards
   * Unknown commands throw (content bugs should be loud in tests).
   */
  runCommand(command: string): void {
    const parts = command.trim().split(/\s+/);
    const [op, a, b, ...rest] = parts;
    const d = this.data;
    switch (op) {
      case 'flag': {
        const value: boolean | number | string = b === undefined ? true : b === 'false' ? false : b === 'true' ? true : Number.isFinite(Number(b)) ? Number(b) : b;
        d.flags[a!] = value;
        this.bus.emit('state:flag', { key: a!, value });
        break;
      }
      case 'xp': {
        if (!(DISCIPLINES as readonly string[]).includes(a!)) throw new Error(`Unknown discipline "${a}" in "${command}"`);
        const disc = a as Discipline;
        const before = levelOf(d.xp[disc]);
        d.xp[disc] += Number(b);
        this.bus.emit('state:xp', { discipline: disc, amount: Number(b), total: d.xp[disc], levelUp: levelOf(d.xp[disc]) > before });
        break;
      }
      case 'rep': {
        d.reputation[a!] = (d.reputation[a!] ?? 0) + Number(b);
        this.bus.emit('state:rep', { who: a!, delta: Number(b), total: d.reputation[a!]! });
        break;
      }
      case 'idea': {
        if (!d.ideas.includes(a!)) {
          d.ideas.push(a!);
          this.bus.emit('state:idea', { idea: a! });
        }
        break;
      }
      case 'item': {
        const delta = b === undefined ? 1 : Number(b);
        d.inventory[a!] = Math.max(0, (d.inventory[a!] ?? 0) + delta);
        if (d.inventory[a!] === 0) delete d.inventory[a!];
        this.bus.emit('state:item', { item: a!, delta, total: d.inventory[a!] ?? 0 });
        break;
      }
      case 'quest': {
        const id = b!;
        const ev = a as 'start' | 'step' | 'complete' | 'fail';
        const q = d.quests[id];
        if (ev === 'start') {
          if (!q) d.quests[id] = { state: 'active', step: rest[0] ?? 'start', completed: [] };
        } else if (!q) {
          throw new Error(`Quest "${id}" not started (in "${command}")`);
        } else if (ev === 'step') {
          if (!q.completed.includes(q.step)) q.completed.push(q.step);
          q.step = rest[0]!;
        } else if (ev === 'complete') {
          if (!q.completed.includes(q.step)) q.completed.push(q.step);
          q.state = 'done';
        } else if (ev === 'fail') {
          q.state = 'failed';
        } else throw new Error(`Unknown quest op "${a}"`);
        this.bus.emit('state:quest', { quest: id, event: ev, ...(rest[0] ? { step: rest[0] } : {}) });
        break;
      }
      case 'codex':
        if (!d.discovered.codex.includes(a!)) {
          d.discovered.codex.push(a!);
          this.bus.emit('state:codex', { entry: a! });
        }
        break;
      case 'collect': {
        const set = (d.discovered.collectibles[a!] ??= []);
        if (!set.includes(b!)) {
          set.push(b!);
          this.bus.emit('state:collect', { set: a!, id: b!, count: set.length });
        }
        break;
      }
      case 'herm':
        if (!d.discovered.herms.includes(a!)) {
          d.discovered.herms.push(a!);
          this.bus.emit('state:herm', { id: a! });
        }
        break;
      case 'toast':
        this.bus.emit('state:toast', { text: [a, b, ...rest].filter(Boolean).join(' ') });
        break;
      case 'time':
        this.bus.emit('state:time', { hours: Number(a), nextDay: b === 'next' });
        break;
      case 'season':
        if (!['spring', 'summer', 'autumn', 'winter'].includes(a!)) throw new Error(`Unknown season "${a}"`);
        this.bus.emit('state:season', { season: a as 'spring' | 'summer' | 'autumn' | 'winter' });
        break;
      case 'lesbos':
        this.bus.emit('state:lesbos', { action: a ?? 'enter' });
        break;
      case 'cave':
        this.bus.emit('state:cave', { action: a ?? 'enter' });
        break;
      case 'athletics':
        this.bus.emit('state:athletics', { kind: a!, id: b! });
        break;
      case 'puzzle':
        this.bus.emit('state:puzzle', { id: a!, ...(b ? { arg: b } : {}) });
        break;
      default:
        throw new Error(`Unknown command "${command}"`);
    }
    this.bus.emit('state:command', { command });
  }

  /** Fog of war: a FOG_N × FOG_N grid over the world bounds, '1' = seen. */
  revealAround(x: number, z: number, radius: number, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean {
    const d = this.data.discovered;
    if (d.fog.length !== FOG_N * FOG_N) d.fog = '0'.repeat(FOG_N * FOG_N);
    const cw = (bounds.maxX - bounds.minX) / FOG_N;
    const ch = (bounds.maxZ - bounds.minZ) / FOG_N;
    const cells = d.fog.split('');
    let changed = false;
    const ci = Math.floor((x - bounds.minX) / cw);
    const cj = Math.floor((z - bounds.minZ) / ch);
    const ri = Math.ceil(radius / cw);
    const rj = Math.ceil(radius / ch);
    for (let j = cj - rj; j <= cj + rj; j++) {
      for (let i = ci - ri; i <= ci + ri; i++) {
        if (i < 0 || j < 0 || i >= FOG_N || j >= FOG_N) continue;
        const cx = bounds.minX + (i + 0.5) * cw;
        const cz = bounds.minZ + (j + 0.5) * ch;
        if (Math.hypot(cx - x, cz - z) > radius) continue;
        const k = j * FOG_N + i;
        if (cells[k] !== '1') {
          cells[k] = '1';
          changed = true;
        }
      }
    }
    if (changed) d.fog = cells.join('');
    return changed;
  }

  serialize(): string {
    return JSON.stringify(this.data);
  }

  static deserialize(json: string): GameState {
    const parsed = JSON.parse(json) as Partial<GameStateData>;
    if (parsed.version !== 1) throw new Error('Unsupported save version');
    return new GameState({ ...newGameState(), ...parsed } as GameStateData);
  }
}
