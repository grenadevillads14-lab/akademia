import { describe, expect, it } from 'vitest';
import events from '../../content/athletics/events.json';
import characters from '../../content/characters/characters.json';
import en from '../../content/i18n/en.json';
import { courseLength } from '../../src/athletics/race';
import { loadStory } from '../../src/game/story';
import { GameState } from '../../src/systems/state';

const strings = en as Record<string, string>;
const known = new Set([...characters.characters.map((c) => c.id), ...Object.keys(loadStory().extras)]);

describe('athletics content', () => {
  it('names real characters, has strings, and its rewards are valid commands', () => {
    const s = new GameState();
    const all = [...Object.values(events.races), ...Object.values(events.throws)] as { titleKey: string; rivals: { id: string }[]; onPlace: Record<string, string[]>; onFail?: string[] }[];
    for (const e of all) {
      expect(strings[e.titleKey], e.titleKey).toBeTruthy();
      for (const r of e.rivals) expect(known.has(r.id), r.id).toBe(true);
      for (const cmds of [...Object.values(e.onPlace), e.onFail ?? []]) for (const c of cmds) expect(() => s.runCommand(c), c).not.toThrow();
      // Every possible place (rivals + the player) has a reward.
      for (let place = 1; place <= e.rivals.length + 1; place++) expect(e.onPlace[String(place)], `${e.titleKey} place ${place}`).toBeTruthy();
    }
    for (const b of Object.values(events.wrestling)) {
      expect(known.has(b.opponent.id), b.opponent.id).toBe(true);
      expect(strings[b.titleKey], b.titleKey).toBeTruthy();
      for (const c of [...b.onWin, ...b.onLose]) expect(() => s.runCommand(c), c).not.toThrow();
    }
  });

  it('rival times are beatable but not trivial for the player (jog 3.8 m/s, sprint 6.4 m/s)', () => {
    for (const [id, r] of Object.entries(events.races)) {
      const L = courseLength(r.course as [number, number][]);
      const jog = L / 3.8;
      const best = L / 6.4;
      const fastest = Math.min(...r.rivals.map((x) => x.time));
      expect(fastest, `${id}: fastest rival vs. pure sprint`).toBeGreaterThan(best);
      expect(fastest, `${id}: fastest rival vs. pure jog`).toBeLessThan(jog);
    }
  });
});
