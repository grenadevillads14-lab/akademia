import * as THREE from 'three';
import events from '../../content/athletics/events.json';
import { courseLength, pointAt, rivalOut, rivalProgress, standings, startRace, stepRace, type RaceDef, type RaceState, type Rival, type Vec2 } from '../athletics/race';
import { IMPLEMENTS, meter, simulateThrow, type Implement, type ThrowResult } from '../athletics/throwing';
import { startBout, stepBout, visibleAttack, type Opponent, type WrestleAction, type WrestleState } from '../athletics/wrestling';
import type { AppearanceInput } from '../characters/appearance';
import { buildProp } from '../characters/humanoid';
import { t } from '../core/i18n';
import type { InputState } from '../core/input';
import { Npc } from '../npc/npc';
import type { ThirdPersonCamera } from '../player/camera';
import type { Player } from '../player/player';
import type { GameState } from '../systems/state';
import type { WorldUniforms } from '../world/uniforms';

/**
 * Athletics in the world (design §6): races on the dromos and the Promethia torch race with visible rival
 * runners, discus and javelin from the balbis with a flying implement, and upright wrestling in the
 * palaestra. Started by the `athletics <kind> <id>` command; rewards come from content/athletics/events.json.
 */
interface RaceContent {
  titleKey: string;
  course: Vec2[];
  radius: number;
  countdown: number;
  torch?: boolean;
  start: { x: number; z: number; heading: number };
  rivals: Rival[];
  onPlace: Record<string, string[]>;
  onFail?: string[];
}
interface ThrowContent {
  titleKey: string;
  balbis: { x: number; z: number; heading: number };
  attempts: number;
  rivals: { id: string; mark: number }[];
  onPlace: Record<string, string[]>;
}
interface WrestleContent {
  titleKey: string;
  opponent: Opponent;
  spot: { x: number; z: number };
  onWin: string[];
  onLose: string[];
}
const RACES = events.races as unknown as Record<string, RaceContent>;
const THROWS = events.throws as unknown as Record<string, ThrowContent>;
const BOUTS = events.wrestling as unknown as Record<string, WrestleContent>;
const CUES = events.cues as Record<string, { key: string; icon: string }>;

export interface AthleticsDeps {
  app: HTMLElement;
  scene: THREE.Scene;
  state: GameState;
  player: Player;
  camera: ThirdPersonCamera;
  uniforms: WorldUniforms;
  ground: (x: number, z: number) => number;
  appearance: (id: string) => AppearanceInput | undefined;
  nameOf: (id: string) => string;
  /** True while something else (dialogue, a puzzle) must finish before an event starts. */
  waiting: () => boolean;
}

type Active =
  | { kind: 'race'; id: string; def: RaceDef; content: RaceContent; st: RaceState; rivals: Npc[]; length: number; markers: THREE.Group; light: THREE.PointLight | null; torch: THREE.Object3D | null; done: boolean }
  | {
      kind: 'throw';
      id: Implement;
      content: ThrowContent;
      phase: 'aim' | 'angle' | 'power' | 'flight' | 'mark' | 'done';
      t: number;
      aim: number;
      angle: number;
      power: number;
      attempt: number;
      marks: number[];
      result: ThrowResult | null;
      projectile: THREE.Object3D;
      pegs: THREE.Group;
      wind: [number, number];
    }
  | { kind: 'wrestle'; id: string; content: WrestleContent; st: WrestleState; opp: Npc; lastFalls: number; fallTimer: number; done: boolean };

const fmt = (s: number) => `${s.toFixed(1)} s`;

export class AthleticsHost {
  private active: Active | null = null;
  private readonly panel: HTMLDivElement;
  private readonly big: HTMLDivElement;
  private seed = 1;
  private pending: { kind: string; id: string } | null = null;

  constructor(private readonly d: AthleticsDeps) {
    this.panel = document.createElement('div');
    this.panel.className = 'athletics-hud papyrus';
    this.panel.hidden = true;
    this.panel.setAttribute('data-testid', 'athletics');
    this.big = document.createElement('div');
    this.big.className = 'athletics-big';
    this.big.hidden = true;
    d.app.append(this.panel, this.big);
    d.state.bus.on('state:athletics', (e) => (this.pending = { kind: e.kind, id: e.id }));
  }

  /** True while an event is running (the menu and story triggers wait). */
  get busy(): boolean {
    return this.active !== null || this.pending !== null;
  }

  start(kind: string, id: string): void {
    if (this.active) return;
    if (kind === 'race') this.startRace(id);
    else if (kind === 'throw') this.startThrow(id as Implement);
    else if (kind === 'wrestle') this.startBout(id);
    else throw new Error(`Unknown athletics kind "${kind}"`);
  }

  // ---------------------------------------------------------------- races

  private startRace(id: string): void {
    const c = RACES[id];
    if (!c) throw new Error(`Unknown race "${id}"`);
    const def: RaceDef = { id, course: c.course, radius: c.radius, rivals: c.rivals, countdown: c.countdown, ...(c.torch ? { torch: true } : {}) };
    const p = this.d.player;
    p.teleport(c.start.x, c.start.z, c.start.heading);
    this.d.camera.snapBehind(c.start.heading);
    p.stamina = 1;
    p.controlEnabled = false;
    // Rivals in lanes beside the player.
    const rivals = c.rivals.map((r, i) => {
      const app = { ...(this.d.appearance(r.id) ?? {}) } as AppearanceInput & { props?: string[] };
      app.props = c.torch ? ['torch'] : [];
      const n = new Npc(r.id, app, this.d.ground, 40 + i);
      this.d.scene.add(n.object);
      return n;
    });
    // Checkpoint markers: a ring on the ground and a turning post.
    const markers = new THREE.Group();
    markers.name = 'race-markers';
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.55, depthWrite: false });
    const postMat = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.7 });
    c.course.forEach(([x, z], i) => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(c.radius, 0.08, 6, 48), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.6, 8), postMat);
      post.position.set(c.radius + 0.3, 0.8, 0);
      post.castShadow = true;
      g.add(ring, post);
      g.position.set(x, this.d.ground(x, z), z);
      g.userData.index = i;
      markers.add(g);
    });
    this.d.scene.add(markers);
    let light: THREE.PointLight | null = null;
    let torch: THREE.Object3D | null = null;
    if (c.torch) {
      torch = buildProp('torch', p.humanoid.dims.height / 1.7);
      if (torch) {
        torch.position.y -= 0.06;
        p.humanoid.bones.handR.add(torch);
      }
      light = new THREE.PointLight(0xff9a3c, 6, 9, 1.6);
      this.d.scene.add(light);
    }
    this.active = { kind: 'race', id, def, content: c, st: startRace(def), rivals, length: courseLength(c.course), markers, light, torch, done: false };
    this.panel.hidden = false;
  }

  private updateRace(a: Extract<Active, { kind: 'race' }>, dt: number, input: InputState): void {
    const p = this.d.player;
    const u = this.d.uniforms;
    const wind = Math.min(1, u.windStrength.value + u.gust.value * 0.6);
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    if (!a.done) {
      const r = stepRace(a.def, a.st, dt, [p.position.x, p.position.z], speed, wind);
      a.st = r.state;
      if (r.events.includes('go')) p.controlEnabled = true;
      if (r.events.includes('finish') || r.events.includes('torch_out')) this.finishRace(a);
    }
    // Countdown text.
    if (a.st.phase === 'countdown') this.showBig(String(Math.ceil(-a.st.t)));
    else if (a.st.t < 0.8 && a.st.phase === 'running') this.showBig(t('athletics.go'));
    else if (!a.done) this.showBig(null);
    // Rivals along the course, in lanes.
    a.rivals.forEach((n, i) => {
      const r = a.def.rivals[i]!;
      const prog = rivalProgress(r, Math.max(0, a.st.t));
      const at = pointAt(a.def.course, prog * a.length);
      const lane = (i % 2 ? 1 : -1) * (1.2 + Math.floor(i / 2) * 1.1);
      const x = at.x + Math.cos(at.heading) * lane;
      const z = at.z - Math.sin(at.heading) * lane;
      const moving = a.st.t > 0 && prog < 1 && !rivalOut(r, a.st.t);
      n.place(x, z, at.heading, moving ? (a.def.torch ? 'run' : 'sprint') : 'idle');
      n.update(dt, p.position, 0, p.heading, p.position);
      const flame = n.object.getObjectByName('flame');
      if (flame) flame.visible = !rivalOut(r, a.st.t);
    });
    // Next checkpoint highlight.
    for (const m of a.markers.children) m.visible = (m.userData.index as number) >= a.st.next;
    // Torch light flickers with the flame.
    if (a.light && a.torch) {
      const f = a.st.flame;
      a.torch.getWorldPosition(a.light.position);
      a.light.position.y += 0.5;
      a.light.intensity = f * (5 + Math.sin(performance.now() * 0.03) * 1.2 + Math.random() * 0.8);
      const flame = a.torch.getObjectByName('flame');
      if (flame) flame.scale.setScalar(Math.max(0.05, f) * (0.9 + Math.random() * 0.2));
    }
    // HUD.
    const myProg = this.playerProgress(a);
    const ahead = a.def.rivals.filter((r) => !rivalOut(r, a.st.t) && rivalProgress(r, Math.max(0, a.st.t)) > myProg).length;
    const bars = [`<div class="bar"><span>${t('athletics.stamina')}</span><i style="width:${(p.stamina * 100).toFixed(0)}%"></i></div>`];
    if (a.def.torch) bars.push(`<div class="bar flame"><span>${t('athletics.flame')}</span><i style="width:${(a.st.flame * 100).toFixed(0)}%"></i></div>`);
    if (!a.done) {
      this.panel.innerHTML = `<h3>${t(a.content.titleKey)}</h3><div class="row"><b>${fmt(Math.max(0, a.st.t))}</b><span>${t('athletics.place', { place: ahead + 1, of: a.def.rivals.length + 1 })}</span><span>${t('athletics.gate', { n: Math.min(a.st.next + 1, a.def.course.length), of: a.def.course.length })}</span></div>${bars.join('')}`;
    } else if (input.wasPressed('interact') || input.wasPressed('confirm')) this.end();
  }

  private playerProgress(a: Extract<Active, { kind: 'race' }>): number {
    // Distance done = course length up to the last checkpoint passed + progress toward the next.
    const c = a.def.course;
    if (a.st.next === 0) return 0;
    let d = courseLength(c.slice(0, a.st.next));
    const prev = c[a.st.next - 1]!;
    const next = c[a.st.next];
    if (next) {
      const seg = Math.hypot(next[0] - prev[0], next[1] - prev[1]);
      const left = Math.hypot(next[0] - this.d.player.position.x, next[1] - this.d.player.position.z);
      d += Math.max(0, seg - left);
    }
    return d / a.length;
  }

  private finishRace(a: Extract<Active, { kind: 'race' }>): void {
    a.done = true;
    const failed = a.st.phase === 'failed';
    const rows = standings(a.def, a.st);
    const cmds = failed ? (a.content.onFail ?? []) : (a.content.onPlace[String(a.st.place)] ?? []);
    for (const cmd of cmds) this.d.state.runCommand(cmd);
    if (!failed) {
      const best = this.d.state.flag(`best.${a.id}`);
      if (typeof best !== 'number' || a.st.t < best) this.d.state.runCommand(`flag best.${a.id} ${a.st.t.toFixed(2)}`);
    }
    this.showBig(failed ? t('athletics.torch_out') : t('athletics.finished', { place: a.st.place ?? 0 }));
    this.panel.innerHTML = `<h3>${t(a.content.titleKey)}</h3><ol class="standings">${rows
      .map((r) => `<li class="${r.id === 'player' ? 'me' : ''}">${r.id === 'player' ? t('athletics.you') : this.d.nameOf(r.id)}<span>${r.time === null ? t('athletics.out') : fmt(r.time)}</span></li>`)
      .join('')}</ol><p class="muted">${t('athletics.continue')}</p>`;
  }

  // ---------------------------------------------------------------- throws

  private startThrow(id: Implement): void {
    const c = THROWS[id];
    if (!c) throw new Error(`Unknown throw "${id}"`);
    const p = this.d.player;
    p.teleport(c.balbis.x, c.balbis.z, c.balbis.heading);
    p.controlEnabled = false;
    const projectile = new THREE.Group();
    const bronze = new THREE.MeshStandardMaterial({ color: 0xa8743a, roughness: 0.35, metalness: 0.8 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.7 });
    if (id === 'discus') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 20), bronze);
      projectile.add(m);
    } else {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.3, 6), wood);
      shaft.rotation.x = Math.PI / 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.12, 6), bronze);
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 1.2;
      projectile.add(shaft, tip);
    }
    projectile.traverse((o) => (o.castShadow = true));
    projectile.visible = false;
    this.d.scene.add(projectile);
    const pegs = new THREE.Group();
    this.d.scene.add(pegs);
    // Wind in field coordinates (x = sideways, z = forward along the throw).
    const u = this.d.uniforms;
    const ws = 1.5 + (u.windStrength.value + u.gust.value * 0.5) * 6;
    const h = c.balbis.heading;
    const wx = u.windDir.value.x * ws;
    const wz = u.windDir.value.y * ws;
    const wind: [number, number] = [wx * Math.cos(h) - wz * Math.sin(h), wx * Math.sin(h) + wz * Math.cos(h)];
    this.active = { kind: 'throw', id, content: c, phase: 'aim', t: 0, aim: 0, angle: 0, power: 0, attempt: 1, marks: [], result: null, projectile, pegs, wind };
    this.panel.hidden = false;
  }

  /** Field coordinates (x sideways, z forward) to world. */
  private fieldToWorld(c: ThrowContent, x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const h = c.balbis.heading;
    const wx = c.balbis.x + Math.cos(h) * x + Math.sin(h) * z;
    const wz = c.balbis.z - Math.sin(h) * x + Math.cos(h) * z;
    return out.set(wx, this.d.ground(c.balbis.x, c.balbis.z) + y, wz);
  }

  private updateThrow(a: Extract<Active, { kind: 'throw' }>, dt: number, input: InputState): void {
    const c = a.content;
    const spec = IMPLEMENTS[a.id];
    const p = this.d.player;
    const press = input.wasPressed('interact') || input.wasPressed('jump') || input.wasPressed('confirm');
    a.t += dt;
    p.heading = c.balbis.heading + a.aim;
    const behind = this.fieldToWorld(c, Math.sin(a.aim) * -4.5 + 1.2, 2.6, -4.5);
    const ahead = this.fieldToWorld(c, Math.sin(a.aim) * 30, 0, 30);
    if (a.phase === 'aim' || a.phase === 'angle' || a.phase === 'power') this.d.camera.setShot({ pos: behind, look: ahead, fov: 50 });
    switch (a.phase) {
      case 'aim':
        a.aim = THREE.MathUtils.clamp(a.aim + input.axis('moveLeft', 'moveRight') * -dt * 0.6, -0.5, 0.5);
        if (press) {
          a.phase = 'angle';
          a.t = 0;
        }
        break;
      case 'angle':
        a.angle = 10 + meter(a.t, 1.6) * 60;
        if (press) {
          a.phase = 'power';
          a.t = 0;
        }
        break;
      case 'power':
        a.power = meter(a.t, 1.1);
        if (press) {
          // The meter sweeps up and down; releasing on the way down costs footwork timing.
          const falling = (a.t / 1.1) % 1 > 0.5;
          a.result = simulateThrow(a.id, { aim: a.aim, angle: a.angle, power: a.power, timing: falling ? 0.5 : 0 }, a.wind);
          a.phase = 'flight';
          a.t = 0;
          p.animator.play('throw');
          a.projectile.visible = true;
        }
        break;
      case 'flight': {
        const r = a.result!;
        const k = Math.min(r.path.length - 1, Math.floor((a.t / r.flightTime) * (r.path.length - 1)));
        const pt = r.path[k]!;
        const nx = r.path[Math.min(r.path.length - 1, k + 1)]!;
        const pos = this.fieldToWorld(c, pt[0], pt[1], pt[2]);
        a.projectile.position.copy(pos);
        const next = this.fieldToWorld(c, nx[0], nx[1], nx[2]);
        if (a.id === 'javelin' && next.distanceToSquared(pos) > 1e-6) a.projectile.lookAt(next);
        else a.projectile.rotation.y += dt * 20;
        this.d.camera.setShot({ pos: this.fieldToWorld(c, -9, 4 + pt[1] * 0.3, pt[2] * 0.6), look: pos, fov: 45 });
        if (a.t >= r.flightTime) {
          a.phase = 'mark';
          a.t = 0;
          a.marks.push(r.distance);
          if (!r.foul) {
            const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0xb4582f }));
            peg.position.copy(this.fieldToWorld(c, r.landing[0], 0.25, r.landing[1]));
            a.pegs.add(peg);
          }
        }
        break;
      }
      case 'mark':
        if (press || a.t > 3) {
          a.projectile.visible = false;
          if (a.attempt >= c.attempts) this.finishThrow(a);
          else {
            a.attempt++;
            a.phase = 'aim';
            a.t = 0;
            p.animator.play('idle');
          }
        }
        break;
      case 'done':
        if (press) this.end();
        break;
    }
    if (a.phase === 'done') return;
    const best = Math.max(0, ...a.marks);
    const windTxt = t('athletics.wind', { side: a.wind[0].toFixed(1), forward: a.wind[1].toFixed(1) });
    const meterBar = (label: string, v: number, sweet?: number) =>
      `<div class="bar meter"><span>${label}</span><i style="width:${(v * 100).toFixed(0)}%"></i>${sweet !== undefined ? `<b style="left:${(sweet * 100).toFixed(0)}%"></b>` : ''}</div>`;
    const hint = { aim: t('athletics.hint.aim'), angle: t('athletics.hint.angle'), power: t('athletics.hint.power'), flight: '', mark: a.result?.foul ? t('athletics.foul') : t('athletics.mark', { m: (a.result?.distance ?? 0).toFixed(2) }) }[a.phase];
    this.panel.innerHTML = `<h3>${t(c.titleKey)}</h3><div class="row"><span>${t('athletics.attempt', { n: a.attempt, of: c.attempts })}</span><span>${t('athletics.best', { m: best.toFixed(2) })}</span><span>${windTxt}</span></div>${meterBar(t('athletics.angle'), (a.angle - 10) / 60, (spec.bestAngle - 10) / 60)}${meterBar(t('athletics.power'), a.power, 1)}<p>${hint}</p>`;
  }

  private finishThrow(a: Extract<Active, { kind: 'throw' }>): void {
    a.phase = 'done';
    const best = Math.max(0, ...a.marks);
    const rows = [...a.content.rivals.map((r) => ({ id: r.id, mark: r.mark })), { id: 'player', mark: best }].sort((x, y) => y.mark - x.mark);
    const place = rows.findIndex((r) => r.id === 'player') + 1;
    for (const cmd of a.content.onPlace[String(place)] ?? []) this.d.state.runCommand(cmd);
    const prev = this.d.state.flag(`best.${a.id}`);
    if (typeof prev !== 'number' || best > prev) this.d.state.runCommand(`flag best.${a.id} ${best.toFixed(2)}`);
    this.panel.innerHTML = `<h3>${t(a.content.titleKey)}</h3><ol class="standings">${rows
      .map((r) => `<li class="${r.id === 'player' ? 'me' : ''}">${r.id === 'player' ? t('athletics.you') : this.d.nameOf(r.id)}<span>${r.mark.toFixed(2)} m</span></li>`)
      .join('')}</ol><p class="muted">${t('athletics.continue')}</p>`;
    this.d.camera.setShot(null);
  }

  // ---------------------------------------------------------------- wrestling

  private startBout(id: string): void {
    const c = BOUTS[id];
    if (!c) throw new Error(`Unknown bout "${id}"`);
    const p = this.d.player;
    const { x, z } = c.spot;
    p.teleport(x - 0.35, z, Math.PI / 2);
    p.controlEnabled = false;
    const app = { ...(this.d.appearance(c.opponent.id) ?? {}) } as AppearanceInput & { props?: string[] };
    app.props = [];
    const opp = new Npc(c.opponent.id, app, this.d.ground, 77);
    opp.place(x + 0.35, z, -Math.PI / 2, 'wrestle');
    this.d.scene.add(opp.object);
    p.animator.play('wrestle');
    const g = this.d.ground(x, z);
    this.d.camera.setShot({ pos: new THREE.Vector3(x, g + 1.9, z + 4.2), look: new THREE.Vector3(x, g + 1.0, z), fov: 45 });
    this.active = { kind: 'wrestle', id, content: c, st: startBout(this.seed++ * 7919), opp, lastFalls: 0, fallTimer: 0, done: false };
    this.panel.hidden = false;
  }

  private updateBout(a: Extract<Active, { kind: 'wrestle' }>, dt: number, input: InputState): void {
    const p = this.d.player;
    const opp = a.content.opponent;
    if (a.done) {
      a.opp.update(dt, p.position, 0, p.heading, p.position);
      if (input.wasPressed('interact') || input.wasPressed('confirm')) this.end();
      return;
    }
    let action: WrestleAction | null = null;
    if (input.wasCodePressed('Digit1')) action = 'sprawl';
    else if (input.wasCodePressed('Digit2')) action = 'break';
    else if (input.wasCodePressed('Digit3')) action = 'step';
    else if (input.wasPressed('jump')) action = 'throw';
    const bonus = this.d.state.data.skills.includes('wrestler') ? 0.25 : 0;
    const before = a.st;
    a.st = stepBout(opp, a.st, dt, action, bonus);
    const falls = a.st.playerFalls + a.st.oppFalls;
    if (falls !== before.playerFalls + before.oppFalls) {
      a.fallTimer = 1.6;
      if (a.st.lastFall === 'player') p.animator.play('lie');
      else a.opp.place(a.opp.position.x, a.opp.position.z, -Math.PI / 2, 'lie');
    }
    if (a.fallTimer > 0) {
      a.fallTimer -= dt;
      if (a.fallTimer <= 0 && a.st.phase !== 'won' && a.st.phase !== 'lost') {
        p.animator.play('wrestle');
        a.opp.place(a.opp.position.x, a.opp.position.z, -Math.PI / 2, 'wrestle');
      }
    }
    a.opp.update(dt, p.position, 0, p.heading, p.position);
    const cue = visibleAttack(a.st, opp);
    if (cue) this.showBig(`${CUES[cue]!.icon} ${t(CUES[cue]!.key)}`);
    else if (a.st.phase === 'opening') this.showBig(t('athletics.opening'));
    else this.showBig(null);
    const pips = (n: number) => '●'.repeat(n) + '○'.repeat(3 - n);
    const bar = (label: string, v: number, cls: string) => `<div class="bar ${cls}"><span>${label}</span><i style="width:${(Math.max(0, v) * 100).toFixed(0)}%"></i></div>`;
    this.panel.innerHTML = `<h3>${t(a.content.titleKey)}</h3><div class="row"><span>${t('athletics.you')} ${pips(a.st.oppFalls)}</span><span>${this.d.nameOf(opp.id)} ${pips(a.st.playerFalls)}</span></div>${bar(t('athletics.balance'), a.st.playerBalance, 'self')}${bar(t('athletics.their_balance'), a.st.oppBalance, 'opp')}<p class="keys">${t('athletics.wrestle_keys')}</p>`;
    if (a.st.phase === 'won' || a.st.phase === 'lost') {
      a.done = true;
      const won = a.st.phase === 'won';
      for (const cmd of won ? a.content.onWin : a.content.onLose) this.d.state.runCommand(cmd);
      this.showBig(won ? t('athletics.bout_won') : t('athletics.bout_lost'));
      this.panel.innerHTML += `<p class="muted">${t('athletics.continue')}</p>`;
    }
  }

  // ---------------------------------------------------------------- common

  private showBig(text: string | null): void {
    if (text === null) {
      this.big.hidden = true;
      return;
    }
    this.big.hidden = false;
    if (this.big.textContent !== text) this.big.textContent = text;
  }

  update(dt: number, input: InputState): void {
    if (this.pending && !this.active && !this.d.waiting()) {
      const { kind, id } = this.pending;
      this.pending = null;
      this.start(kind, id);
      return;
    }
    const a = this.active;
    if (!a) return;
    if (a.kind === 'race') this.updateRace(a, dt, input);
    else if (a.kind === 'throw') this.updateThrow(a, dt, input);
    else this.updateBout(a, dt, input);
  }

  /** Leave the current event and clean up. */
  end(): void {
    const a = this.active;
    if (!a) return;
    const p = this.d.player;
    if (a.kind === 'race') {
      for (const n of a.rivals) {
        this.d.scene.remove(n.object);
        n.dispose();
      }
      this.d.scene.remove(a.markers);
      a.markers.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      if (a.light) this.d.scene.remove(a.light);
      if (a.torch) a.torch.removeFromParent();
    } else if (a.kind === 'throw') {
      this.d.scene.remove(a.projectile, a.pegs);
    } else {
      this.d.scene.remove(a.opp.object);
      a.opp.dispose();
    }
    this.active = null;
    this.panel.hidden = true;
    this.showBig(null);
    p.controlEnabled = true;
    p.animator.play('idle');
    this.d.camera.setShot(null);
  }
}
