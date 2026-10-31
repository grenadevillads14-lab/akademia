import { describe, expect, it } from 'vitest';
import en from '../../content/i18n/en.json';
import puzzleText from '../../content/puzzles/text.json';
import waterData from '../../content/puzzles/waterworks.json';
import act2Puzzles from '../../content/puzzles/act2.json';
import athletics from '../../content/athletics/events.json';
import moriaiData from '../../content/collectibles/moriai.json';
import specimenData from '../../content/collectibles/specimens.json';
import courage from '../../content/debates/courage.json';
import { DialogueRunner } from '../../src/dialogue/dialogue';
import characters from '../../content/characters/characters.json';
import codex from '../../content/codex/en.json';
import { parseAppearance } from '../../src/characters/appearance';
import { loadStory, meets } from '../../src/game/story';
import { GameState } from '../../src/systems/state';

const strings = en as Record<string, string>;

/** Play a knot to the end, always taking the first choice. */
function play(d: DialogueRunner, knot: string): void {
  d.start(knot);
  for (let guard = 0; guard < 80 && !d.finished; guard++) {
    while (d.next());
    if (d.choices().length) d.choose(0);
  }
  d.end();
}

describe('story content', () => {
  const story = loadStory();

  it('every character and extra has a valid appearance and a name', () => {
    for (const c of characters.characters) expect(() => parseAppearance(c.appearance), c.id).not.toThrow();
    for (const [id, e] of Object.entries(story.extras)) {
      expect(() => parseAppearance(e.appearance), id).not.toThrow();
      expect(strings[e.nameKey], e.nameKey).toBeTruthy();
    }
  });

  it('every idea and codex entry granted anywhere in the content exists in the codex', () => {
    const files = import.meta.glob('../../content/**/*.{ink,json}', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
    const missing: string[] = [];
    let seen = 0;
    for (const [file, src] of Object.entries(files)) {
      if (file.includes('/codex/')) continue;
      for (const m of src.matchAll(/(?:cmd: |")(idea|codex) ([a-z0-9_]+)/g)) {
        const [, kind, id] = m;
        const table = kind === 'idea' ? codex.ideas : codex.entries;
        seen++;
        if (!(id! in table)) missing.push(`${file}: ${kind} ${id}`);
      }
    }
    expect(seen).toBeGreaterThan(30);
    expect(missing).toEqual([]);
  });

  it('has i18n strings for every quest and step', () => {
    for (const q of Object.values(story.quests)) {
      expect(strings[q.titleKey], q.titleKey).toBeTruthy();
      for (const st of Object.values(q.steps)) expect(strings[st.textKey], st.textKey).toBeTruthy();
    }
  });

  it('points every trigger at an existing knot and every questStep at a defined step', () => {
    for (const tr of story.triggers) {
      if (tr.dialogue) expect(() => new DialogueRunner(new GameState()).start(tr.dialogue!), tr.id).not.toThrow();
      const qs = tr.requires.questStep;
      if (qs) {
        const [q, step] = qs.split(':');
        expect(story.quests[q!]?.steps[step!], `${tr.id}: ${qs}`).toBeTruthy();
      }
    }
  });

  it('plays the prologue, Act 1 and Act 2 from start to finish, driven by the triggers', () => {
    const s = new GameState();
    const d = new DialogueRunner(s);
    // Puzzles: pretend the player solves each one.
    s.bus.on('state:puzzle', (e) => {
      const solve: Record<string, string[]> = {
        meno: puzzleText.meno.onSolve,
        waterworks: waterData.onSolve,
        debate: courage.onWin,
        solids: act2Puzzles.solids.onSolve,
        spheres: act2Puzzles.spheres.onSolve,
        delian: act2Puzzles.delian.onSolve,
        divided_line: act2Puzzles.dividedLine.onSolve,
      };
      for (const c of solve[e.id]!) s.runCommand(c);
      if (e.id === 'debate') s.runCommand(`flag debate.${e.arg} won`);
    });
    // Athletics: pretend the player comes second. The Cave: the player goes back down.
    s.bus.on('state:athletics', (e) => {
      if (e.kind === 'race') for (const c of (athletics.races as Record<string, { onPlace: Record<string, string[]> }>)[e.id]!.onPlace['2']!) s.runCommand(c);
    });
    s.bus.on('state:lesbos', () => s.runCommand('flag lesbos_done'));
    s.bus.on('state:cave', () => {
      s.runCommand('flag cave_returned');
      s.runCommand('flag cave_done');
    });
    const fired = new Set<string>();
    const pools: Record<string, { ids: string[]; cap: number }> = {
      moriai: { ids: Object.keys(moriaiData.items).filter((id) => id !== 'moria-1'), cap: 4 },
      specimens: { ids: Object.keys(specimenData.items), cap: 6 },
    };
    const taken: Record<string, number> = { moriai: 0, specimens: 0 };
    const order: string[] = [];
    for (let step = 0; step < 400; step++) {
      const tr = story.triggers.find((x) => meets(s, x.requires) && !(fired.has(x.id) && !x.requires.questStep && !x.collect) && !(x.collect && taken[x.collect]! >= pools[x.collect]!.cap));
      if (!tr) break;
      order.push(tr.id);
      if (tr.collect) s.runCommand(`collect ${tr.collect} ${pools[tr.collect]!.ids[taken[tr.collect]!++]}`);
      else play(d, tr.dialogue!);
      if (tr.set) s.runCommand(`flag ${tr.set}`);
      fired.add(tr.id);
    }
    expect(s.quest('prologue')?.state).toBe('done');
    expect(s.quest('act1')?.state, order.join(' > ')).toBe('done');
    for (const q of ['trial_meno', 'trial_moriai', 'trial_water', 'trial_palaestra']) expect(s.quest(q)?.state).toBe('done');
    expect(s.quest('act2')?.state, order.join(' > ')).toBe('done');
    expect(s.quest('axiothea')?.state, order.join(' > ')).toBe('done');
    expect(s.quest('act3')?.state, order.join(' > ')).toBe('done');
    expect(s.quest('act4')?.state, order.join(' > ')).toBe('done');
    expect(s.flag('chapter')).toBe('act5');
    for (const idea of ['ratio', 'five_solids', 'homocentric_spheres', 'mean_proportionals', 'divided_line', 'cave', 'women_guardians']) expect(s.hasIdea(idea), idea).toBe(true);
    expect(s.flag('ww.east')).toBeUndefined(); // the world setting is written by the puzzle UI, not the content
  });
});
