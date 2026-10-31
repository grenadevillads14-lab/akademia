import { describe, expect, it } from 'vitest';
import { meanProportionals, platoMachine, platoMachineSolution, proportionError, volumeScale } from '../../src/puzzles/delian';
import { checkPlacement, divide } from '../../src/puzzles/dividedLine';
import { allSolids, tryVertex } from '../../src/puzzles/solids';
import { path, retrogrades } from '../../src/puzzles/spheres';

describe('Platonic solids', () => {
  it('finds exactly five, with the right counts (V − E + F = 2)', () => {
    const all = allSolids();
    expect(all).toEqual([
      { sides: 3, count: 3 },
      { sides: 3, count: 4 },
      { sides: 3, count: 5 },
      { sides: 4, count: 3 },
      { sides: 5, count: 3 },
    ]);
    const counts = all.map((v) => tryVertex(v)).map((r) => [r.solid, r.vertices, r.edges, r.faces]);
    expect(counts).toEqual([
      ['tetrahedron', 4, 6, 4],
      ['octahedron', 6, 12, 8],
      ['icosahedron', 12, 30, 20],
      ['cube', 8, 12, 6],
      ['dodecahedron', 20, 30, 12],
    ]);
    for (const v of all) {
      const r = tryVertex(v);
      expect(r.vertices! - r.edges! + r.faces!).toBe(2);
    }
  });

  it('six triangles, four squares and three hexagons lie flat; more overlap; two is no corner', () => {
    expect(tryVertex({ sides: 3, count: 6 }).outcome).toBe('flat');
    expect(tryVertex({ sides: 4, count: 4 }).outcome).toBe('flat');
    expect(tryVertex({ sides: 6, count: 3 }).outcome).toBe('flat');
    expect(tryVertex({ sides: 5, count: 4 }).outcome).toBe('overlap');
    expect(tryVertex({ sides: 4, count: 2 }).outcome).toBe('too_few');
  });
});

describe("Eudoxus' spheres", () => {
  it('with no inclination the planet moves steadily along the ecliptic', () => {
    const r = retrogrades({ inclination: 0, synodic: 780, zodiacal: 687 }, 1600);
    expect(r.loops).toBe(0);
    for (const [, lat] of path({ inclination: 0, synodic: 780, zodiacal: 687 }, 400)) expect(Math.abs(lat)).toBeLessThan(1e-9);
  });

  it('Jupiter: a modest inclination produces one retrograde arc per synodic period', () => {
    const p = { inclination: 13, synodic: 399, zodiacal: 4332 };
    const r = retrogrades(p, 399 * 3);
    expect(r.loops).toBe(3);
    expect(r.arc).toBeGreaterThan(1);
    // More inclination → a wider figure-eight → longer backward arcs.
    expect(retrogrades({ ...p, inclination: 20 }, 399 * 3).arc).toBeGreaterThan(r.arc);
  });

  it('Jupiter near 13° matches the real loop (about 10° backwards over about 121 days)', () => {
    const r = retrogrades({ inclination: 13, synodic: 399, zodiacal: 4332 }, 399 * 3);
    expect(r.arc).toBeGreaterThan(8);
    expect(r.arc).toBeLessThan(12);
    expect(r.duration).toBeGreaterThan(110);
    expect(r.duration).toBeLessThan(135);
  });

  it('Mars: the model only goes backwards at inclinations that throw Mars 20° off the ecliptic (its famous failure)', () => {
    for (const i of [20, 45, 70]) expect(retrogrades({ inclination: i, synodic: 780, zodiacal: 687 }, 780 * 3).loops).toBe(0);
    const wild = { inclination: 85, synodic: 780, zodiacal: 687 };
    expect(retrogrades(wild, 780 * 3).loops).toBeGreaterThan(0);
    expect(Math.max(...path(wild, 780).map(([, lat]) => Math.abs(lat)))).toBeGreaterThan(20);
  });
});

describe('Delian problem', () => {
  it('doubling the edge makes eight times the volume; the means satisfy a:x = x:y = y:2a', () => {
    expect(volumeScale(2)).toBe(8);
    const [x, y] = meanProportionals(1, 2);
    expect(x ** 3).toBeCloseTo(2);
    expect(proportionError(1, x, y, 2)).toBeLessThan(1e-9);
    expect(proportionError(1, 1.5, 1.75, 2)).toBeGreaterThan(0.05);
  });

  it("at the right angle, Plato's machine gives the two mean proportionals", () => {
    const t = platoMachineSolution(1, 2);
    const m = platoMachine(1, 2, t);
    expect(Math.abs(m.error)).toBeLessThan(1e-9);
    // a : OX = OX : OY = OY : b
    expect(proportionError(1, m.X[1], m.Y[0], 2)).toBeLessThan(1e-9);
    expect(m.X[1] ** 3).toBeCloseTo(2);
    expect(Math.abs(platoMachine(1, 2, t * 0.9).error)).toBeGreaterThan(0.02);
  });
});

describe('Divided Line', () => {
  it('the middle segments are always equal', () => {
    for (const r of [0.55, 0.6, 2 / 3, 0.8]) {
      const [, b, c] = divide(1, r);
      expect(b).toBeCloseTo(c);
    }
  });

  it('checks placements', () => {
    const cards = [
      { id: 'shadow', segment: 'eikasia' as const },
      { id: 'horse', segment: 'pistis' as const },
      { id: 'triangle', segment: 'dianoia' as const },
    ];
    expect(checkPlacement(cards, { shadow: 'eikasia', horse: 'dianoia' })).toEqual({ correct: 1, wrong: ['horse'], missing: ['triangle'] });
  });
});
