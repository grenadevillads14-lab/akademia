import { t } from '../core/i18n';

/**
 * Minimal HUD (design §8): contextual interaction prompt, objective tracker, toasts (XP, ideas, codex),
 * zone title cards. Plain DOM, styled in styles.css (papyrus / red-figure palette).
 */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly objective: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  private readonly zoneCard: HTMLDivElement;
  private zoneTimer = 0;
  hidden = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.prompt = div('hud-prompt');
    this.objective = div('hud-objective');
    this.toasts = div('hud-toasts');
    this.zoneCard = div('hud-zone');
    this.root.append(this.prompt, this.objective, this.toasts, this.zoneCard);
    parent.appendChild(this.root);
    this.prompt.hidden = true;
    this.objective.hidden = true;
  }

  setPrompt(key: string | null, label?: string): void {
    if (!label) {
      this.prompt.hidden = true;
      return;
    }
    this.prompt.hidden = false;
    this.prompt.replaceChildren(kbd(key ?? 'F'), document.createTextNode(` ${label}`));
  }

  setObjective(title: string | null, step: string | null): void {
    if (!title) {
      this.objective.hidden = true;
      return;
    }
    this.objective.hidden = false;
    const h = document.createElement('div');
    h.className = 'hud-objective-title';
    h.textContent = title;
    const s = document.createElement('div');
    s.className = 'hud-objective-step';
    s.textContent = step ?? '';
    this.objective.replaceChildren(h, s);
  }

  toast(text: string, kind: 'xp' | 'idea' | 'codex' | 'quest' | 'item' | 'info' = 'info'): void {
    const el = div(`hud-toast hud-toast-${kind}`);
    el.textContent = text;
    this.toasts.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4300);
    while (this.toasts.children.length > 5) this.toasts.firstElementChild?.remove();
  }

  showZone(name: string): void {
    this.zoneCard.textContent = name;
    this.zoneCard.classList.remove('out');
    this.zoneCard.classList.add('in');
    this.zoneTimer = 4;
  }

  update(dt: number): void {
    if (this.zoneTimer > 0) {
      this.zoneTimer -= dt;
      if (this.zoneTimer <= 0) {
        this.zoneCard.classList.remove('in');
        this.zoneCard.classList.add('out');
      }
    }
    this.root.hidden = this.hidden;
  }
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function kbd(text: string): HTMLElement {
  const k = document.createElement('kbd');
  k.textContent = text;
  return k;
}

export function promptKey(device: 'keyboard' | 'gamepad'): string {
  return device === 'gamepad' ? 'X' : 'F';
}

export { t };
