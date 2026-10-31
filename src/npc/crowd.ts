import * as THREE from 'three';
import { Animator, type AnimState } from '../characters/animator';
import { parseAppearance, type AppearanceInput } from '../characters/appearance';
import { buildHumanoid } from '../characters/build';
import type { Humanoid } from '../characters/humanoid';
import { polylineLength, samplePolyline, type Vec2 } from '../procgen/geometry2d';
import { mulberry32, pick, range, type Rng } from '../procgen/rng';

/**
 * Ambient crowd (before the full NPC schedule system of M3): travellers walking the roads, and
 * groups standing and talking at gates and squares. Appearance is randomised from period-plausible
 * palettes (docs/RESEARCH.md §9): undyed linen and wool, madder red, saffron, woad blue, earth browns.
 */
const SKIN = ['#c99872', '#b98560', '#d8a882', '#a8744f', '#c08a64', '#e0b694'];
const HAIR = ['#2b1d14', '#3a2618', '#1d1510', '#4a3220', '#6b5a48', '#8c8a86', '#d0ccc4'];
const CLOTH = ['#e8dfca', '#d9cbb0', '#c9b79a', '#efe6d2', '#a8442e', '#8c3b2a', '#c9922e', '#4f6a8a', '#3d5470', '#6b5a3e', '#7a6a50', '#5e6b44', '#b8a07a'];
const BORDER = ['#8c3b2a', '#3d5470', '#2b1d14', '#c9922e', null, null, null] as const;

export function randomCitizen(rng: Rng, role: 'traveller' | 'citizen' | 'worker' | 'woman' | 'elder' | 'youth' = 'citizen'): AppearanceInput {
  const fem = role === 'woman';
  const age = role === 'elder' ? 'old' : role === 'youth' ? 'youth' : 'adult';
  const border = pick(rng, BORDER);
  const props: AppearanceInput['props'] = [];
  if (role === 'worker') props.push(pick(rng, ['amphora', 'basket'] as const));
  if (role === 'traveller' && rng() < 0.6) props.push('staff');
  if (role === 'woman' && rng() < 0.4) props.push(pick(rng, ['amphora', 'basket'] as const));
  if (role === 'elder' && rng() < 0.5) props.push('staff');
  return {
    height: fem ? range(rng, 1.52, 1.66) : range(rng, 1.62, 1.8),
    build: rng(),
    sex: fem ? 'f' : 'm',
    age,
    skin: pick(rng, SKIN),
    hair: { style: fem ? pick(rng, ['bun', 'long'] as const) : pick(rng, ['short', 'curly', 'cropped', age === 'old' ? 'bald' : 'short'] as const), color: age === 'old' ? pick(rng, ['#8c8a86', '#d0ccc4', '#6b5a48']) : pick(rng, HAIR) },
    beard: { style: fem || age === 'youth' ? 'none' : pick(rng, ['trimmed', 'full', 'full', 'long', 'stubble'] as const), color: pick(rng, HAIR) },
    chiton: { color: pick(rng, CLOTH), length: fem || age === 'old' ? 'ankle' : role === 'worker' ? 'short' : 'knee', ...(border ? { border } : {}) },
    himation: role === 'worker' ? null : rng() < (fem ? 0.8 : 0.6) ? { color: pick(rng, CLOTH), ...(rng() < 0.4 ? { border: pick(rng, ['#8c3b2a', '#3d5470', '#c9922e']) } : {}) } : null,
    exomis: role === 'worker' && rng() < 0.6,
    chlamys: role === 'traveller' && rng() < 0.7 ? pick(rng, ['#7a4a2e', '#5e4a36', '#8c3b2a', '#4f5a6a']) : null,
    petasos: role === 'traveller' && rng() < 0.5,
    props,
  };
}

interface Walker {
  h: Humanoid;
  anim: Animator;
  path: Vec2[];
  len: number;
  s: number;
  dir: 1 | -1;
  speed: number;
  lateral: number;
  pause: number;
}

interface Loiterer {
  h: Humanoid;
  anim: Animator;
  state: AnimState;
  switchIn: number;
}

export class Crowd {
  readonly group = new THREE.Group();
  private readonly walkers: Walker[] = [];
  private readonly loiterers: Loiterer[] = [];
  private readonly camPos = new THREE.Vector3();
  private readonly rng: Rng;

  constructor(
    private readonly ground: (x: number, z: number) => number,
    seed = 5,
  ) {
    this.group.name = 'crowd';
    this.rng = mulberry32(seed);
  }

  addWalkers(path: Vec2[], count: number, lateral: number): void {
    const len = polylineLength(path);
    for (let i = 0; i < count; i++) {
      const rng = this.rng;
      const role = pick(rng, ['traveller', 'citizen', 'citizen', 'worker', 'woman', 'elder', 'youth'] as const);
      const h = buildHumanoid(parseAppearance(randomCitizen(rng, role)), { lite: true });
      this.group.add(h.object);
      const anim = new Animator(h, rng() * 100);
      anim.play('walk');
      this.walkers.push({ h, anim, path, len, s: rng() * len, dir: rng() < 0.5 ? 1 : -1, speed: range(rng, 1.05, 1.45) * (role === 'elder' ? 0.75 : 1), lateral: (rng() - 0.5) * 2 * lateral, pause: 0 });
    }
  }

  /** A knot of people standing around a point, facing inward, chatting. */
  addGroup(x: number, z: number, count: number, radius: number): void {
    for (let i = 0; i < count; i++) {
      const rng = this.rng;
      const role = pick(rng, ['citizen', 'citizen', 'elder', 'youth', 'woman', 'traveller'] as const);
      const h = buildHumanoid(parseAppearance(randomCitizen(rng, role)), { lite: true });
      const a = (i / count) * Math.PI * 2 + rng() * 0.4;
      const px = x + Math.cos(a) * radius;
      const pz = z + Math.sin(a) * radius;
      h.object.position.set(px, this.ground(px, pz), pz);
      h.object.rotation.y = Math.atan2(x - px, z - pz);
      this.group.add(h.object);
      const anim = new Animator(h, rng() * 100);
      const state: AnimState = rng() < 0.4 ? 'gesture' : 'idle';
      anim.play(state);
      this.loiterers.push({ h, anim, state, switchIn: range(rng, 3, 9) });
    }
  }

  get count(): number {
    return this.walkers.length + this.loiterers.length;
  }

  update(dt: number, camera: THREE.Camera): void {
    camera.getWorldPosition(this.camPos);
    for (const w of this.walkers) {
      if (w.pause > 0) {
        w.pause -= dt;
        if (w.pause <= 0) w.anim.play('walk');
      } else {
        w.s += w.speed * w.dir * dt;
        if (w.s > w.len || w.s < 0) {
          w.dir = w.dir === 1 ? -1 : 1;
          w.s = THREE.MathUtils.clamp(w.s, 0, w.len);
          w.pause = range(this.rng, 1, 6);
          w.anim.play('idle');
        }
      }
      const p = samplePolyline(w.path, w.s);
      const x = p.x - p.tz * w.lateral;
      const z = p.z + p.tx * w.lateral;
      const o = w.h.object;
      o.position.set(x, this.ground(x, z), z);
      o.rotation.y = Math.atan2(p.tx * w.dir, p.tz * w.dir);
      const d = o.position.distanceTo(this.camPos);
      o.visible = d < 170;
      if (o.visible && d < 90) w.anim.update(dt, w.pause > 0 ? 0 : w.speed);
    }
    for (const l of this.loiterers) {
      const d = l.h.object.position.distanceTo(this.camPos);
      l.h.object.visible = d < 170;
      if (!l.h.object.visible || d > 90) continue;
      l.switchIn -= dt;
      if (l.switchIn <= 0) {
        l.state = l.state === 'gesture' ? 'idle' : this.rng() < 0.5 ? 'gesture' : 'idle';
        l.anim.play(l.state);
        l.switchIn = range(this.rng, 3, 9);
      }
      l.anim.update(dt, 0);
    }
  }

  dispose(): void {
    for (const w of this.walkers) w.h.dispose();
    for (const l of this.loiterers) l.h.dispose();
  }
}
