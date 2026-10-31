import { Story } from 'inkjs';
import type { GameState } from '../systems/state';

/**
 * Runs ink stories (content/dialogue/*.ink, compiled at build time) against the game state.
 *
 * Writing conventions for .ink files:
 *   aristotle: Chaire! You too are new here?      ← "speaker: text" (speaker = character id; no prefix = narration)
 *   # cmd: xp logos 10                            ← game command (see GameState.runCommand); several allowed
 *   # anim: gesture                               ← animation for the current speaker
 *   # shot: aristotle                             ← camera framing (speaker id, "wide", or "player")
 *   * {has_idea("forms")} [Ask about the Forms]   ← choice gated by game state
 * External functions available to ink: has_idea(id), flag(id), rep(who), level(discipline), items(id), quest_state(id).
 */
export interface DialogueLine {
  speaker: string | null;
  text: string;
  anim: string | null;
  shot: string | null;
}

export interface DialogueChoice {
  index: number;
  text: string;
}

const stories = import.meta.glob('../../content/dialogue/*.ink', { eager: true, import: 'default' }) as Record<string, Record<string, unknown>>;

export function storyIds(): string[] {
  return Object.keys(stories).map((k) => k.split('/').pop()!.replace('.ink', ''));
}

export class DialogueRunner {
  private readonly cache = new Map<string, Story>();
  private story: Story | null = null;
  private storyId: string | null = null;

  constructor(private readonly state: GameState) {}

  private load(id: string): Story {
    let s = this.cache.get(id);
    if (s) return s;
    const json = stories[`../../content/dialogue/${id}.ink`];
    if (!json) throw new Error(`Unknown dialogue story "${id}"`);
    s = new Story(JSON.stringify(json));
    const st = this.state;
    s.BindExternalFunction('has_idea', (x: string) => st.hasIdea(x), true);
    s.BindExternalFunction('flag', (x: string) => st.flag(x) ?? false, true);
    s.BindExternalFunction('rep', (x: string) => st.rep(x), true);
    s.BindExternalFunction('level', (x: string) => st.level(x as 'logos'), true);
    s.BindExternalFunction('items', (x: string) => st.items(x), true);
    s.BindExternalFunction('quest_state', (x: string) => st.quest(x)?.state ?? 'none', true);
    s.BindExternalFunction('quest_step', (x: string) => st.quest(x)?.step ?? 'none', true);
    s.BindExternalFunction('player_name', () => st.data.player.name, true);
    s.BindExternalFunction('home_city', () => st.data.player.homeCity, true);
    const saved = st.data.ink[id];
    if (saved) s.state.LoadJson(saved);
    this.cache.set(id, s);
    return s;
  }

  get active(): boolean {
    return this.story !== null;
  }

  /** Begin a conversation at a knot (e.g. "prologue.meet_aristotle" → story "prologue", knot "meet_aristotle"). */
  start(path: string): void {
    const [id, ...knot] = path.split('.');
    const s = this.load(id!);
    this.story = s;
    this.storyId = id!;
    if (knot.length) s.ChoosePathString(knot.join('.'));
  }

  /** Next line, or null if the story is waiting for a choice or finished. Runs commands in its tags. */
  next(): DialogueLine | null {
    const s = this.story;
    if (!s || !s.canContinue) return null;
    let raw = s.Continue() ?? '';
    const tags = s.currentTags ?? [];
    let anim: string | null = null;
    let shot: string | null = null;
    for (const tag of tags) {
      const [k, ...v] = tag.split(':');
      const val = v.join(':').trim();
      const key = k!.trim();
      if (key === 'cmd') this.state.runCommand(val);
      else if (key === 'anim') anim = val;
      else if (key === 'shot') shot = val;
    }
    raw = raw.trim();
    const m = raw.match(/^([a-z_]+):\s*(.*)$/s);
    const line: DialogueLine = m ? { speaker: m[1]!, text: m[2]!, anim, shot } : { speaker: null, text: raw, anim, shot };
    if (!line.text && s.canContinue) return this.next();
    return line;
  }

  choices(): DialogueChoice[] {
    return (this.story?.currentChoices ?? []).map((c) => ({ index: c.index, text: c.text }));
  }

  choose(index: number): void {
    this.story?.ChooseChoiceIndex(index);
  }

  /** True when the story has neither lines nor choices left. */
  get finished(): boolean {
    const s = this.story;
    return !s || (!s.canContinue && s.currentChoices.length === 0);
  }

  /** Stop and persist the story's state into the save data. */
  end(): void {
    if (this.story && this.storyId) this.state.data.ink[this.storyId] = this.story.state.ToJson();
    this.story = null;
    this.storyId = null;
  }

  variable(storyId: string, name: string): unknown {
    return this.load(storyId).variablesState[name];
  }
}
