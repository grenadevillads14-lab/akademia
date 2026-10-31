/**
 * Upright wrestling (pale) as pure logic (design §6 athletics): a readable stance-and-timing duel.
 * Win by three falls (the triagmos; a "triakter" was a wrestler who threw his man three times).
 *
 * Loop: from a neutral grip the opponent telegraphs an attack (each has a visible cue). Answer with the
 * right counter inside the window: he loses balance and an opening appears; press "throw" while the
 * opening lasts to put him down. Wrong or late answers cost your own balance; at zero you fall.
 */
import { mulberry32 } from '../procgen/rng';

export type Attack = 'shoot' | 'clinch' | 'trip';
export type Counter = 'sprawl' | 'break' | 'step';
export type WrestleAction = Counter | 'throw';

export const COUNTER_FOR: Record<Attack, Counter> = { shoot: 'sprawl', clinch: 'break', trip: 'step' };

export interface Opponent {
  id: string;
  /** Seconds to answer a telegraph (smaller = harder). */
  window: number;
  /** Seconds of neutral grip between attacks [min, max]. */
  pause: [number, number];
  /** Opening length after a good counter. */
  opening: number;
  /** Chance an attack is a feint that changes at half-window (only skilled opponents). */
  feint: number;
}

export interface WrestleState {
  phase: 'neutral' | 'telegraph' | 'opening' | 'fall' | 'won' | 'lost';
  timer: number;
  attack: Attack | null;
  /** Feint: the attack shown first, before it switches. */
  shown: Attack | null;
  playerBalance: number;
  oppBalance: number;
  playerFalls: number;
  oppFalls: number;
  /** Who fell last (for the fall pause and the UI). */
  lastFall: 'player' | 'opponent' | null;
  rngState: number;
  log: string[];
}

const FALLS_TO_WIN = 3;

export function startBout(seed: number): WrestleState {
  return { phase: 'neutral', timer: 1.2, attack: null, shown: null, playerBalance: 1, oppBalance: 1, playerFalls: 0, oppFalls: 0, lastFall: null, rngState: seed >>> 0, log: [] };
}

function rand(s: WrestleState): number {
  const r = mulberry32(s.rngState);
  const v = r();
  s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
  return v;
}

/** The cue the player currently sees (a feint shows the false attack in the first half of the window). */
export function visibleAttack(st: WrestleState, opp: Opponent): Attack | null {
  if (st.phase !== 'telegraph') return null;
  if (st.shown && st.timer > opp.window * 0.5) return st.shown;
  return st.attack;
}

function fall(s: WrestleState, who: 'player' | 'opponent'): void {
  if (who === 'player') s.playerFalls++;
  else s.oppFalls++;
  s.lastFall = who;
  s.log.push(who === 'player' ? 'fall_player' : 'fall_opponent');
  s.playerBalance = 1;
  s.oppBalance = 1;
  s.attack = null;
  s.shown = null;
  if (s.oppFalls >= FALLS_TO_WIN) s.phase = 'won';
  else if (s.playerFalls >= FALLS_TO_WIN) s.phase = 'lost';
  else {
    s.phase = 'fall';
    s.timer = 1.6;
  }
}

/**
 * Advance by dt with an optional player action this step. `windowBonus` (s) comes from the wrestler skill.
 */
export function stepBout(opp: Opponent, st: WrestleState, dt: number, action: WrestleAction | null = null, windowBonus = 0): WrestleState {
  if (st.phase === 'won' || st.phase === 'lost') return st;
  const s: WrestleState = { ...st, log: [...st.log] };
  s.timer -= dt;
  switch (s.phase) {
    case 'fall':
    case 'neutral':
      if (action === 'throw' && s.phase === 'neutral') {
        // Attacking from a neutral grip against a balanced man is a gamble that usually costs you.
        s.playerBalance -= 0.25;
        s.log.push('rash');
        if (s.playerBalance <= 0) fall(s, 'player');
        break;
      }
      if (s.timer <= 0) {
        const attacks: Attack[] = ['shoot', 'clinch', 'trip'];
        s.attack = attacks[Math.floor(rand(s) * 3)]!;
        s.shown = rand(s) < opp.feint ? attacks[(attacks.indexOf(s.attack) + 1 + Math.floor(rand(s) * 2)) % 3]! : null;
        s.phase = 'telegraph';
        s.timer = opp.window + windowBonus;
      }
      break;
    case 'telegraph':
      if (action && action !== 'throw') {
        if (action === COUNTER_FOR[s.attack!]) {
          s.oppBalance -= 0.5;
          s.phase = 'opening';
          s.timer = opp.opening + windowBonus * 0.5;
          s.log.push('counter');
        } else {
          s.playerBalance -= 0.4;
          s.log.push('wrong');
          if (s.playerBalance <= 0) fall(s, 'player');
          else {
            s.phase = 'neutral';
            s.timer = opp.pause[0];
          }
        }
      } else if (s.timer <= 0) {
        s.playerBalance -= 0.5;
        s.log.push('late');
        if (s.playerBalance <= 0) fall(s, 'player');
        else {
          s.phase = 'neutral';
          s.timer = opp.pause[0] + rand(s) * (opp.pause[1] - opp.pause[0]);
        }
      }
      break;
    case 'opening':
      if (action === 'throw') {
        // A clean throw from a real opening always lands if he is off balance; otherwise it unbalances him further.
        if (s.oppBalance <= 0.5) fall(s, 'opponent');
        else {
          s.oppBalance -= 0.5;
          s.phase = 'neutral';
          s.timer = opp.pause[0];
        }
      } else if (s.timer <= 0) {
        s.oppBalance = Math.min(1, s.oppBalance + 0.25);
        s.phase = 'neutral';
        s.timer = opp.pause[0] + rand(s) * (opp.pause[1] - opp.pause[0]);
      }
      break;
  }
  return s;
}
