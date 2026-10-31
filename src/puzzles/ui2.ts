import * as THREE from 'three';
import text from '../../content/puzzles/act2.json';
import base from '../../content/puzzles/text.json';
import { platoMachine } from './delian';
import { checkPlacement, divide, SEGMENTS, type Segment } from './dividedLine';
import { ELEMENT, interiorAngle, tryVertex, type SolidId } from './solids';
import { path, retrogrades } from './spheres';
import { btn, h, overlay } from './ui';

/** Overlays for the Act 2 puzzles: the five solids, Eudoxus' spheres, the Delian problem, the Divided Line. */
const T = text;
const U = base.ui;

function hints(list: readonly string[]): { el: HTMLElement; button: HTMLButtonElement } {
  const el = h('p', '', 'puzzle-hint');
  let level = 0;
  const button = btn(U.hint, () => {
    el.textContent = list[Math.min(level, list.length - 1)]!;
    level++;
  });
  return { el, button };
}

function actions(...els: HTMLElement[]): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'puzzle-actions';
  d.append(...els);
  return d;
}

function canvas(w: number, hgt: number, cls: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt;
  c.className = cls;
  return c;
}

const SOLID_GEOMETRY: Record<SolidId, () => THREE.BufferGeometry> = {
  tetrahedron: () => new THREE.TetrahedronGeometry(1),
  octahedron: () => new THREE.OctahedronGeometry(1),
  icosahedron: () => new THREE.IcosahedronGeometry(1),
  cube: () => new THREE.BoxGeometry(1.15, 1.15, 1.15),
  dodecahedron: () => new THREE.DodecahedronGeometry(1),
};

/** Edges of a solid (from three's geometry), for a hand-drawn wireframe. */
function solidEdges(id: SolidId): [THREE.Vector3, THREE.Vector3][] {
  const g = new THREE.EdgesGeometry(SOLID_GEOMETRY[id](), 1);
  const p = g.getAttribute('position');
  const out: [THREE.Vector3, THREE.Vector3][] = [];
  for (let i = 0; i < p.count; i += 2) out.push([new THREE.Vector3().fromBufferAttribute(p, i), new THREE.Vector3().fromBufferAttribute(p, i + 1)]);
  g.dispose();
  return out;
}

/** Build the corners of the five solids; resolves true once all five were found. */
export function openSolids(): Promise<boolean> {
  return new Promise((resolve) => {
    const S = T.solids;
    const { box, close } = overlay('puzzle-solids');
    box.append(h('h2', S.title), h('p', S.intro, 'puzzle-intro'));
    const c = canvas(640, 300, 'solids-canvas');
    let sides = 3;
    let count = 3;
    const found = new Set<SolidId>();
    let spin = 0;
    let raf = 0;
    const controls = document.createElement('div');
    controls.className = 'solids-controls';
    const polyRow = document.createElement('div');
    for (const [k, label] of Object.entries(S.polygons)) {
      const b = btn(label, () => {
        sides = Number(k);
        draw();
      }, 'debate-move solids-poly');
      b.dataset.sides = k;
      polyRow.appendChild(b);
    }
    const countRow = document.createElement('div');
    countRow.append(h('span', `${S.count}: `));
    for (let n = 2; n <= 7; n++) {
      const b = btn(String(n), () => {
        count = n;
        draw();
      }, 'debate-move solids-count');
      b.dataset.count = String(n);
      countRow.appendChild(b);
    }
    controls.append(polyRow, countRow);
    const verdict = h('p', '', 'puzzle-feedback');
    const tally = h('p', '', 'muted');
    const hint = hints(S.hints);
    const act = actions(hint.button, btn(U.leave, () => finish(false)));
    const finish = (ok: boolean) => {
      cancelAnimationFrame(raf);
      close();
      resolve(ok);
    };

    const draw = () => {
      for (const b of polyRow.children) (b as HTMLElement).classList.toggle('active', Number((b as HTMLElement).dataset.sides) === sides);
      for (const b of countRow.querySelectorAll('button')) b.classList.toggle('active', Number(b.dataset.count) === count);
      const r = tryVertex({ sides, count });
      if (r.outcome === 'solid' && r.solid) found.add(r.solid);
      let msg = `${S.outcome[r.outcome]} (${Math.round(r.angleSum)}°)`;
      if (r.solid) msg += ` ${S.solidNames[r.solid]}: ${r.faces} faces, ${r.edges} edges, ${r.vertices} corners. ${S.element[ELEMENT[r.solid]]}`;
      verdict.textContent = msg;
      tally.textContent = S.found.replace('{n}', String(found.size));
      if (found.size === 5 && !act.dataset.done) {
        act.dataset.done = '1';
        verdict.textContent += ` ${S.sixth}`;
        act.replaceChildren(btn(U.done, () => finish(true)));
      }
    };

    const render = () => {
      const g = c.getContext('2d')!;
      g.fillStyle = '#efe0bd';
      g.fillRect(0, 0, c.width, c.height);
      // Left: the corner laid flat. Faces fan around a point; the gap (or overlap) is what folds.
      const cx = 170;
      const cy = 160;
      const R = 110;
      const ang = (interiorAngle(sides) * Math.PI) / 180;
      let a0 = -Math.PI / 2;
      for (let k = 0; k < count; k++) {
        const over = (k + 1) * interiorAngle(sides) > 360;
        g.fillStyle = over ? 'rgba(140, 59, 42, 0.45)' : k % 2 ? 'rgba(180, 88, 47, 0.35)' : 'rgba(201, 146, 46, 0.4)';
        g.strokeStyle = '#3a2a1a';
        g.lineWidth = 1.5;
        // A regular polygon with one corner at the centre, sitting in the wedge [a0, a0 + ang].
        const pts: [number, number][] = [[cx, cy]];
        const side = R * 0.62;
        let px = cx;
        let py = cy;
        let dir = a0;
        for (let s = 0; s < sides - 1; s++) {
          px += Math.cos(dir) * side;
          py += Math.sin(dir) * side;
          pts.push([px, py]);
          dir += Math.PI - ang;
        }
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.fill();
        g.stroke();
        a0 += ang;
      }
      const defect = 2 * Math.PI - count * ang;
      if (defect > 1e-6) {
        g.strokeStyle = '#2f4a5c';
        g.setLineDash([4, 4]);
        g.beginPath();
        g.arc(cx, cy, R * 0.3, a0, a0 + defect);
        g.stroke();
        g.setLineDash([]);
      }
      // Right: the solid itself, slowly turning, when the corner closes.
      const r = tryVertex({ sides, count });
      if (r.solid) {
        spin += 0.01;
        const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.5, spin, 0.2));
        const P = (v: THREE.Vector3) => {
          const w = v.clone().applyMatrix4(rot);
          const s = 3 / (4 + w.z);
          return [470 + w.x * 95 * s, 150 - w.y * 95 * s] as const;
        };
        g.strokeStyle = '#3a2a1a';
        g.lineWidth = 1.6;
        for (const [a, b] of solidEdges(r.solid)) {
          g.beginPath();
          g.moveTo(...P(a));
          g.lineTo(...P(b));
          g.stroke();
        }
      } else {
        g.fillStyle = '#7a6a50';
        g.font = 'italic 16px serif';
        g.textAlign = 'center';
        g.fillText('—', 470, 150);
        g.textAlign = 'left';
      }
      raf = requestAnimationFrame(render);
    };
    box.append(c, controls, verdict, tally, hint.el, act);
    draw();
    render();
  });
}

/** Fit Eudoxus' spheres to the star of Zeus (Jupiter); resolves true when the loop matches. */
export function openSpheres(): Promise<boolean> {
  return new Promise((resolve) => {
    const S = T.spheres;
    const { box, close } = overlay('puzzle-spheres');
    box.append(h('h2', S.title), h('p', S.intro, 'puzzle-intro'), h('p', S.target, 'muted'));
    const c = canvas(700, 260, 'spheres-canvas');
    const params = { inclination: 0, synodic: 300, zodiacal: 4332 };
    const slider = (label: string, min: number, max: number, step: number, key: 'inclination' | 'synodic') => {
      const wrap = document.createElement('label');
      wrap.className = 'puzzle-slider';
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(params[key]);
      const out = h('b', '');
      input.addEventListener('input', () => {
        params[key] = Number(input.value);
        draw();
      });
      wrap.append(h('span', label), input, out);
      return { wrap, out };
    };
    const inc = slider(S.inclination, 0, 40, 0.5, 'inclination');
    const syn = slider(S.synodic, 200, 800, 1, 'synodic');
    const status = h('p', '', 'puzzle-feedback');
    const hint = hints(S.hints);
    const act = actions(hint.button, btn(U.leave, () => (close(), resolve(false))));
    let solved = false;
    const draw = () => {
      inc.out.textContent = `${params.inclination.toFixed(1)}°`;
      syn.out.textContent = `${params.synodic} d`;
      const days = 3 * 365;
      const pts = path(params, days, 3);
      const g = c.getContext('2d')!;
      g.fillStyle = '#16202c';
      g.fillRect(0, 0, c.width, c.height);
      // Faint stars.
      for (let k = 0; k < 140; k++) {
        g.fillStyle = `rgba(255, 248, 225, ${0.25 + ((k * 37) % 10) / 20})`;
        g.fillRect((k * 151) % c.width, (k * 89) % c.height, 1.5, 1.5);
      }
      // Ecliptic.
      g.strokeStyle = 'rgba(201, 146, 46, 0.45)';
      g.setLineDash([6, 6]);
      g.beginPath();
      g.moveTo(0, c.height / 2);
      g.lineTo(c.width, c.height / 2);
      g.stroke();
      g.setLineDash([]);
      const lon0 = pts[0]![0];
      const lonSpan = Math.max(30, pts[pts.length - 1]![0] - lon0 + 10);
      // East is to the left on a sky map facing south.
      const X = (lon: number) => c.width - 20 - ((lon - lon0) / lonSpan) * (c.width - 40);
      const Y = (lat: number) => c.height / 2 - lat * 18;
      g.strokeStyle = '#ffd27a';
      g.lineWidth = 2;
      g.beginPath();
      pts.forEach(([lon, lat], i) => (i ? g.lineTo(X(lon), Y(lat)) : g.moveTo(X(lon), Y(lat))));
      g.stroke();
      const r = retrogrades(params, days);
      if (r.loops === 0) status.textContent = S.none;
      else status.textContent = S.model.replace('{arc}', r.arc.toFixed(1)).replace('{days}', r.duration.toFixed(0)).replace('{loops}', String(r.loops));
      const ok = r.loops === 3 && Math.abs(r.arc - 10) < 2 && Math.abs(r.duration - 121) < 15;
      if (ok && !solved) {
        solved = true;
        status.textContent += ` ${S.close}`;
        act.replaceChildren(btn(U.done, () => (close(), resolve(true))));
      }
    };
    box.append(c, inc.wrap, syn.wrap, status, hint.el, act);
    draw();
  });
}

/** The Delian problem: count the cubes, then slide Plato's square. */
export function openDelian(): Promise<boolean> {
  return new Promise((resolve) => {
    const D = T.delian;
    const { box, close } = overlay('puzzle-delian');
    box.append(h('h2', D.title), h('p', D.intro, 'puzzle-intro'));
    const stage = document.createElement('div');
    box.appendChild(stage);
    const leave = btn(U.leave, () => (close(), resolve(false)));
    const stage1 = () => {
      const fb = h('p', '', 'puzzle-feedback');
      const opts = document.createElement('div');
      opts.className = 'puzzle-actions';
      for (const a of D.stage1Answers) {
        opts.appendChild(
          btn(a, () => {
            if (a === '8') {
              fb.textContent = D.stage1Right;
              opts.replaceChildren(btn(T.ui.next, stage2));
            } else fb.textContent = D.stage1Wrong;
          }, 'debate-move'),
        );
      }
      stage.replaceChildren(h('p', D.stage1), opts, fb, actions(leave));
    };
    const stage2 = () => {
      const c = canvas(520, 360, 'delian-canvas');
      const a = 1;
      const b = 2;
      let tpos = 1.1;
      const fb = h('p', '', 'puzzle-feedback');
      const hint = hints(D.hints);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0.8';
      input.max = '2.2';
      input.step = '0.002';
      input.value = String(tpos);
      const wrap = document.createElement('label');
      wrap.className = 'puzzle-slider';
      wrap.append(h('span', D.slider), input);
      const act = actions(hint.button, leave);
      let solved = false;
      const draw = () => {
        const m = platoMachine(a, b, tpos);
        const g = c.getContext('2d')!;
        g.fillStyle = '#efe0bd';
        g.fillRect(0, 0, c.width, c.height);
        const s = 90;
        const ox = 190;
        const oy = 170;
        const P = (p: readonly [number, number]) => [ox + p[0] * s, oy - p[1] * s] as const;
        g.strokeStyle = '#7a6a50';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(10, oy);
        g.lineTo(c.width - 10, oy);
        g.moveTo(ox, 10);
        g.lineTo(ox, c.height - 10);
        g.stroke();
        const dot = (p: readonly [number, number], label: string) => {
          g.fillStyle = '#3a2a1a';
          g.beginPath();
          g.arc(...P(p), 4, 0, Math.PI * 2);
          g.fill();
          g.font = '15px serif';
          g.fillText(label, P(p)[0] + 6, P(p)[1] - 6);
        };
        // The carpenter's square: X–Y–B.
        g.strokeStyle = '#8c3b2a';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(...P(m.X));
        g.lineTo(...P(m.Y));
        g.lineTo(...P(m.B));
        g.stroke();
        // The line from A to X: square at X when solved.
        g.strokeStyle = Math.abs(m.error) < 0.004 ? '#4f6a3a' : '#2f4a5c';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(...P(m.A));
        g.lineTo(...P(m.X));
        g.stroke();
        dot([0, 0], 'O');
        dot(m.A, 'A (a)');
        dot(m.B, 'B (2a)');
        dot(m.X, 'X');
        dot(m.Y, 'Y');
        const deg = (Math.acos(Math.max(-1, Math.min(1, m.error))) * 180) / Math.PI;
        fb.textContent = D.angle.replace('{deg}', deg.toFixed(1));
        if (Math.abs(m.error) < 0.004 && !solved) {
          solved = true;
          fb.textContent += ` ${D.solved}`;
          act.replaceChildren(btn(U.done, () => (close(), resolve(true))));
        }
      };
      input.addEventListener('input', () => {
        tpos = Number(input.value);
        draw();
      });
      stage.replaceChildren(h('p', D.stage2), c, wrap, fb, hint.el, act);
      draw();
    };
    stage1();
  });
}

/** Sort things onto the Divided Line. */
export function openDividedLine(): Promise<boolean> {
  return new Promise((resolve) => {
    const L = T.dividedLine;
    const { box, close } = overlay('puzzle-line');
    box.append(h('h2', L.title), h('p', L.intro, 'puzzle-intro'), h('p', L.pick, 'muted'));
    const cards = Object.entries(L.cards).map(([id, c]) => ({ id, segment: c.segment as Segment, text: c.text }));
    const placed: Record<string, Segment | undefined> = {};
    let selected: string | null = null;
    const layout = document.createElement('div');
    layout.className = 'line-layout';
    const pool = document.createElement('div');
    pool.className = 'line-pool';
    const line = document.createElement('div');
    line.className = 'line-segments';
    const fb = h('p', '', 'puzzle-feedback');
    const act = actions(btn(U.leave, () => (close(), resolve(false))));
    const lengths = divide(1, 0.62);
    const render = () => {
      pool.replaceChildren(
        ...cards
          .filter((c) => !placed[c.id])
          .map((c) => {
            const b = btn(c.text, () => {
              selected = c.id;
              render();
            }, 'debate-move line-card');
            if (selected === c.id) b.classList.add('active');
            return b;
          }),
      );
      line.replaceChildren(
        ...[...SEGMENTS].reverse().map((seg) => {
          const d = document.createElement('div');
          d.className = `line-seg seg-${seg}`;
          d.style.flexGrow = String(lengths[SEGMENTS.indexOf(seg)]! * 10);
          d.append(h('b', L.segments[seg]));
          for (const c of cards.filter((x) => placed[x.id] === seg)) d.append(h('span', c.text, 'line-placed'));
          d.addEventListener('click', () => {
            if (!selected) return;
            const card = cards.find((c) => c.id === selected)!;
            if (card.segment === seg) {
              placed[card.id] = seg;
              fb.textContent = '';
            } else fb.textContent = L.wrong;
            selected = null;
            render();
          });
          return d;
        }),
      );
      const r = checkPlacement(cards, placed);
      if (r.missing.length === 0) {
        fb.textContent = L.middle;
        act.replaceChildren(btn(U.done, () => (close(), resolve(true))));
      }
    };
    layout.append(line, pool);
    box.append(layout, fb, act);
    render();
  });
}
