import * as THREE from 'three';
import { Animator, type AnimState } from '../characters/animator';
import { parseAppearance, type AppearanceInput } from '../characters/appearance';
import { buildHumanoid } from '../characters/build';
import type { Humanoid } from '../characters/humanoid';

/**
 * A named NPC body: a humanoid that can stand, sit, read, draw in the dust, gesture, walk to points,
 * patrol a route, or follow the player as a companion. Schedules (M4) and the story director set its mode.
 */
export type NpcMode =
  | { kind: 'pose'; anim: AnimState }
  | { kind: 'walkTo'; points: THREE.Vector3[]; then: AnimState; speed: number }
  | { kind: 'patrol'; points: THREE.Vector3[]; speed: number; i: number; dir: 1 | -1 }
  | { kind: 'follow'; distance: number };

export class Npc {
  readonly humanoid: Humanoid;
  readonly animator: Animator;
  readonly position = new THREE.Vector3();
  heading = 0;
  mode: NpcMode = { kind: 'pose', anim: 'idle' };
  /** While talking the NPC turns to face this point. */
  lookTarget: THREE.Vector3 | null = null;
  private speed = 0;

  constructor(
    readonly id: string,
    appearance: AppearanceInput,
    private readonly ground: (x: number, z: number) => number,
    seed = 1,
  ) {
    this.humanoid = buildHumanoid(parseAppearance(appearance));
    this.animator = new Animator(this.humanoid, seed);
    this.humanoid.object.name = `npc-${id}`;
  }

  get object(): THREE.Object3D {
    return this.humanoid.object;
  }

  place(x: number, z: number, heading: number, anim: AnimState = 'idle'): void {
    this.position.set(x, this.ground(x, z), z);
    this.heading = heading;
    this.mode = { kind: 'pose', anim };
  }

  /** Head height position (for camera framing and look-at). */
  head(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.position).add(new THREE.Vector3(0, this.humanoid.dims.height * (this.mode.kind === 'pose' && this.mode.anim.startsWith('sit') ? 0.62 : 0.93), 0));
  }

  private stepToward(target: THREE.Vector3, speed: number, dt: number): boolean {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15) return true;
    const step = Math.min(d, speed * dt);
    this.position.x += (dx / d) * step;
    this.position.z += (dz / d) * step;
    this.position.y = this.ground(this.position.x, this.position.z);
    const want = Math.atan2(dx, dz);
    let dh = want - this.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += dh * Math.min(1, dt * 8);
    return false;
  }

  update(dt: number, player: THREE.Vector3, playerSpeed: number, playerHeading: number, camera: THREE.Vector3): void {
    const m = this.mode;
    let anim: AnimState = 'idle';
    this.speed = 0;
    if (this.lookTarget) {
      const want = Math.atan2(this.lookTarget.x - this.position.x, this.lookTarget.z - this.position.z);
      let dh = want - this.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.heading += dh * Math.min(1, dt * 5);
      anim = m.kind === 'pose' && (m.anim === 'sit' || m.anim === 'sitGround' || m.anim === 'drawDirt') ? m.anim : 'idle';
    } else if (m.kind === 'pose') {
      anim = m.anim;
    } else if (m.kind === 'walkTo') {
      const target = m.points[0];
      if (!target) {
        this.mode = { kind: 'pose', anim: m.then };
      } else if (this.stepToward(target, m.speed, dt)) {
        m.points.shift();
      } else {
        anim = m.speed > 2.5 ? 'run' : 'walk';
        this.speed = m.speed;
      }
    } else if (m.kind === 'patrol') {
      const target = m.points[m.i]!;
      if (this.stepToward(target, m.speed, dt)) {
        if (m.i + m.dir < 0 || m.i + m.dir >= m.points.length) m.dir = m.dir === 1 ? -1 : 1;
        m.i += m.dir;
      }
      anim = 'walk';
      this.speed = m.speed;
    } else if (m.kind === 'follow') {
      // Walk at the player's shoulder: a point beside and a little behind them.
      const side = new THREE.Vector3(Math.cos(playerHeading), 0, -Math.sin(playerHeading));
      const back = new THREE.Vector3(Math.sin(playerHeading), 0, Math.cos(playerHeading)).multiplyScalar(-0.8);
      const slot = player.clone().addScaledVector(side, -m.distance).add(back);
      const d = Math.hypot(slot.x - this.position.x, slot.z - this.position.z);
      if (d > 0.6) {
        const sp = d > 6 ? Math.max(4.5, playerSpeed) : Math.max(1.3, Math.min(playerSpeed + 0.4, d * 1.6));
        this.stepToward(slot, sp, dt);
        anim = sp > 2.6 ? 'run' : 'walk';
        this.speed = sp;
      } else {
        const want = Math.atan2(player.x - this.position.x, player.z - this.position.z) * 0.2 + playerHeading * 0.8;
        let dh = want - this.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        this.heading += dh * Math.min(1, dt * 3);
      }
      if (d > 60) this.position.copy(slot).setY(this.ground(slot.x, slot.z)); // never get lost
    }
    const o = this.object;
    o.position.copy(this.position);
    o.rotation.y = this.heading;
    const dist = this.position.distanceTo(camera);
    o.visible = dist < 180;
    if (o.visible && dist < 100) {
      this.animator.play(anim);
      this.animator.update(dt, this.speed);
    }
  }

  dispose(): void {
    this.humanoid.dispose();
  }
}
