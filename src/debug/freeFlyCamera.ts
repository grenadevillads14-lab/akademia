import * as THREE from 'three';
import type { InputState } from '../core/input';

/**
 * Free-fly debug camera (F2). Mouse look requires pointer lock (click the canvas).
 * WASD to move, E/Q up/down, Shift ×4, Alt ×0.25, mouse wheel changes base speed.
 */
export class FreeFlyCamera {
  enabled = false;
  speed = 12; // m/s
  sensitivity = 0.0022;
  private yaw = 0;
  private pitch = 0;
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly move = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /** Start flying from wherever the camera currently is, keeping its view direction. */
  enable(): void {
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  update(dt: number, input: InputState, pointerLocked: boolean): void {
    if (!this.enabled) return;

    if (pointerLocked) {
      this.yaw -= input.mouseDX * this.sensitivity;
      this.pitch -= input.mouseDY * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    }
    if (input.wheel !== 0) {
      this.speed = THREE.MathUtils.clamp(this.speed * (input.wheel < 0 ? 1.25 : 0.8), 0.5, 400);
    }
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    this.camera.getWorldDirection(this.forward);
    this.right.crossVectors(this.forward, this.camera.up).normalize();
    this.move
      .set(0, 0, 0)
      .addScaledVector(this.forward, input.axis('moveBack', 'moveForward'))
      .addScaledVector(this.right, input.axis('moveLeft', 'moveRight'));
    this.move.y += input.axis('moveDown', 'moveUp');
    if (this.move.lengthSq() === 0) return;

    let speed = this.speed;
    if (input.isDown('sprint')) speed *= 4;
    if (input.isDown('slow')) speed *= 0.25;
    this.camera.position.addScaledVector(this.move.normalize(), speed * dt);
  }
}
