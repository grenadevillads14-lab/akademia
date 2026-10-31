import { describe, expect, it } from 'vitest';
import en from '../../content/i18n/en.json';
import puzzleText from '../../content/puzzles/text.json';
import waterData from '../../content/puzzles/waterworks.json';
import courage from '../../content/debates/courage.json';
import { DialogueRunner } from '../../src/dialogue/dialogue';
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

  it('plays the prologue and Act 1 from start to finish, driven by the triggers', () => {
    const s = new GameState();
    const d = new DialogueRunner(s);
    // Puzzles: pretend the player solves each one.
    s.bus.on('state:puzzle', (e) => {
      const cmds = e.id === 'meno' ? puzzleText.meno.onSolve : e.id === 'waterworks' ? waterData.onSolve : courage.onWin;
      for (const c of cmds) s.runCommand(c);
      if (e.id === 'debate') s.runCommand(`flag debate.${e.arg} won`);
    });
    const fired = new Set<string>();
    let moria = 0;
    const order: string[] = [];
    for (let step = 0; step < 200 && s.flag('chapter') !== 'act2'; step++) {
      const tr = story.triggers.find((x) => meets(s, x.requires) && !(fired.has(x.id) && !x.requires.questStep && !x.collect) && !(x.collect && moria >= 4));
      if (!tr) break;
      order.push(tr.id);
      if (tr.collect) s.runCommand(`collect ${tr.collect} moria-${++moria + 1}`);
      else play(d, tr.dialogue!);
      if (tr.set) s.runCommand(`flag ${tr.set}`);
      fired.add(tr.id);
    }
    expect(s.quest('prologue')?.state).toBe('done');
    expect(s.quest('act1')?.state, order.join(' > ')).toBe('done');
    for (const q of ['trial_meno', 'trial_moriai', 'trial_water', 'trial_palaestra']) expect(s.quest(q)?.state).toBe('done');
    expect(s.flag('chapter')).toBe('act2');
    expect(s.hasIdea('ratio')).toBe(true);
    expect(s.flag('ww.east')).toBeUndefined(); // the world setting is written by the puzzle UI, not the content
  });
});
