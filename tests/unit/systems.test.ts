import { describe, expect, it } from 'vitest';
import { DialogueRunner, storyIds } from '../../src/dialogue/dialogue';
import { GameState, levelOf } from '../../src/systems/state';

describe('GameState commands', () => {
  it('handles flags, xp, reputation, ideas, items', () => {
    const s = new GameState();
    s.runCommand('flag met_aristotle');
    s.runCommand('xp logos 70');
    s.runCommand('rep aristotle 2');
    s.runCommand('idea wonder');
    s.runCommand('idea wonder');
    s.runCommand('item wax_tablet');
    s.runCommand('item wax_tablet -1');
    expect(s.flag('met_aristotle')).toBe(true);
    expect(s.level('logos')).toBe(2);
    expect(s.rep('aristotle')).toBe(2);
    expect(s.data.ideas).toEqual(['wonder']);
    expect(s.items('wax_tablet')).toBe(0);
  });

  it('tracks quest steps', () => {
    const s = new GameState();
    s.runCommand('quest start prologue meet');
    s.runCommand('quest step prologue walk_road');
    s.runCommand('quest complete prologue');
    expect(s.quest('prologue')).toEqual({ state: 'done', step: 'walk_road', completed: ['meet', 'walk_road'] });
  });

  it('emits level-up events', () => {
    const s = new GameState();
    const ups: boolean[] = [];
    s.bus.on('state:xp', (e) => ups.push(e.levelUp));
    s.runCommand('xp mathesis 30');
    s.runCommand('xp mathesis 40');
    expect(ups).toEqual([false, true]);
    expect(levelOf(0)).toBe(1);
  });

  it('rejects unknown commands and disciplines', () => {
    const s = new GameState();
    expect(() => s.runCommand('dance wildly')).toThrow();
    expect(() => s.runCommand('xp cooking 5')).toThrow();
  });

  it('round-trips through JSON', () => {
    const s = new GameState();
    s.runCommand('collect moriai moria-3');
    const back = GameState.deserialize(s.serialize());
    expect(back.data.discovered.collectibles.moriai).toEqual(['moria-3']);
  });
});

describe('dialogue', () => {
  it('compiles every .ink file', () => {
    expect(storyIds()).toContain('prologue');
  });

  it('runs the prologue meeting with commands and choices', () => {
    const s = new GameState();
    s.runCommand('quest start prologue meet');
    const d = new DialogueRunner(s);
    d.start('prologue.meet_aristotle');
    const first = d.next()!;
    expect(first.speaker).toBe('aristotle');
    expect(first.shot).toBe('aristotle');
    expect(d.choices().length).toBe(3);
    d.choose(1);
    const lines: string[] = [];
    for (let l = d.next(); l; l = d.next()) lines.push(`${l.speaker}: ${l.text}`);
    expect(d.finished).toBe(true);
    expect(s.flag('met_aristotle')).toBe(true);
    expect(s.rep('aristotle')).toBe(2);
    expect(s.quest('prologue')!.step).toBe('walk_road');
    d.end();
    expect(s.data.ink.prologue).toBeTruthy();
  });

  it('plays the whole prologue path without errors', () => {
    const s = new GameState();
    const d = new DialogueRunner(s);
    for (const knot of ['arrival', 'meet_aristotle', 'stele_casualty', 'stele_dexileos', 'road_talk', 'altar_eros', 'rumour', 'moria', 'speusippus_welcome', 'plato_circle', 'diogenes_road']) {
      d.start(`prologue.${knot}`);
      for (let guard = 0; guard < 50 && !d.finished; guard++) {
        while (d.next());
        if (d.choices().length) d.choose(0);
      }
      d.end();
    }
    expect(s.quest('prologue')!.state).toBe('done');
    expect(s.hasIdea('wonder')).toBe(true);
    expect(s.data.discovered.codex).toContain('dexileos');
  });
});
