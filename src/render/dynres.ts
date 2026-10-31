import type * as THREE from 'three';

/**
 * Dynamic resolution: render as sharp as the display allows (up to its full device pixel ratio) and back off
 * when frames run long. rAF on a 60 Hz display caps frame time at ~16.7 ms, so headroom can't be measured
 * directly: the scale creeps up while frames stay on time, drops quickly when they don't, and remembers the
 * level that last failed so it doesn't oscillate.
 */
export class DynamicResolution {
  scale: number;
  private acc = 0;
  private n = 0;
  private slow = 0;
  private settle = 2;
  private ceiling: number;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly min: number,
    private readonly max: number,
    start: number,
  ) {
    this.scale = Math.min(max, Math.max(min, start));
    this.ceiling = max;
    this.apply();
  }

  /** Re-apply after a window resize. */
  apply(): void {
    this.renderer.setPixelRatio(this.scale);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  /** Call once per frame with the real frame time in ms. */
  update(frameMs: number): void {
    if (frameMs > 250) return; // tab switch, loading hitch
    this.acc += frameMs;
    this.n++;
    if (frameMs > 21) this.slow++;
    if (this.acc < 1500) return;
    const avg = this.acc / this.n;
    const slowShare = this.slow / this.n;
    this.acc = 0;
    this.n = 0;
    this.slow = 0;
    if (this.settle > 0) {
      this.settle--;
      return;
    }
    let next = this.scale;
    if (avg > 19 || slowShare > 0.15) {
      this.ceiling = Math.max(this.min, this.scale - 0.05);
      next = this.scale * (avg > 26 ? 0.82 : 0.9);
    } else if (avg < 17.6 && slowShare < 0.03 && this.scale < this.ceiling) {
      next = this.scale + 0.08;
    } else if (avg < 17.6 && slowShare < 0.01) {
      // Slowly test above the remembered ceiling again (the scene may have got lighter).
      this.ceiling = Math.min(this.max, this.ceiling + 0.02);
    }
    next = Math.min(this.ceiling, Math.max(this.min, next));
    if (Math.abs(next - this.scale) > 0.02) {
      this.scale = next;
      this.apply();
      this.settle = 1;
    }
  }
}
