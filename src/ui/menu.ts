import { t } from '../core/i18n';
import { PRESETS, saveSettings, type QualityPreset, type Settings } from '../core/settings';
import { exportSave, formatPlayTime, importSave, listSaves, readSave, SLOTS, writeSave, type SlotId } from '../systems/save';
import { DISCIPLINES, LEVEL_XP, levelOf, type Discipline, type GameState } from '../systems/state';
import codexData from '../../content/codex/en.json';
import skillsData from '../../content/skills/skills.json';

/**
 * Pause menu (Esc / J / M): Journal, Codex & Ideas, Map, Disciplines (skill trees), Settings, Save/Load.
 * Papyrus panels with red-figure accents. The game is paused while it is open.
 */
export type MenuTab = 'journal' | 'codex' | 'map' | 'disciplines' | 'settings' | 'saves';
const TABS: MenuTab[] = ['journal', 'codex', 'map', 'disciplines', 'settings', 'saves'];

export interface MenuHooks {
  state: () => GameState;
  settings: Settings;
  quests: () => { id: string; title: string; step: string | null; state: string; steps: string[] }[];
  drawMap: (canvas: HTMLCanvasElement) => void;
  beforeSave: () => void;
  loadState: (s: GameState) => void;
  applySettings: (s: Settings, needsReload: boolean) => void;
}

export class PauseMenu {
  readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly tabsEl: HTMLDivElement;
  private tab: MenuTab = 'journal';
  private codexSel: string | null = null;

  constructor(
    parent: HTMLElement,
    private readonly hooks: MenuHooks,
  ) {
    this.root = el('div', 'menu');
    this.root.setAttribute('data-testid', 'menu');
    const panel = el('div', 'menu-panel papyrus');
    const title = el('div', 'menu-title');
    title.textContent = t('game.title');
    this.tabsEl = el('div', 'menu-tabs');
    for (const tb of TABS) {
      const b = el<HTMLButtonElement>('button', 'menu-tab');
      b.type = 'button';
      b.textContent = t(`menu.${tb}`);
      b.dataset.tab = tb;
      b.addEventListener('click', () => this.show(tb));
      this.tabsEl.appendChild(b);
    }
    const close = el<HTMLButtonElement>('button', 'menu-close');
    close.type = 'button';
    close.textContent = '×';
    close.title = t('menu.close');
    close.addEventListener('click', () => this.close());
    this.body = el('div', 'menu-body');
    panel.append(title, close, this.tabsEl, this.body);
    this.root.appendChild(panel);
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(tab: MenuTab = this.tab): void {
    this.tab = tab;
    this.root.hidden = false;
    document.exitPointerLock?.();
    for (const b of this.tabsEl.children) (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.tab === tab);
    this.body.replaceChildren(this.render(tab));
  }

  close(): void {
    this.root.hidden = true;
  }

  toggle(tab: MenuTab): void {
    if (this.open && this.tab === tab) this.close();
    else this.show(tab);
  }

  private render(tab: MenuTab): HTMLElement {
    switch (tab) {
      case 'journal':
        return this.journal();
      case 'codex':
        return this.codex();
      case 'map':
        return this.map();
      case 'disciplines':
        return this.disciplines();
      case 'settings':
        return this.settingsTab();
      case 'saves':
        return this.saves();
    }
  }

  private journal(): HTMLElement {
    const wrap = el('div', 'menu-journal');
    const qs = this.hooks.quests();
    const active = qs.filter((q) => q.state === 'active');
    const done = qs.filter((q) => q.state === 'done');
    wrap.appendChild(heading(t('menu.activeQuests')));
    if (!active.length) wrap.appendChild(para(t('menu.noQuests'), 'muted'));
    for (const q of active) {
      const card = el('div', 'quest-card');
      card.append(heading(q.title, 'h3'), para(q.step ?? ''));
      wrap.appendChild(card);
    }
    if (done.length) {
      wrap.appendChild(heading(t('menu.doneQuests')));
      for (const q of done) wrap.appendChild(para(`✓ ${q.title}`, 'muted'));
    }
    const st = this.hooks.state();
    wrap.appendChild(heading(t('menu.tablet')));
    const tablet = el('div', 'wax-tablet');
    const notes = st.data.journal.length ? st.data.journal.map((j) => j.text) : [t('menu.tabletEmpty')];
    for (const n of notes) tablet.appendChild(para(n));
    wrap.appendChild(tablet);
    return wrap;
  }

  private codex(): HTMLElement {
    const st = this.hooks.state();
    const wrap = el('div', 'menu-codex');
    const list = el('div', 'codex-list');
    const view = el('div', 'codex-view');
    const entries = codexData.entries as Record<string, { title: string; category: string; certainty: string; sources: string; text: string }>;
    const ideas = codexData.ideas as Record<string, { title: string; sources: string; text: string }>;
    const items: { id: string; title: string; group: string }[] = [
      ...st.data.discovered.codex.filter((c) => entries[c]).map((c) => ({ id: `e:${c}`, title: entries[c]!.title, group: t(`codex.cat.${entries[c]!.category}`) })),
      ...st.data.ideas.filter((i) => ideas[i]).map((i) => ({ id: `i:${i}`, title: ideas[i]!.title, group: t('codex.cat.ideas') })),
    ];
    if (!items.length) list.appendChild(para(t('menu.codexEmpty'), 'muted'));
    let group = '';
    for (const it of items.sort((a, b) => a.group.localeCompare(b.group))) {
      if (it.group !== group) {
        group = it.group;
        list.appendChild(heading(group, 'h4'));
      }
      const b = el<HTMLButtonElement>('button', 'codex-item');
      b.type = 'button';
      b.textContent = it.title;
      b.addEventListener('click', () => {
        this.codexSel = it.id;
        this.show('codex');
      });
      if (this.codexSel === it.id) b.classList.add('active');
      list.appendChild(b);
    }
    const sel = this.codexSel ?? items[0]?.id;
    if (sel) {
      const [kind, id] = sel.split(':') as ['e' | 'i', string];
      const e = kind === 'e' ? entries[id] : ideas[id];
      if (e) {
        view.append(heading(e.title, 'h3'));
        if ('certainty' in e) {
          const badge = el('span', `certainty certainty-${e.certainty}`);
          badge.textContent = t(`certainty.${e.certainty}`);
          view.appendChild(badge);
        }
        view.append(para(e.text), para(`${t('codex.sources')}: ${e.sources}`, 'muted small'));
      }
    }
    wrap.append(list, view);
    return wrap;
  }

  private map(): HTMLElement {
    const c = document.createElement('canvas');
    c.className = 'menu-map';
    c.width = 900;
    c.height = 900;
    this.hooks.drawMap(c);
    return c;
  }

  private disciplines(): HTMLElement {
    const st = this.hooks.state();
    const wrap = el('div', 'menu-disciplines');
    const skills = skillsData.skills as { id: string; discipline: Discipline; level: number; parent?: string; title: string; text: string }[];
    for (const d of DISCIPLINES) {
      const xp = st.data.xp[d];
      const lvl = levelOf(xp);
      const next = LEVEL_XP[lvl] ?? LEVEL_XP[LEVEL_XP.length - 1]!;
      const prev = LEVEL_XP[lvl - 1] ?? 0;
      const col = el('div', 'discipline');
      col.appendChild(heading(`${t(`discipline.${d}`)} · ${lvl}`, 'h3'));
      const bar = el('div', 'xp-bar');
      const fill = el('div', 'xp-fill');
      fill.style.width = `${Math.min(100, ((xp - prev) / Math.max(1, next - prev)) * 100)}%`;
      bar.appendChild(fill);
      col.append(bar, para(t(`discipline.${d}.blurb`), 'muted small'));
      const used = st.data.skills.filter((s) => skills.find((k) => k.id === s)?.discipline === d).length;
      const points = Math.max(0, lvl - 1 - used);
      col.appendChild(para(t('menu.skillPoints', { n: points }), 'small'));
      for (const sk of skills.filter((k) => k.discipline === d)) {
        const owned = st.data.skills.includes(sk.id);
        const can = !owned && points > 0 && lvl >= sk.level && (!sk.parent || st.data.skills.includes(sk.parent));
        const node = el<HTMLButtonElement>('button', `skill ${owned ? 'owned' : can ? 'available' : 'locked'}`);
        node.type = 'button';
        node.disabled = !can;
        node.innerHTML = '';
        const tt = el('b', '');
        tt.textContent = sk.title;
        const ds = el('span', '');
        ds.textContent = ` ${sk.text} (${t('menu.levelReq', { n: sk.level })})`;
        node.append(tt, ds);
        node.addEventListener('click', () => {
          if (!can) return;
          st.data.skills.push(sk.id);
          st.runCommand(`toast ${sk.title}`);
          this.show('disciplines');
        });
        col.appendChild(node);
      }
      wrap.appendChild(col);
    }
    return wrap;
  }

  private settingsTab(): HTMLElement {
    const s = this.hooks.settings;
    const wrap = el('div', 'menu-settings');
    const row = (label: string, control: HTMLElement) => {
      const r = el('label', 'setting-row');
      const l = el('span', '');
      l.textContent = label;
      r.append(l, control);
      wrap.appendChild(r);
    };
    const select = (value: string, options: [string, string][], onChange: (v: string) => void) => {
      const sel = document.createElement('select');
      for (const [v, label] of options) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = label;
        o.selected = v === value;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => onChange(sel.value));
      return sel;
    };
    const range = (value: number, min: number, max: number, step: number, onChange: (v: number) => void) => {
      const r = document.createElement('input');
      r.type = 'range';
      r.min = String(min);
      r.max = String(max);
      r.step = String(step);
      r.value = String(value);
      r.addEventListener('input', () => onChange(Number(r.value)));
      return r;
    };
    const check = (value: boolean, onChange: (v: boolean) => void) => {
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = value;
      c.addEventListener('change', () => onChange(c.checked));
      return c;
    };
    const commit = (reload = false) => {
      saveSettings(s);
      this.hooks.applySettings(s, reload);
    };
    wrap.appendChild(heading(t('settings.graphics'), 'h3'));
    row(
      t('settings.preset'),
      select(s.graphics.preset, (['low', 'medium', 'high', 'ultra'] as QualityPreset[]).map((p) => [p, t(`settings.preset.${p}`)]), (v) => {
        const p = PRESETS[v as QualityPreset];
        s.graphics = { ...p, post: { ...p.post } };
        commit(true);
      }),
    );
    row(t('settings.renderScale'), range(s.graphics.renderScale, 0.5, 1, 0.05, (v) => ((s.graphics.renderScale = v), commit())));
    row(t('settings.shadows'), check(s.graphics.shadows, (v) => ((s.graphics.shadows = v), commit(true))));
    row(t('settings.ao'), check(s.graphics.post.ao, (v) => ((s.graphics.post.ao = v), commit(true))));
    row(t('settings.bloom'), check(s.graphics.post.bloom, (v) => ((s.graphics.post.bloom = v), commit(true))));
    row(t('settings.shafts'), check(s.graphics.post.godRays, (v) => ((s.graphics.post.godRays = v), commit(true))));
    row(t('settings.vegetation'), range(s.graphics.vegetationDensity, 0.2, 1, 0.05, (v) => ((s.graphics.vegetationDensity = v), commit(true))));
    wrap.appendChild(heading(t('settings.accessibility'), 'h3'));
    row(t('settings.textScale'), range(s.accessibility.textScale, 0.8, 1.6, 0.05, (v) => ((s.accessibility.textScale = v), commit())));
    row(t('settings.reducedMotion'), check(s.accessibility.reducedMotion, (v) => ((s.accessibility.reducedMotion = v), commit())));
    wrap.appendChild(para(t('settings.reloadNote'), 'muted small'));
    return wrap;
  }

  private saves(): HTMLElement {
    const wrap = el('div', 'menu-saves');
    const metas = new Map(listSaves().map((m) => [m.slot, m]));
    for (const slot of SLOTS) {
      const m = metas.get(slot);
      const r = el('div', 'save-row');
      const label = el('div', 'save-label');
      label.textContent = `${t(`save.${slot}`)} — ${m ? `${m.name}, ${t(`chapter.${m.chapter}`)}, ${formatPlayTime(m.playSeconds)}, ${new Date(m.savedAt).toLocaleString()}` : t('save.empty')}`;
      r.appendChild(label);
      if (slot !== 'auto') {
        r.appendChild(
          button(t('save.save'), () => {
            this.hooks.beforeSave();
            writeSave(slot as SlotId, this.hooks.state());
            this.show('saves');
          }),
        );
      }
      if (m) {
        r.appendChild(
          button(t('save.load'), () => {
            const sv = readSave(slot);
            if (sv) {
              this.hooks.loadState(sv.state);
              this.close();
            }
          }),
        );
      }
      wrap.appendChild(r);
    }
    const io = el('div', 'save-io');
    io.appendChild(
      button(t('save.export'), () => {
        this.hooks.beforeSave();
        const url = URL.createObjectURL(exportSave(this.hooks.state()));
        const a = document.createElement('a');
        a.href = url;
        a.download = `akademeia-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }),
    );
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'application/json,.json';
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        this.hooks.loadState(importSave(await f.text()));
        this.close();
      } catch (err) {
        alertMsg.textContent = String((err as Error).message);
      }
    });
    const alertMsg = el('div', 'muted small');
    io.append(button(t('save.import'), () => file.click()), alertMsg);
    wrap.appendChild(io);
    return wrap;
  }
}

function el<T extends HTMLElement = HTMLDivElement>(tag: string, cls: string): T {
  const e = document.createElement(tag) as T;
  if (cls) e.className = cls;
  return e;
}
function heading(text: string, tag = 'h2'): HTMLElement {
  const h = document.createElement(tag);
  h.textContent = text;
  return h;
}
function para(text: string, cls = ''): HTMLElement {
  const p = document.createElement('p');
  if (cls) p.className = cls;
  p.textContent = text;
  return p;
}
function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'menu-button';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
