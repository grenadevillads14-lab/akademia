import { t } from '../core/i18n';
import type { InputState } from '../core/input';
import type { DialogueChoice, DialogueLine, DialogueRunner } from './dialogue';

/**
 * Dialogue box (bottom of the screen): speaker name, text with a typewriter reveal, choices.
 * Advance with Enter / Space / click / gamepad A; choose with number keys, arrows + Enter, click,
 * or D-pad + A. Text size follows the accessibility setting (CSS --text-scale).
 */
export class DialogueUI {
  private readonly root: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly choicesEl: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private full = '';
  private shown = 0;
  private choices: DialogueChoice[] = [];
  private selected = 0;
  private onLine: ((line: DialogueLine) => void) | null = null;
  private onEnd: (() => void) | null = null;
  private clicked = false;
  /** Characters per second for the typewriter; 0 = instant. */
  cps = 55;

  constructor(
    parent: HTMLElement,
    private readonly runner: DialogueRunner,
    private readonly speakerName: (id: string) => string,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'dialogue papyrus';
    this.root.setAttribute('data-testid', 'dialogue');
    this.name = document.createElement('div');
    this.name.className = 'dialogue-name';
    this.text = document.createElement('div');
    this.text.className = 'dialogue-text';
    this.choicesEl = document.createElement('div');
    this.choicesEl.className = 'dialogue-choices';
    this.hint = document.createElement('div');
    this.hint.className = 'dialogue-hint';
    this.hint.textContent = t('dialogue.continue');
    this.root.append(this.name, this.text, this.choicesEl, this.hint);
    this.root.hidden = true;
    this.root.addEventListener('click', () => (this.clicked = true));
    parent.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  begin(path: string, onLine: (line: DialogueLine) => void, onEnd: () => void): void {
    this.runner.start(path);
    this.onLine = onLine;
    this.onEnd = onEnd;
    this.root.hidden = false;
    this.advance();
  }

  private advance(): void {
    const line = this.runner.next();
    if (line) {
      this.onLine?.(line);
      this.name.textContent = line.speaker ? this.speakerName(line.speaker) : '';
      this.name.hidden = !line.speaker;
      this.root.classList.toggle('narration', !line.speaker);
      this.full = line.text;
      this.shown = this.cps > 0 ? 0 : this.full.length;
      this.text.textContent = '';
      this.renderChoices([]);
      return;
    }
    const choices = this.runner.choices();
    if (choices.length) {
      this.renderChoices(choices);
      return;
    }
    this.close();
  }

  private renderChoices(choices: DialogueChoice[]): void {
    this.choices = choices;
    this.selected = 0;
    this.choicesEl.replaceChildren(
      ...choices.map((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'dialogue-choice';
        b.textContent = `${i + 1}. ${c.text}`;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          this.pick(i);
        });
        return b;
      }),
    );
    this.hint.hidden = choices.length > 0;
    this.highlight();
  }

  private highlight(): void {
    [...this.choicesEl.children].forEach((el, i) => el.classList.toggle('selected', i === this.selected));
  }

  private pick(i: number): void {
    const c = this.choices[i];
    if (!c) return;
    this.runner.choose(c.index);
    this.renderChoices([]);
    this.advance();
  }

  close(): void {
    this.runner.end();
    this.root.hidden = true;
    const cb = this.onEnd;
    this.onEnd = null;
    this.onLine = null;
    cb?.();
  }

  update(dt: number, input: InputState): void {
    if (!this.open) return;
    if (this.shown < this.full.length) {
      this.shown = Math.min(this.full.length, this.shown + this.cps * dt);
      this.text.textContent = this.full.slice(0, Math.floor(this.shown));
    }
    const typing = this.shown < this.full.length;
    if (this.choices.length) {
      for (let i = 0; i < Math.min(9, this.choices.length); i++) {
        if (input.wasCodePressed(`Digit${i + 1}`) || input.wasCodePressed(`Numpad${i + 1}`)) {
          this.pick(i);
          return;
        }
      }
      if (input.wasPressed('moveForward')) {
        this.selected = (this.selected + this.choices.length - 1) % this.choices.length;
        this.highlight();
      }
      if (input.wasPressed('moveBack')) {
        this.selected = (this.selected + 1) % this.choices.length;
        this.highlight();
      }
      if (input.wasPressed('confirm') || input.wasPressed('interact')) this.pick(this.selected);
    } else if (input.wasPressed('confirm') || input.wasPressed('interact') || this.clicked) {
      if (typing) this.shown = this.full.length;
      else this.advance();
    }
    this.clicked = false;
  }
}
