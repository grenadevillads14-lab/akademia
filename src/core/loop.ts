/**
 * Fixed-timestep accumulator. Physics and gameplay simulation run at a fixed rate
 * (default 60 Hz) regardless of display refresh; rendering interpolates with `alpha`.
 */
export interface StepResult {
  /** Number of fixed steps executed this frame. */
  steps: number;
  /** Leftover fraction of a step, 0..1, for render interpolation. */
  alpha: number;
  /** True if simulation backlog was dropped to avoid a spiral of death. */
  dropped: boolean;
}

export class FixedStep {
  private accumulator = 0;

  constructor(
    readonly step = 1 / 60,
    readonly maxStepsPerFrame = 5,
    /** Frame deltas above this (e.g. after a tab switch) are clamped. */
    readonly maxFrameDelta = 0.25,
  ) {}

  advance(frameDelta: number, onStep: (h: number) => void): StepResult {
    const dt = Math.min(Math.max(frameDelta, 0), this.maxFrameDelta);
    this.accumulator += dt;
    let steps = 0;
    // Small epsilon so 3 × (1/60) counts as three full steps despite float error.
    const eps = 1e-9;
    while (this.accumulator + eps >= this.step && steps < this.maxStepsPerFrame) {
      onStep(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    let dropped = false;
    if (this.accumulator + eps >= this.step) {
      this.accumulator %= this.step;
      dropped = true;
    }
    if (this.accumulator < 0) this.accumulator = 0;
    return { steps, alpha: this.accumulator / this.step, dropped };
  }

  reset(): void {
    this.accumulator = 0;
  }
}
