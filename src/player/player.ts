import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Animator } from '../characters/animator';
import type { Appearance } from '../characters/appearance';
import { buildHumanoid } from '../characters/build';
import type { Humanoid } from '../characters/humanoid';
import type { InputState } from '../core/input';
import type { Physics } from '../physics/physics';
import type { Heightfield } from '../world/heightfield';

/**
 * The player: a Rapier kinematic character controller (capsule) with walking, jogging, sprinting,
 * jumping, auto-stepping onto low walls and steps, and swimming in deep water.
 * Simulation runs in fixed steps; the visible character interpolates between them.
 */
export const MOVE = {
  walk: 1.5,
  jog: 3.8,
  sprint: 6.4,
  swim: 1.9,
  jumpSpeed: 5.0,
  gravity: 19,
  groundAccel: 14,
  airAccel: 3,
  turnRate: 10,
} as const;

const RADIUS = 0.3;
const HALF_HEIGHT = 0.55;
const FOOT_OFFSET = HALF_HEIGHT + RADIUS; // capsule centre above the feet

export type Locomotion = 'idle' | 'walk' | 'run' | 'sprint' | 'jump' | 'fall' | 'swim';

export class Player {
  humanoid: Humanoid;
  animator: Animator;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  /** Feet position (render-interpolated). */
  readonly position = new THREE.Vector3();
  private readonly prev = new THREE.Vector3();
  private readonly curr = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  heading = 0;
  grounded = false;
  swimming = false;
  locomotion: Locomotion = 'idle';
  /** When false, input is ignored (dialogue, puzzles, cutscenes). */
  controlEnabled = true;
  /** Stamina 0..1 (sprinting, swimming); Gymnastikē raises the drain rate cap. */
  stamina = 1;
  staminaDrain = 0.12;
  private jumpQueued = false;
  private airTime = 0;
  private moveWish = new THREE.Vector2();
  private sprintHeld = false;
  private walkHeld = false;

  constructor(
    private readonly physics: Physics,
    private readonly hf: Heightfield,
    appearance: Appearance,
    spawn: { x: number; z: number; heading: number },
  ) {
    const R = physics.R;
    const y = hf.height(spawn.x, spawn.z) + 0.05;
    this.body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, y + FOOT_OFFSET, spawn.z));
    this.collider = physics.world.createCollider(R.ColliderDesc.capsule(HALF_HEIGHT, RADIUS).setFriction(0), this.body);
    this.controller = physics.world.createCharacterController(0.03);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.enableAutostep(0.55, 0.25, false);
    this.controller.enableSnapToGround(0.45);
    this.controller.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((58 * Math.PI) / 180);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.heading = spawn.heading;
    this.curr.set(spawn.x, y, spawn.z);
    this.prev.copy(this.curr);
    this.position.copy(this.curr);

    this.humanoid = buildHumanoid(appearance);
    this.animator = new Animator(this.humanoid, 1.7);
  }

  get object(): THREE.Object3D {
    return this.humanoid.object;
  }

  /** Read input once per rendered frame (camera yaw makes movement camera-relative). */
  readInput(input: InputState, cameraYaw: number): void {
    if (!this.controlEnabled) {
      this.moveWish.set(0, 0);
      this.sprintHeld = false;
      return;
    }
    const m = input.move();
    // Camera looks along -Z when yaw = 0; forward input moves away from the camera.
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    const fx = -sin;
    const fz = -cos;
    const rx = cos;
    const rz = -sin;
    this.moveWish.set(fx * m.y + rx * m.x, fz * m.y + rz * m.x);
    this.sprintHeld = input.isDown('sprint');
    this.walkHeld = input.isDown('walk');
    if (input.wasPressed('jump')) this.jumpQueued = true;
  }

  fixedUpdate(h: number): void {
    const t = this.body.translation();
    const feetY = t.y - FOOT_OFFSET;
    const water = this.hf.water(t.x, t.z);
    const depth = water.level - feetY;
    this.swimming = depth > 1.15;

    const wishLen = Math.min(1, this.moveWish.length());
    let speed: number = MOVE.jog;
    if (this.swimming) speed = MOVE.swim;
    else if (this.walkHeld || wishLen < 0.45) speed = MOVE.walk;
    else if (this.sprintHeld && this.stamina > 0.05) speed = MOVE.sprint;
    const sprinting = speed === MOVE.sprint && wishLen > 0.1;
    this.stamina = THREE.MathUtils.clamp(this.stamina + (sprinting || (this.swimming && wishLen > 0.1) ? -this.staminaDrain : 0.18) * h, 0, 1);

    const target = new THREE.Vector2(this.moveWish.x, this.moveWish.y);
    if (target.lengthSq() > 1) target.normalize();
    target.multiplyScalar(speed * (wishLen > 0 ? 1 : 0));
    const accel = this.grounded || this.swimming ? MOVE.groundAccel : MOVE.airAccel;
    const k = Math.min(1, accel * h);
    this.velocity.x += (target.x - this.velocity.x) * k;
    this.velocity.z += (target.y - this.velocity.z) * k;

    if (this.swimming) {
      // Float with the chest at the surface; gentle bob; drift with the current.
      const desiredFeet = water.level - 1.25;
      this.velocity.y += ((desiredFeet - feetY) * 6 - this.velocity.y) * Math.min(1, 4 * h);
      this.velocity.x += water.flowX * 0.25 * h;
      this.velocity.z += water.flowZ * 0.25 * h;
      this.jumpQueued = false;
    } else {
      this.velocity.y -= MOVE.gravity * h;
      if (this.grounded && this.velocity.y < 0) this.velocity.y = -1; // keep pressed to the ground
      if (this.jumpQueued && this.grounded) {
        this.velocity.y = MOVE.jumpSpeed;
        this.grounded = false;
      }
      this.jumpQueued = false;
    }

    const desired = { x: this.velocity.x * h, y: this.velocity.y * h, z: this.velocity.z * h };
    this.controller.computeColliderMovement(this.collider, desired);
    const mv = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;
    // If we bumped into something, kill the matching velocity so we don't "stick".
    if (h > 0) {
      const ax = mv.x / h;
      const az = mv.z / h;
      if (Math.abs(ax) < Math.abs(this.velocity.x) * 0.5) this.velocity.x = ax;
      if (Math.abs(az) < Math.abs(this.velocity.z) * 0.5) this.velocity.z = az;
    }
    const next = { x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z };
    // Never fall through the analytic ground (safety net for fast falls and terrain seams).
    const groundY = this.hf.height(next.x, next.z) + FOOT_OFFSET - 0.02;
    if (next.y < groundY - 0.5) next.y = groundY;
    this.body.setNextKinematicTranslation(next);

    this.prev.copy(this.curr);
    this.curr.set(next.x, next.y - FOOT_OFFSET, next.z);
    this.airTime = this.grounded || this.swimming ? 0 : this.airTime + h;

    // Face the direction of travel.
    const hv = Math.hypot(this.velocity.x, this.velocity.z);
    if (hv > 0.3 && this.controlEnabled) {
      const want = Math.atan2(this.velocity.x, this.velocity.z);
      let d = want - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, MOVE.turnRate * h);
    }
    if (this.swimming) this.locomotion = 'swim';
    else if (!this.grounded && this.airTime > 0.12) this.locomotion = this.velocity.y > 0 ? 'jump' : 'fall';
    else if (hv < 0.25) this.locomotion = 'idle';
    else if (hv < 2.4) this.locomotion = 'walk';
    else if (sprinting) this.locomotion = 'sprint';
    else this.locomotion = 'run';
  }

  /** Interpolate the visible character between fixed steps and animate. */
  render(alpha: number, dt: number): void {
    this.position.lerpVectors(this.prev, this.curr, alpha);
    this.object.position.copy(this.position);
    this.object.rotation.y = this.heading;
    const hv = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.controlEnabled || this.animator.state === 'walk' || this.animator.state === 'idle') {
      this.animator.play(this.locomotion);
    }
    this.animator.update(dt, hv);
  }

  /** Swap the visible body (character creation, costume changes). */
  setAppearance(appearance: Appearance): void {
    const parent = this.humanoid.object.parent;
    parent?.remove(this.humanoid.object);
    this.humanoid.dispose();
    this.humanoid = buildHumanoid(appearance);
    this.animator = new Animator(this.humanoid, 1.7);
    parent?.add(this.humanoid.object);
  }

  /** Teleport (fast travel, cutscenes, respawn). */
  teleport(x: number, z: number, heading?: number): void {
    const y = this.hf.height(x, z) + 0.05;
    this.body.setTranslation({ x, y: y + FOOT_OFFSET, z }, true);
    this.curr.set(x, y, z);
    this.prev.copy(this.curr);
    this.position.copy(this.curr);
    this.velocity.set(0, 0, 0);
    if (heading !== undefined) this.heading = heading;
  }

  dispose(): void {
    this.physics.world.removeCharacterController(this.controller);
    this.physics.world.removeRigidBody(this.body);
    this.humanoid.dispose();
  }
}

export const PLAYER_EYE_HEIGHT = 1.6;
