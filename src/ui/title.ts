import { t } from '../core/i18n';
import { listSaves, readSave } from '../systems/save';
import type { GameState } from '../systems/state';

/**
 * Title screen and character creation: name, home city (shapes some dialogue), and appearance.
 * Resolves with either a new game (choices) or a loaded save.
 */
export interface NewGameChoices {
  name: string;
  homeCity: 'athens' | 'thebes' | 'syracuse' | 'miletus';
  appearance: { skin: string; hair: string; hairStyle: 'curly' | 'short' | 'cropped' | 'long'; chiton: string; cloak: string; sex: 'm' | 'f' };
}

const SKINS = ['#e0b694', '#d8a882', '#c99872', '#c08a64', '#a8744f', '#8c5e3c'];
const HAIRS = ['#1d1510', '#3a2618', '#6b4a2e', '#8c6a3a', '#b8975a'];
const CLOTH = ['#d9cbb0', '#efe6d2', '#a8442e', '#4f6a8a', '#c9922e', '#5e6b44', '#7a4a2e'];

export function showTitle(parent: HTMLElement): Promise<{ kind: 'new'; choices: NewGameChoices } | { kind: 'load'; state: GameState }> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'title-screen';
    root.setAttribute('data-testid', 'title');
    const box = document.createElement('div');
    box.className = 'title-box';
    const h = document.createElement('h1');
    h.textContent = 'ΑΚΑΔΗΜΕΙΑ';
    const sub = document.createElement('p');
    sub.className = 'title-sub';
    sub.textContent = t('title.subtitle');
    box.append(h, sub);

    const saves = listSaves();
    const main = document.createElement('div');
    main.className = 'title-actions';
    const btn = (label: string, fn: () => void, primary = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `title-button${primary ? ' primary' : ''}`;
      b.textContent = label;
      b.addEventListener('click', fn);
      main.appendChild(b);
      return b;
    };
    const latest = saves.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
    if (latest) {
      btn(t('title.continue'), () => {
        const s = readSave(latest.slot);
        if (s) {
          root.remove();
          resolve({ kind: 'load', state: s.state });
        }
      }, true);
    }
    btn(t('title.new'), () => creator(), !latest);
    box.appendChild(main);
    root.appendChild(box);
    parent.appendChild(root);

    function creator() {
      main.remove();
      const form = document.createElement('div');
      form.className = 'creator';
      const choices: NewGameChoices = { name: 'Lysis', homeCity: 'athens', appearance: { skin: SKINS[2]!, hair: HAIRS[1]!, hairStyle: 'curly', chiton: CLOTH[0]!, cloak: CLOTH[6]!, sex: 'm' } };
      const field = (label: string, control: HTMLElement) => {
        const r = document.createElement('label');
        r.className = 'creator-row';
        const s = document.createElement('span');
        s.textContent = label;
        r.append(s, control);
        form.appendChild(r);
      };
      const name = document.createElement('input');
      name.value = choices.name;
      name.maxLength = 18;
      name.id = 'creator-name';
      name.addEventListener('input', () => (choices.name = name.value.trim() || 'Lysis'));
      field(t('title.name'), name);
      const city = document.createElement('select');
      city.id = 'creator-city';
      for (const c of ['athens', 'thebes', 'syracuse', 'miletus'] as const) {
        const o = document.createElement('option');
        o.value = c;
        o.textContent = t(`city.${c}`);
        city.appendChild(o);
      }
      city.addEventListener('change', () => (choices.homeCity = city.value as NewGameChoices['homeCity']));
      field(t('title.city'), city);
      const swatches = (list: string[], get: () => string, set: (c: string) => void) => {
        const w = document.createElement('div');
        w.className = 'swatches';
        for (const c of list) {
          const b = document.createElement('button');
          b.type = 'button';
          b.style.background = c;
          b.className = get() === c ? 'on' : '';
          b.addEventListener('click', () => {
            set(c);
            [...w.children].forEach((x) => x.classList.remove('on'));
            b.classList.add('on');
          });
          w.appendChild(b);
        }
        return w;
      };
      const a = choices.appearance;
      const sex = document.createElement('select');
      for (const [v, l] of [['m', t('title.body.m')], ['f', t('title.body.f')]] as const) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = l;
        sex.appendChild(o);
      }
      sex.addEventListener('change', () => (a.sex = sex.value as 'm' | 'f'));
      field(t('title.body'), sex);
      const style = document.createElement('select');
      for (const v of ['curly', 'short', 'cropped', 'long'] as const) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = t(`title.hair.${v}`);
        style.appendChild(o);
      }
      style.addEventListener('change', () => (a.hairStyle = style.value as NewGameChoices['appearance']['hairStyle']));
      field(t('title.hairStyle'), style);
      field(t('title.skin'), swatches(SKINS, () => a.skin, (c) => (a.skin = c)));
      field(t('title.hair'), swatches(HAIRS, () => a.hair, (c) => (a.hair = c)));
      field(t('title.chiton'), swatches(CLOTH, () => a.chiton, (c) => (a.chiton = c)));
      field(t('title.cloak'), swatches(CLOTH, () => a.cloak, (c) => (a.cloak = c)));
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'title-button primary';
      go.textContent = t('title.begin');
      go.setAttribute('data-testid', 'begin');
      go.addEventListener('click', () => {
        root.remove();
        resolve({ kind: 'new', choices });
      });
      form.appendChild(go);
      box.appendChild(form);
      name.focus();
    }
  });
}
