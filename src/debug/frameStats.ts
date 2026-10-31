/** Rolling frame-time statistics. Pure; used by the overlay and the benchmark. */
export class FrameStats {
  private readonly samples: Float64Array;
  private count = 0;
  private head = 0;

  constructor(readonly capacity = 240) {
    this.samples = new Float64Array(capacity);
  }

  push(frameMs: number): void {
    this.samples[this.head] = frameMs;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  get size(): number {
    return this.count;
  }

  values(): number[] {
    return Array.from(this.samples.subarray(0, this.count));
  }

  avgMs(): number {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) sum += this.samples[i]!;
    return sum / this.count;
  }

  avgFps(): number {
    const ms = this.avgMs();
    return ms > 0 ? 1000 / ms : 0;
  }

  /** Frame time at a percentile, e.g. 99 → the slowest 1% boundary. */
  percentileMs(p: number): number {
    return percentile(this.values(), p);
  }

  /** "1% low" fps: average fps of the slowest 1% of frames. */
  onePercentLowFps(): number {
    return lowFps(this.values(), 0.01);
  }

  reset(): void {
    this.count = 0;
    this.head = 0;
  }
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

export function lowFps(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  const n = Math.max(1, Math.floor(sorted.length * fraction));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sorted[i]!;
  const avg = sum / n;
  return avg > 0 ? 1000 / avg : 0;
}
