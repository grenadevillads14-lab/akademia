import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { InputState } from '../core/input';
import type { Physics } from '../physics/physics';
import type { Heightfield } from '../world/heightfield';

/**
 * Third-person orbit camera with collision (Rapier ray cast from the pivot), terrain clearance,
 * mouse and right-stick look, wheel zoom, and a "shot" override that dialogue and cutscenes use
 * to frame speakers. Transitions between follow and shots are smoothed.
 */
export class ThirdPersonCamera {
  yaw = 0;
  pitch = -0.18;
  distance = 4.2;
  minDistance = 1.6;
  maxDistance = 9;
  sensitivity = 0.0024;
  padSensitivity = 2.6;
  invertY = false;
  /** Pivot height above the feet and sideways shoulder offset. */
  pivotHeight = 1.55;
  shoulder = 0.35;
  private readonly pivot = new THREE.Vector3();
  private readonly smoothPivot = new THREE.Vector3();
  private currentDist = 4.2;
  private shot: { pos: THREE.Vector3; look: THREE.Vector3; fov: number } | null = null;
  private blend = 0;
  private lastShot: { pos: THREE.Vector3; look: THREE.Vector3; fov: number } | null = null;
  private readonly followPos = new THREE.Vector3();
  private readonly followLook = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private initialised = false;
  baseFov = 55;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly physics: Physics | null,
    private readonly hf: Heightfield | null,
  ) {}

  /** Frame a dialogue/cutscene shot; pass null to return to follow mode. */
  setShot(shot: { pos: THREE.Vector3; look: THREE.Vector3; fov?: number } | null): void {
    this.shot = shot ? { pos: shot.pos.clone(), look: shot.look.clone(), fov: shot.fov ?? 40 } : null;
  }

  get inShot(): boolean {
    return this.shot !== null;
  }

  handleInput(input: InputState, pointerLocked: boolean, dt: number): void {
    if (pointerLocked) {
      this.yaw -= input.mouseDX * this.sensitivity;
      this.pitch -= input.mouseDY * this.sensitivity * (this.invertY ? -1 : 1);
    }
    this.yaw -= input.padLookX * this.padSensitivity * dt;
    this.pitch -= input.padLookY * this.padSensitivity * 0.7 * dt * (this.invertY ? -1 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.25, 0.65);
    if (input.wheel !== 0) this.distance = THREE.MathUtils.clamp(this.distance + input.wheel * 0.6, this.minDistance, this.maxDistance);
  }

  /** Snap behind a heading (spawn, teleport). */
  snapBehind(heading: number): void {
    this.yaw = heading + Math.PI;
    this.initialised = false;
  }

  update(target: THREE.Vector3, dt: number, exclude?: RAPIER.Collider): void {
    this.pivot.set(target.x, target.y + this.pivotHeight, target.z);
    if (!this.initialised) {
      this.smoothPivot.copy(this.pivot);
      this.initialised = true;
    }
    this.smoothPivot.lerp(this.pivot, 1 - Math.exp(-dt * 14));

    // Desired orbit position (camera looks along -Z at yaw 0, so it sits on +Z behind the target).
    const cp = Math.cos(this.pitch);
    const dir = this.tmp.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const origin = this.smoothPivot.clone().addScaledVector(right, this.shoulder);

    // Collision: shorten the arm if something is between pivot and camera.
    let dist = this.distance;
    if (this.physics) {
      const R = this.physics.R;
      const ray = new R.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
      const hit = this.physics.world.castRay(ray, this.distance + 0.3, true, undefined, undefined, exclude);
      if (hit) dist = Math.max(0.6, hit.timeOfImpact - 0.3);
    }
    // Pull in fast, ease out slowly (avoids popping).
    this.currentDist = dist < this.currentDist ? dist : this.currentDist + (dist - this.currentDist) * (1 - Math.exp(-dt * 3));
    this.followPos.copy(origin).addScaledVector(dir, this.currentDist);
    if (this.hf) {
      const ground = this.hf.height(this.followPos.x, this.followPos.z) + 0.35;
      if (this.followPos.y < ground) this.followPos.y = ground;
    }
    this.followLook.copy(origin).addScaledVector(dir, -2);

    // Blend to/from a framed shot.
    this.blend = THREE.MathUtils.clamp(this.blend + (this.shot ? dt : -dt) * 2.2, 0, 1);
    const b = this.blend * this.blend * (3 - 2 * this.blend);
    if (this.shot) this.lastShot = this.shot;
    const s = this.shot ?? this.lastShot;
    if (s && b > 0) {
      this.camera.position.lerpVectors(this.followPos, s.pos, b);
      const look = this.followLook.clone().lerp(s.look, b);
      this.camera.lookAt(look);
      this.camera.fov = THREE.MathUtils.lerp(this.baseFov, s.fov, b);
    } else {
      this.camera.position.copy(this.followPos);
      this.camera.lookAt(this.followLook);
      this.camera.fov = this.baseFov;
    }
    this.camera.updateProjectionMatrix();
  }
}
