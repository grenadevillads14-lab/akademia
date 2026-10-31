import * as THREE from 'three';
import { BONES, type BoneName, type Humanoid } from './humanoid';

/**
 * Procedural animation. Each pose function writes Euler angles (radians) per bone for a given phase;
 * the animator cross-fades between named states and applies the result to the skeleton.
 * Conventions (character faces +Z): thigh/upperArm rotation.x < 0 swings forward;
 * shin rotation.x > 0 bends the knee; foreArm rotation.x < 0 bends the elbow; spine rotation.x > 0 leans forward.
 */
export type AnimState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'jump'
  | 'fall'
  | 'swim'
  | 'sit'
  | 'sitGround'
  | 'gesture'
  | 'write'
  | 'drawDirt'
  | 'wrestle'
  | 'throw'
  | 'carryTorch'
  | 'climb'
  | 'lie'
  | 'read'
  | 'pray'
  | 'dig';

type Pose = Partial<Record<BoneName, [number, number, number]>> & { hipDrop?: number; hipShift?: [number, number] };

interface Ctx {
  t: number; // time (s)
  phase: number; // locomotion phase (radians)
  seed: number; // per-character offset
}

const sin = Math.sin;
const cos = Math.cos;

const POSES: Record<AnimState, (c: Ctx) => Pose> = {
  idle: ({ t, seed }) => {
    const br = sin(t * 1.6 + seed) * 0.02;
    const sway = sin(t * 0.35 + seed) * 0.03;
    return {
      spine: [br, sway * 0.5, 0],
      chest: [br * 0.5, 0, 0],
      head: [-br + sin(t * 0.23 + seed * 2) * 0.05, sin(t * 0.17 + seed) * 0.25, 0],
      upperArmL: [0.03, 0, 0.06 + br],
      upperArmR: [0.03, 0, -0.06 - br],
      foreArmL: [-0.15, 0, 0],
      foreArmR: [-0.15, 0, 0],
      thighL: [0, 0, sway * 0.3],
      thighR: [0, 0, sway * 0.3],
      hipShift: [sway * 0.6, 0],
    };
  },
  walk: ({ phase }) => {
    const s = sin(phase);
    const c = cos(phase);
    return {
      hips: [0, s * 0.08, 0],
      spine: [0.04, -s * 0.06, 0],
      chest: [0, -s * 0.06, 0],
      head: [-0.02, s * 0.05, 0],
      thighL: [-s * 0.42, 0, 0],
      thighR: [s * 0.42, 0, 0],
      shinL: [Math.max(0, c) * 0.65 + 0.05, 0, 0],
      shinR: [Math.max(0, -c) * 0.65 + 0.05, 0, 0],
      footL: [s * 0.15, 0, 0],
      footR: [-s * 0.15, 0, 0],
      upperArmL: [s * 0.35, 0, 0.07],
      upperArmR: [-s * 0.35, 0, -0.07],
      foreArmL: [-0.25 - Math.max(0, s) * 0.2, 0, 0],
      foreArmR: [-0.25 - Math.max(0, -s) * 0.2, 0, 0],
      hipDrop: Math.abs(c) * 0.03,
    };
  },
  run: ({ phase }) => {
    const s = sin(phase);
    const c = cos(phase);
    return {
      hips: [0, s * 0.12, 0],
      spine: [0.16, -s * 0.1, 0],
      chest: [0.04, -s * 0.12, 0],
      head: [-0.12, s * 0.06, 0],
      thighL: [-s * 0.8 - 0.1, 0, 0],
      thighR: [s * 0.8 - 0.1, 0, 0],
      shinL: [Math.max(0, c) * 1.3 + 0.25, 0, 0],
      shinR: [Math.max(0, -c) * 1.3 + 0.25, 0, 0],
      footL: [s * 0.3, 0, 0],
      footR: [-s * 0.3, 0, 0],
      upperArmL: [s * 0.75, 0, 0.12],
      upperArmR: [-s * 0.75, 0, -0.12],
      foreArmL: [-1.3, 0, 0],
      foreArmR: [-1.3, 0, 0],
      hipDrop: 0.04 + Math.abs(c) * 0.05,
    };
  },
  sprint: (c) => {
    const p = POSES.run(c);
    p.spine = [0.28, p.spine![1], 0];
    p.thighL = [p.thighL![0] * 1.2, 0, 0];
    p.thighR = [p.thighR![0] * 1.2, 0, 0];
    return p;
  },
  jump: () => ({
    spine: [0.1, 0, 0],
    thighL: [-0.7, 0, 0],
    thighR: [-0.2, 0, 0],
    shinL: [1.1, 0, 0],
    shinR: [0.6, 0, 0],
    upperArmL: [-0.6, 0, 0.3],
    upperArmR: [-0.6, 0, -0.3],
    foreArmL: [-0.6, 0, 0],
    foreArmR: [-0.6, 0, 0],
  }),
  fall: ({ t }) => ({
    spine: [0.05, 0, 0],
    thighL: [-0.3, 0, 0.05],
    thighR: [-0.1, 0, -0.05],
    shinL: [0.5, 0, 0],
    shinR: [0.3, 0, 0],
    upperArmL: [-0.3, 0, 0.9 + sin(t * 9) * 0.1],
    upperArmR: [-0.3, 0, -0.9 - sin(t * 9) * 0.1],
  }),
  swim: ({ t }) => {
    const s = sin(t * 3.2);
    return {
      root: [1.25, 0, 0],
      head: [-0.9, s * 0.3, 0],
      thighL: [s * 0.35, 0, 0.05],
      thighR: [-s * 0.35, 0, -0.05],
      shinL: [0.25 + Math.max(0, s) * 0.3, 0, 0],
      shinR: [0.25 + Math.max(0, -s) * 0.3, 0, 0],
      upperArmL: [-Math.PI + (t * 3.2) % (Math.PI * 2), 0, 0.2],
      upperArmR: [-Math.PI + ((t * 3.2 + Math.PI) % (Math.PI * 2)), 0, -0.2],
      foreArmL: [-0.3, 0, 0],
      foreArmR: [-0.3, 0, 0],
      hipDrop: 0.75,
    };
  },
  sit: ({ t, seed }) => ({
    spine: [0.08 + sin(t * 1.5 + seed) * 0.015, 0, 0],
    head: [0.05, sin(t * 0.2 + seed) * 0.3, 0],
    thighL: [-1.55, 0, 0.08],
    thighR: [-1.55, 0, -0.08],
    shinL: [1.55, 0, 0],
    shinR: [1.55, 0, 0],
    upperArmL: [-0.35, 0, 0.12],
    upperArmR: [-0.35, 0, -0.12],
    foreArmL: [-0.9, 0, 0],
    foreArmR: [-0.9, 0, 0],
    hipDrop: 0.47,
  }),
  sitGround: ({ t, seed }) => ({
    spine: [0.18 + sin(t * 1.5 + seed) * 0.015, 0, 0],
    head: [0.1, sin(t * 0.2 + seed) * 0.25, 0],
    thighL: [-1.4, 0.9, 0.5],
    thighR: [-1.4, -0.9, -0.5],
    shinL: [2.3, 0, 0],
    shinR: [2.3, 0, 0],
    upperArmL: [-0.3, 0, 0.1],
    upperArmR: [-0.3, 0, -0.1],
    foreArmL: [-1.0, 0, 0],
    foreArmR: [-1.0, 0, 0],
    hipDrop: 0.82,
  }),
  gesture: ({ t, seed }) => {
    const g = sin(t * 2.1 + seed);
    const g2 = sin(t * 1.3 + seed * 3);
    return {
      spine: [0.03, g2 * 0.08, 0],
      head: [-0.05 + g * 0.04, -g2 * 0.15, 0],
      upperArmR: [-0.9 - g * 0.25, 0.2, -0.25],
      foreArmR: [-0.8 - g * 0.3, 0, 0],
      handR: [0.3, 0, g * 0.3],
      upperArmL: [-0.2 - Math.max(0, g2) * 0.4, 0, 0.15],
      foreArmL: [-0.9, 0, 0],
    };
  },
  write: ({ t }) => ({
    spine: [0.25, 0, 0],
    head: [0.35, 0, 0],
    thighL: [-1.55, 0, 0.08],
    thighR: [-1.55, 0, -0.08],
    shinL: [1.55, 0, 0],
    shinR: [1.55, 0, 0],
    upperArmL: [-0.5, 0, 0.2],
    foreArmL: [-1.2, 0.3, 0],
    upperArmR: [-0.55 + sin(t * 6) * 0.04, 0, -0.15],
    foreArmR: [-1.25, -0.3, 0],
    handR: [0.2, 0, sin(t * 9) * 0.15],
    hipDrop: 0.47,
  }),
  drawDirt: ({ t }) => ({
    spine: [0.55, 0, 0],
    chest: [0.15, 0, 0],
    head: [0.3, 0, 0],
    thighL: [-0.35, 0, 0.1],
    thighR: [0.1, 0, -0.1],
    shinL: [0.55, 0, 0],
    shinR: [0.2, 0, 0],
    upperArmR: [-0.6 + sin(t * 1.8) * 0.25, cos(t * 1.8) * 0.3, -0.2],
    foreArmR: [-0.1, 0, 0],
    upperArmL: [-0.3, 0, 0.3],
    foreArmL: [-1.2, 0, 0],
    hipDrop: 0.12,
  }),
  wrestle: ({ t, seed }) => {
    const s = sin(t * 2.4 + seed);
    return {
      spine: [0.55, s * 0.1, 0],
      head: [-0.4, 0, 0],
      thighL: [-0.6, 0, 0.3],
      thighR: [-0.3, 0, -0.3],
      shinL: [0.9, 0, 0],
      shinR: [0.7, 0, 0],
      upperArmL: [-1.3 + s * 0.1, 0, 0.3],
      upperArmR: [-1.3 - s * 0.1, 0, -0.3],
      foreArmL: [-0.6, 0, 0],
      foreArmR: [-0.6, 0, 0],
      hipDrop: 0.28,
    };
  },
  throw: ({ t }) => {
    // Discus wind-up and release loop (the minigame drives `t` directly).
    const k = (t % 1.6) / 1.6;
    const wind = Math.sin(k * Math.PI);
    return {
      spine: [0.3, -1.2 * wind + (k > 0.7 ? 1.8 * (k - 0.7) : 0), 0],
      chest: [0, -0.5 * wind, 0],
      thighL: [-0.4, 0, 0.1],
      thighR: [0.2, 0, -0.1],
      shinL: [0.7, 0, 0],
      shinR: [0.4, 0, 0],
      upperArmR: [-0.2, 0, -1.4 + wind * 0.2],
      upperArmL: [-0.6, 0, 0.6],
      foreArmL: [-0.8, 0, 0],
      hipDrop: 0.15,
    };
  },
  carryTorch: (c) => {
    const p = POSES.run(c);
    p.upperArmR = [-2.6, 0, -0.1];
    p.foreArmR = [-0.2, 0, 0];
    return p;
  },
  climb: ({ t }) => {
    const s = sin(t * 4);
    return {
      spine: [0.2, 0, 0],
      upperArmL: [-2.6 + s * 0.4, 0, 0.2],
      upperArmR: [-2.6 - s * 0.4, 0, -0.2],
      foreArmL: [-0.5, 0, 0],
      foreArmR: [-0.5, 0, 0],
      thighL: [-0.9 - s * 0.3, 0, 0],
      thighR: [-0.9 + s * 0.3, 0, 0],
      shinL: [1.3, 0, 0],
      shinR: [1.3, 0, 0],
    };
  },
  lie: () => ({ root: [-1.5, 0, 0], head: [0.2, 0, 0], upperArmL: [0, 0, 0.3], upperArmR: [0, 0, -0.3], hipDrop: 0.82 }),
  read: ({ t, seed }) => ({
    spine: [0.08, 0, 0],
    head: [0.35 + sin(t * 0.3 + seed) * 0.03, sin(t * 0.25) * 0.15, 0],
    upperArmL: [-0.5, 0, 0.25],
    upperArmR: [-0.5, 0, -0.25],
    foreArmL: [-1.3, -0.3, 0],
    foreArmR: [-1.3, 0.3, 0],
  }),
  pray: () => ({ spine: [-0.08, 0, 0], head: [-0.35, 0, 0], upperArmL: [-2.2, 0, 0.45], upperArmR: [-2.2, 0, -0.45], foreArmL: [-0.2, 0, 0], foreArmR: [-0.2, 0, 0] }),
  dig: ({ t }) => {
    const s = sin(t * 3);
    return {
      spine: [0.7 + s * 0.15, 0, 0],
      head: [0.2, 0, 0],
      thighL: [-0.4, 0, 0.12],
      thighR: [0.0, 0, -0.12],
      shinL: [0.6, 0, 0],
      shinR: [0.3, 0, 0],
      upperArmL: [-1.0 + s * 0.4, 0, 0.1],
      upperArmR: [-1.0 + s * 0.4, 0, -0.1],
      foreArmL: [-0.3, 0, 0],
      foreArmR: [-0.3, 0, 0],
      hipDrop: 0.15,
    };
  },
};

export class Animator {
  private readonly weights = new Map<AnimState, number>();
  private target: AnimState = 'idle';
  private t = 0;
  phase = 0;
  /** Seconds for a full cross-fade. */
  blendTime = 0.22;
  private readonly seed: number;
  private readonly rest: Record<BoneName, THREE.Euler>;
  private readonly hipsRest: THREE.Vector3;
  private readonly e = new THREE.Euler();
  private readonly q = new THREE.Quaternion();

  constructor(private readonly h: Humanoid, seed = Math.random() * 100) {
    this.seed = seed;
    this.weights.set('idle', 1);
    this.rest = Object.fromEntries(BONES.map((b) => [b, h.bones[b].rotation.clone()])) as Record<BoneName, THREE.Euler>;
    this.hipsRest = h.bones.hips.position.clone();
  }

  get state(): AnimState {
    return this.target;
  }

  play(state: AnimState): void {
    this.target = state;
    if (!this.weights.has(state)) this.weights.set(state, 0);
  }

  /** Advance. `speed` (m/s) drives the stride phase for locomotion states. */
  update(dt: number, speed = 0): void {
    this.t += dt;
    const stride = this.target === 'walk' ? 1.45 : this.target === 'run' || this.target === 'carryTorch' ? 2.4 : this.target === 'sprint' ? 2.9 : 1.6;
    this.phase += (speed / stride) * Math.PI * 2 * dt;
    if (this.target === 'walk' && speed < 0.05) this.phase += dt * 2;

    // Cross-fade weights toward the target state.
    const k = Math.min(1, dt / this.blendTime);
    let sum = 0;
    for (const [s, w] of this.weights) {
      const nw = s === this.target ? w + (1 - w) * k : w * (1 - k);
      if (nw < 0.001 && s !== this.target) this.weights.delete(s);
      else this.weights.set(s, nw);
      sum += nw;
    }

    const acc = new Map<BoneName, [number, number, number]>();
    let hipDrop = 0;
    let shiftX = 0;
    const ctx: Ctx = { t: this.t, phase: this.phase, seed: this.seed };
    for (const [s, w] of this.weights) {
      const ww = w / (sum || 1);
      const p = POSES[s](ctx);
      for (const b of BONES) {
        const r = p[b];
        if (!r) continue;
        const a = acc.get(b) ?? [0, 0, 0];
        a[0] += r[0] * ww;
        a[1] += r[1] * ww;
        a[2] += r[2] * ww;
        acc.set(b, a);
      }
      hipDrop += (p.hipDrop ?? 0) * ww;
      shiftX += (p.hipShift?.[0] ?? 0) * ww;
    }
    for (const b of BONES) {
      const r = acc.get(b) ?? [0, 0, 0];
      const rest = this.rest[b];
      this.e.set(rest.x + r[0], rest.y + r[1], rest.z + r[2], 'XYZ');
      this.h.bones[b].quaternion.setFromEuler(this.e);
    }
    const hips = this.h.bones.hips;
    hips.position.set(this.hipsRest.x + shiftX * 0.05, this.hipsRest.y - hipDrop * this.h.dims.hipY * 0.98, this.hipsRest.z);
    // Flicker hand-held flames.
    for (const prop of this.h.props.values()) {
      const flame = prop.getObjectByName('flame');
      if (flame) flame.scale.y = 1.2 + Math.sin(this.t * 23 + this.seed) * 0.25;
    }
    void this.q;
  }
}
