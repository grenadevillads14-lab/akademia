import text from '../../content/puzzles/text.json';
import waterData from '../../content/puzzles/waterworks.json';
import { availableMoves, playMove, startDebate, type DebateDef, type DebateState } from './debate';
import { allowed, evaluateMeno, findSquares, MENO_GIVEN, type Pt, type Seg } from './meno';
import { simulate, type WaterNetwork, type WaterSetting } from './waterworks';

/**
 * Overlays for the puzzles (Meno square, waterworks, debates) and lore cards.
 * Each resolves when the player finishes or leaves; the game applies rewards from content.
 */
const T = text;

export function overlay(cls: string): { root: HTMLDivElement; box: HTMLDivElement; close: () => void } {
  const root = document.createElement('div');
  root.className = `puzzle ${cls}`;
  root.setAttribute('data-testid', 'puzzle');
  const box = document.createElement('div');
  box.className = 'puzzle-box papyrus';
  root.appendChild(box);
  document.getElementById('app')!.appendChild(root);
  document.exitPointerLock?.();
  return { root, box, close: () => root.remove() };
}

export function btn(label: string, fn: () => void, cls = 'menu-button'): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}

export function h(tag: string, txt: string, cls = ''): HTMLElement {
  const e = document.createElement(tag);
  e.textContent = txt;
  if (cls) e.className = cls;
  return e;
}

/** The Meno square drawn in the dust. Resolves true when solved. */
export function openMeno(): Promise<boolean> {
  return new Promise((resolve) => {
    const { box, close } = overlay('puzzle-meno');
    box.append(h('h2', T.meno.title), h('p', T.meno.intro, 'puzzle-intro'));
    const N = 4;
    const size = 440;
    const pad = 50;
    const step = (size - pad * 2) / N;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.className = 'meno-canvas';
    const fb = h('p', T.meno.feedback.given, 'puzzle-feedback');
    const drawn: Seg[] = [];
    let start: Pt | null = null;
    let hover: Pt | null = null;
    let hintLevel = 0;
    let solved = false;
    const toPt = (ev: MouseEvent): Pt | null => {
      const r = c.getBoundingClientRect();
      const x = ((ev.clientX - r.left) / r.width) * size;
      const y = ((ev.clientY - r.top) / r.height) * size;
      const i = Math.round((x - pad) / step);
      const j = Math.round((size - pad - y) / step);
      if (i < 0 || j < 0 || i > N || j > N) return null;
      if (Math.hypot(pad + i * step - x, size - pad - j * step - y) > step * 0.35) return null;
      return [i, j];
    };
    const P = (p: Pt) => [pad + p[0] * step, size - pad - p[1] * step] as const;
    const draw = () => {
      const g = c.getContext('2d')!;
      // Dust.
      g.fillStyle = '#cdb48a';
      g.fillRect(0, 0, size, size);
      for (let k = 0; k < 900; k++) {
        g.fillStyle = `rgba(${90 + (k % 40)},${70 + (k % 30)},${40},0.12)`;
        g.fillRect((k * 97) % size, (k * 57) % size, 2, 2);
      }
      const status = evaluateMeno(drawn, N);
      // Highlight squares found.
      for (const sq of findSquares([...MENO_GIVEN, ...drawn], N)) {
        g.fillStyle = sq.area === 8 ? 'rgba(80,110,60,0.35)' : sq.area === 4 ? 'rgba(90,60,30,0.12)' : 'rgba(140,59,42,0.18)';
        g.beginPath();
        sq.corners.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
        g.closePath();
        g.fill();
        const cx = sq.corners.reduce((s, p) => s + P(p)[0], 0) / 4;
        const cy = sq.corners.reduce((s, p) => s + P(p)[1], 0) / 4;
        g.fillStyle = '#3a2a1a';
        g.font = '16px serif';
        g.textAlign = 'center';
        g.fillText(`${sq.area}`, cx, cy + 5);
      }
      // Lines scratched in the dust.
      const line = (s: Seg, color: string, w: number) => {
        g.strokeStyle = color;
        g.lineWidth = w;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(...P(s[0]));
        g.lineTo(...P(s[1]));
        g.stroke();
      };
      for (const s of MENO_GIVEN) line(s, '#4a3018', 4);
      for (const s of drawn) line(s, '#2a1a0c', 3.5);
      if (start && hover && allowed([start, hover])) line([start, hover], 'rgba(42,26,12,0.4)', 3);
      // Points.
      for (let i = 0; i <= N; i++) {
        for (let j = 0; j <= N; j++) {
          const [x, y] = P([i, j]);
          g.fillStyle = start && start[0] === i && start[1] === j ? '#b4582f' : '#3a2a1a';
          g.beginPath();
          g.arc(x, y, 4, 0, Math.PI * 2);
          g.fill();
        }
      }
      fb.textContent = T.meno.feedback[status.feedback];
      if (status.solved && !solved) {
        solved = true;
        actions.replaceChildren(btn(T.ui.done, () => (close(), resolve(true))));
      }
    };
    c.addEventListener('mousemove', (e) => {
      hover = toPt(e);
      draw();
    });
    c.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        drawn.pop();
        start = null;
        draw();
        return;
      }
      const p = toPt(e);
      if (!p) return;
      if (!start) start = p;
      else {
        if ((start[0] !== p[0] || start[1] !== p[1]) && allowed([start, p])) drawn.push([start, p]);
        start = null;
      }
      draw();
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    const hintEl = h('p', '', 'puzzle-hint');
    const actions = document.createElement('div');
    actions.className = 'puzzle-actions';
    actions.append(
      btn(T.ui.hint, () => {
        hintEl.textContent = T.meno.hints[Math.min(hintLevel, T.meno.hints.length - 1)]!;
        hintLevel++;
      }),
      btn(T.ui.undo, () => (drawn.pop(), draw())),
      btn(T.ui.erase, () => (drawn.splice(0), draw())),
      btn(T.ui.leave, () => (close(), resolve(false))),
    );
    box.append(c, fb, hintEl, actions);
    draw();
  });
}

/** The waterworks plan. Resolves with the final setting if solved. */
export function openWaterworks(): Promise<WaterSetting | null> {
  return new Promise((resolve) => {
    const net = waterData as unknown as WaterNetwork;
    const setting: WaterSetting = JSON.parse(JSON.stringify(waterData.start)) as WaterSetting;
    const { box, close } = overlay('puzzle-water');
    box.append(h('h2', T.waterworks.title), h('p', T.waterworks.intro, 'puzzle-intro'));
    const W = 760;
    const H = 400;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    c.className = 'water-canvas';
    // Schematic node positions (left: intake, right: sinks).
    const pos: Record<string, [number, number]> = {
      intake: [40, 200], J1: [170, 200], J2: [360, 95], J3: [360, 305],
      planes_east: [520, 45], figs: [520, 135], baths: [520, 200], planes_west: [520, 270], reading: [520, 355],
    };
    const status = h('div', '', 'water-status');
    const hintEl = h('p', '', 'puzzle-hint');
    let hintLevel = 0;
    let lastHits: { x: number; y: number; r: number; kind: 'sluice' | 'pipe'; id: string }[] = [];
    const frac = (v: number) => {
      for (const d of [1, 2, 3, 4, 6, 8, 9, 12]) {
        const n = Math.round(v * d);
        if (Math.abs(n / d - v) < 1e-6) return n === 0 ? '0' : d === 1 ? `${n}` : `${n}/${d}`;
      }
      return pct(v);
    };
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const share = (v: number) => (v <= 0 ? '0' : `${frac(v)} (${pct(v)})`);
    const draw = () => {
      const g = c.getContext('2d')!;
      g.fillStyle = '#efe0bd';
      g.fillRect(0, 0, W, H);
      const r = simulate(net, setting);
      lastHits = [];
      for (const e of net.edges) {
        const [x0, y0] = pos[e.from]!;
        const [x1, y1] = pos[e.to]!;
        const flow = r.edgeFlow[e.id] ?? 0;
        const open = (!e.sluice || setting.sluices[e.sluice]) && (!e.pipe || setting.pipes[e.pipe[0]] === e.pipe[1]);
        g.strokeStyle = flow > 0 ? '#3d6a8a' : open ? '#a99772' : 'rgba(120,100,70,0.35)';
        g.lineWidth = 3 + flow * 22;
        g.setLineDash(open ? [] : [6, 6]);
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        g.setLineDash([]);
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        if (flow > 0) {
          g.fillStyle = '#1c3a52';
          g.font = '13px serif';
          g.fillText(frac(flow), mx + 6, my - 8);
        }
        if (e.sluice) {
          g.fillStyle = setting.sluices[e.sluice] ? '#4f6a3a' : '#8c3b2a';
          g.fillRect(mx - 9, my - 9, 18, 18);
          g.fillStyle = '#fff';
          g.font = '11px sans-serif';
          g.fillText(setting.sluices[e.sluice] ? '◫' : '■', mx - 5, my + 4);
          lastHits.push({ x: mx, y: my, r: 14, kind: 'sluice', id: e.sluice });
        }
      }
      for (const [pid] of Object.entries(net.pipes)) {
        const [x, y] = pos.J3!;
        g.strokeStyle = '#b4582f';
        g.lineWidth = 6;
        g.beginPath();
        const toward = setting.pipes[pid] === 'grove' ? pos.planes_west! : pos.reading!;
        const ang = Math.atan2(toward[1] - y, toward[0] - x);
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(ang) * 34, y + Math.sin(ang) * 34);
        g.stroke();
        lastHits.push({ x, y, r: 20, kind: 'pipe', id: pid });
      }
      for (const n of net.nodes) {
        const [x, y] = pos[n.id]!;
        g.fillStyle = n.kind === 'sink' ? (r.problems.some((p) => p.node === n.id) ? '#b4582f' : '#4f6a3a') : '#3a2a1a';
        g.beginPath();
        g.arc(x, y, n.kind === 'junction' ? 7 : 10, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#2a1d14';
        g.font = '13px serif';
        if (n.kind === 'sink') {
          g.textAlign = 'left';
          g.fillText(n.label, x + 16, y - 2);
          g.font = '12px serif';
          g.fillStyle = '#5a4630';
          g.fillText(`${share(r.arrive[n.id] ?? 0)}${n.need !== undefined ? ` · ${T.waterworks.labels.need} ${pct(n.need)}` : ''}${n.max !== undefined && n.max > 0 ? ` · ${T.waterworks.labels.max} ${pct(n.max)}` : ''}`, x + 16, y + 13);
        } else {
          g.textAlign = n.kind === 'source' ? 'left' : 'center';
          g.fillText(n.label, n.kind === 'source' ? x - 20 : x, n.kind === 'source' ? y + 30 : y - 16);
        }
        g.textAlign = 'left';
      }
      status.replaceChildren(
        ...r.problems.map((p) => h('div', `${net.nodes.find((n) => n.id === p.node)!.label} ${T.waterworks.problems[p.issue]}`, 'water-problem')),
      );
      if (r.ok) {
        status.replaceChildren(h('div', T.waterworks.labels.solved, 'water-ok'));
        actions.replaceChildren(btn(T.ui.done, () => (close(), resolve(setting))));
      }
    };
    c.addEventListener('click', (e) => {
      const rect = c.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * W;
      const y = ((e.clientY - rect.top) / rect.height) * H;
      const hit = lastHits.find((hh) => Math.hypot(hh.x - x, hh.y - y) < hh.r);
      if (!hit) return;
      if (hit.kind === 'sluice') setting.sluices[hit.id] = !setting.sluices[hit.id];
      else {
        const opts = net.pipes[hit.id]!;
        setting.pipes[hit.id] = opts[(opts.indexOf(setting.pipes[hit.id]!) + 1) % opts.length]!;
      }
      draw();
    });
    const actions = document.createElement('div');
    actions.className = 'puzzle-actions';
    actions.append(
      btn(T.ui.hint, () => {
        hintEl.textContent = T.waterworks.hints[Math.min(hintLevel, T.waterworks.hints.length - 1)]!;
        hintLevel++;
      }),
      btn(T.ui.leave, () => (close(), resolve(null))),
    );
    box.append(c, status, hintEl, actions);
    draw();
  });
}

/** A Socratic debate. Resolves with the outcome. */
export function openDebate(def: DebateDef, names: (id: string) => string, has: (req: { idea?: string; skill?: string }) => boolean, bonus = 0): Promise<'won' | 'lost' | 'left'> {
  return new Promise((resolve) => {
    const { box, close } = overlay('puzzle-debate');
    box.append(h('h2', def.title), h('p', def.question, 'puzzle-intro'));
    const meters = document.createElement('div');
    meters.className = 'debate-meters';
    const log = document.createElement('div');
    log.className = 'debate-log';
    const moves = document.createElement('div');
    moves.className = 'debate-moves';
    let st: DebateState = startDebate(def, bonus);
    const meter = (label: string, v: number, max: number, cls: string) => {
      const m = document.createElement('div');
      m.className = `debate-meter ${cls}`;
      m.append(h('span', label));
      const pips = document.createElement('span');
      pips.className = 'pips';
      for (let i = 0; i < max; i++) pips.appendChild(h('i', '', i < v ? 'on' : ''));
      m.appendChild(pips);
      return m;
    };
    const render = () => {
      meters.replaceChildren(
        meter(`${names(def.opponent)}: ${T.ui.consistency}`, st.opp, def.opponentConsistency, 'opp'),
        meter(`${T.ui.you}: ${T.ui.consistency}`, st.self, def.playerConsistency + bonus, 'self'),
      );
      log.replaceChildren(...st.log.map((l) => h('p', `${l.who === 'player' ? T.ui.you : names(def.opponent)}: ${l.text}`, `debate-line ${l.who}`)));
      log.scrollTop = log.scrollHeight;
      if (st.outcome !== 'ongoing') {
        moves.replaceChildren(h('h3', T.ui.lesson), h('p', def.lesson), btn(T.ui.done, () => (close(), resolve(st.outcome as 'won' | 'lost'))));
        return;
      }
      moves.replaceChildren(
        ...availableMoves(def, st, has).map((m) => {
          const b = btn(m.text, () => {
            st = playMove(def, st, m.id);
            render();
          }, 'debate-move');
          if (m.locked) {
            b.disabled = true;
            b.title = `${T.ui.locked}: ${m.requires?.skill ?? m.requires?.idea}`;
            b.classList.add('locked');
          }
          return b;
        }),
        btn(T.ui.leave, () => (close(), resolve('left'))),
      );
    };
    box.append(meters, log, moves);
    render();
  });
}

/** A lore card (moriai, inscriptions). */
export function openLoreCard(title: string, body: string, source: string, certainty: string, certaintyLabel: string): Promise<void> {
  return new Promise((resolve) => {
    const { box, close } = overlay('puzzle-lore');
    const badge = h('span', certaintyLabel, `certainty certainty-${certainty}`);
    box.append(h('h2', title), badge, h('p', body), h('p', source, 'muted small'), btn(T.ui.done, () => (close(), resolve())));
  });
}
