/**
 * Socratic debate (design §6.8) as pure logic. The opponent defends a definition; you probe it with
 * questions and counterexamples. A good move lowers their consistency; a weak move gains nothing; a move
 * that contradicts something you yourself conceded earlier costs your own consistency. Win by refuting
 * their definitions (consistency 0) before yours runs out; or reach aporia honestly (a draw that still teaches).
 */
export interface DebateMove {
  id: string;
  text: string;
  /** Damage to the opponent's consistency (0 = no effect). */
  hit: number;
  /** Concessions this move commits you to. */
  commits?: string[];
  /** If you have conceded any of these, the move contradicts you: costs your consistency. */
  contradicts?: string[];
  /** Opponent's reply (shown after the move). */
  reply: string;
  /** Move to another round after this move (e.g. the opponent refines the definition). */
  next?: string;
  /** Only lands if you have already conceded these; otherwise it is weak (hit 0, weakReply). */
  needsCommit?: string[];
  weakReply?: string;
  /** Requires an idea or skill (shown greyed otherwise). */
  requires?: { idea?: string; skill?: string };
}

export interface DebateRound {
  id: string;
  /** The opponent's current claim. */
  claim: string;
  moves: DebateMove[];
}

export interface DebateDef {
  id: string;
  title: string;
  opponent: string;
  question: string;
  opponentConsistency: number;
  playerConsistency: number;
  start: string;
  rounds: DebateRound[];
  /** Commands run on outcome. */
  onWin: string[];
  onLose: string[];
  /** Short codex-style explanation shown afterwards. */
  lesson: string;
}

export interface DebateState {
  round: string;
  opp: number;
  self: number;
  commitments: string[];
  used: string[];
  log: { who: 'player' | 'opponent'; text: string }[];
  outcome: 'ongoing' | 'won' | 'lost';
}

export function startDebate(def: DebateDef, bonusConsistency = 0): DebateState {
  const r = def.rounds.find((x) => x.id === def.start)!;
  return { round: def.start, opp: def.opponentConsistency, self: def.playerConsistency + bonusConsistency, commitments: [], used: [], log: [{ who: 'opponent', text: r.claim }], outcome: 'ongoing' };
}

export function availableMoves(def: DebateDef, st: DebateState, has: (req: NonNullable<DebateMove['requires']>) => boolean): (DebateMove & { locked: boolean })[] {
  const r = def.rounds.find((x) => x.id === st.round);
  if (!r) return [];
  return r.moves.filter((m) => !st.used.includes(m.id)).map((m) => ({ ...m, locked: !!m.requires && !has(m.requires) }));
}

export function playMove(def: DebateDef, st: DebateState, moveId: string): DebateState {
  if (st.outcome !== 'ongoing') return st;
  const r = def.rounds.find((x) => x.id === st.round);
  const m = r?.moves.find((x) => x.id === moveId);
  if (!r || !m) throw new Error(`Unknown move ${moveId} in round ${st.round}`);
  const selfContradiction = (m.contradicts ?? []).some((c) => st.commitments.includes(c));
  const unprepared = (m.needsCommit ?? []).some((c) => !st.commitments.includes(c));
  // An argument made too early can be made again once you've laid the groundwork.
  const next: DebateState = { ...st, commitments: [...st.commitments], used: unprepared ? [...st.used] : [...st.used, m.id], log: [...st.log] };
  next.log.push({ who: 'player', text: m.text });
  if (selfContradiction) next.self -= 1;
  else if (!unprepared) next.opp -= m.hit;
  for (const c of m.commits ?? []) if (!next.commitments.includes(c)) next.commitments.push(c);
  const reply = selfContradiction ? `${m.reply} …But a moment ago you agreed otherwise. Which do you believe?` : unprepared ? (m.weakReply ?? 'And why should that matter?') : m.reply;
  next.log.push({ who: 'opponent', text: reply });
  if (m.next && !selfContradiction && !unprepared) {
    next.round = m.next;
    const nr = def.rounds.find((x) => x.id === m.next);
    if (nr) next.log.push({ who: 'opponent', text: nr.claim });
  }
  if (next.opp <= 0) next.outcome = 'won';
  else if (next.self <= 0) next.outcome = 'lost';
  else if (availableMoves(def, next, () => true).length === 0) next.outcome = 'lost';
  return next;
}
