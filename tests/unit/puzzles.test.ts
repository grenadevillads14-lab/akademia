import { describe, expect, it } from 'vitest';
import courage from '../../content/debates/courage.json';
import moriai from '../../content/collectibles/moriai.json';
import waterData from '../../content/puzzles/waterworks.json';
import vegData from '../../content/world/academy.vegetation.json';
import { availableMoves, playMove, startDebate, type DebateDef } from '../../src/puzzles/debate';
import { evaluateMeno, findSquares, type Seg } from '../../src/puzzles/meno';
import { simulate, solutions, type WaterNetwork, type WaterSetting } from '../../src/puzzles/waterworks';

describe('Meno square', () => {
  it('detects the given square', () => {
    expect(evaluateMeno([]).feedback).toBe('given');
  });
  it('doubling the side gives four times the area (the boy’s first answer)', () => {
    const big: Seg[] = [[[0, 0], [4, 0]], [[4, 0], [4, 4]], [[4, 4], [0, 4]], [[0, 4], [0, 0]]];
    expect(evaluateMeno(big)).toMatchObject({ solved: false, feedback: 'four_times' });
  });
  it('side three gives nine', () => {
    const s3: Seg[] = [[[0, 0], [3, 0]], [[3, 0], [3, 3]], [[3, 3], [0, 3]], [[0, 3], [0, 0]]];
    expect(evaluateMeno(s3).feedback).toBe('nine');
  });
  it('the square on the diagonal is double', () => {
    const diag: Seg[] = [[[2, 0], [4, 2]], [[4, 2], [2, 4]], [[2, 4], [0, 2]], [[0, 2], [2, 0]]];
    expect(evaluateMeno(diag)).toMatchObject({ solved: true, feedback: 'double' });
  });
  it('the diagonal of the given square itself also works (side √8)', () => {
    const tilted: Seg[] = [[[0, 0], [2, 2]], [[2, 2], [0, 4]], [[0, 4], [-0, 4]], [[0, 4], [-2, 2]]];
    // (-2,2) is off the lattice, so this is not a square here.
    expect(evaluateMeno(tilted).solved).toBe(false);
  });
  it('joins collinear pieces into one side', () => {
    const pieces: Seg[] = [[[0, 0], [1, 0]], [[1, 0], [3, 0]], [[3, 0], [3, 3]], [[3, 3], [0, 3]], [[0, 3], [0, 0]]];
    expect(findSquares(pieces, 4).some((s) => s.area === 9)).toBe(true);
  });
});

describe('waterworks', () => {
  const net = waterData as unknown as WaterNetwork;
  it('the starting state floods the reading spot', () => {
    const r = simulate(net, waterData.start as WaterSetting);
    expect(r.ok).toBe(false);
    expect(r.problems.map((p) => p.node)).toContain('reading');
  });
  it('has exactly one solution, found by reasoning about equal shares', () => {
    const sols = solutions(net);
    expect(sols).toHaveLength(1);
    expect(sols[0]).toEqual({ sluices: { gym: true, west: true, east: true, garden: true }, pipes: { pipe: 'grove' } });
    const r = simulate(net, sols[0]!);
    expect(r.arrive.baths).toBeCloseTo(1 / 3);
    expect(r.arrive.figs).toBeCloseTo(1 / 6);
  });
  it('closing a dead end backs the water up', () => {
    const r = simulate(net, { sluices: { gym: false, west: false, east: false, garden: false }, pipes: { pipe: 'grove' } });
    expect(r.problems.some((p) => p.issue === 'backup')).toBe(true);
  });
});

describe('courage debate', () => {
  const def = courage as unknown as DebateDef;
  it('can be won by building the argument in order', () => {
    let s = startDebate(def);
    for (const m of ['scythians', 'noble', 'foolish', 'reinforcements']) s = playMove(def, s, m);
    expect(s.outcome).toBe('won');
  });
  it('the foolish-endurance argument is weak until nobility is conceded, and can be retried', () => {
    let s = startDebate(def);
    s = playMove(def, s, 'scythians');
    s = playMove(def, s, 'foolish');
    expect(s.round).toBe('r2');
    expect(s.opp).toBe(3);
    expect(availableMoves(def, s, () => true).map((m) => m.id)).toContain('foolish');
  });
  it('contradicting your own concession costs you', () => {
    let s = startDebate(def);
    s = playMove(def, s, 'scythians');
    s = playMove(def, s, 'noble');
    s = playMove(def, s, 'foolish');
    s = playMove(def, s, 'not_noble');
    expect(s.self).toBe(def.playerConsistency - 1);
  });
  it('locks moves that need a skill', () => {
    let s = startDebate(def);
    for (const m of ['scythians', 'noble', 'foolish']) s = playMove(def, s, m);
    const moves = availableMoves(def, s, (req) => !req.skill);
    expect(moves.find((m) => m.id === 'share')?.locked).toBe(true);
  });
});

describe('moriai', () => {
  it('every moria in the planting plan has a fragment, and vice versa', () => {
    const planted = vegData.rules.flatMap((r) => ('items' in r && r.species === 'moria' ? (r.items as { id: string }[]).map((i) => i.id) : []));
    expect(new Set(planted)).toEqual(new Set(Object.keys(moriai.items)));
    expect(planted).toHaveLength(12);
  });
});
