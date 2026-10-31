import type * as THREE from 'three';
import { t } from '../core/i18n';
import { lowFps, percentile } from './frameStats';

/**
 * In-game benchmark. Open the game with `?bench` (optionally `?bench=30` for 30 s).
 * It flies a fixed camera path, records every frame time, then shows a report with a
 * "Copy result" button. This is how real-hardware performance gets measured: the cloud
 * build machine has no GPU, so its numbers are meaningless.
 */
export interface BenchmarkResult {
  build: string;
  scene: string;
  durationSec: number;
  frames: number;
  avgFps: number;
  onePercentLowFps: number;
  p50Ms: number;
  p99Ms: number;
  worstMs: number;
  /** Average CPU+GPU time per frame (measured with gl.finish). Not capped by vsync. */
  avgWorkMs: number;
  p99WorkMs: number;
  /** 1000 / avgWorkMs: roughly the fps this machine could reach without the display's refresh cap. */
  estUncappedFps: number;
  avgDrawCalls: number;
  avgTriangles: number;
  gpu: string;
  preset: string;
  canvas: string;
  devicePixelRatio: number;
  userAgent: string;
  timestamp: string;
}

export type CameraPath = (t01: number, camera: THREE.PerspectiveCamera) => void;

export class Benchmark {
  private elapsed = 0;
  private readonly frameMs: number[] = [];
  private readonly workMs: number[] = [];
  private calls = 0;
  private tris = 0;
  private done = false;
  private readonly banner: HTMLDivElement;

  constructor(
    private readonly parent: HTMLElement,
    private readonly path: CameraPath,
    private readonly meta: { scene: string; gpu: string; preset: string },
    readonly durationSec = 20,
    readonly warmupSec = 2,
  ) {
    this.banner = document.createElement('div');
    this.banner.className = 'bench-banner';
    parent.appendChild(this.banner);
  }

  get finished(): boolean {
    return this.done;
  }

  /** Call once per rendered frame, after rendering. Returns the result on the final frame. */
  update(dtSec: number, camera: THREE.PerspectiveCamera, info: THREE.WebGLInfo, workMs: number): BenchmarkResult | null {
    if (this.done) return null;
    this.elapsed += dtSec;
    const total = this.warmupSec + this.durationSec;
    this.path(Math.min(1, this.elapsed / total), camera);

    if (this.elapsed > this.warmupSec) {
      this.frameMs.push(dtSec * 1000);
      this.workMs.push(workMs);
      this.calls += info.render.calls;
      this.tris += info.render.triangles;
    }
    this.banner.textContent = t('bench.running', { seconds: Math.max(0, Math.ceil(total - this.elapsed)) });

    if (this.elapsed < total) return null;
    this.done = true;
    this.banner.remove();
    const result = this.buildResult();
    this.showReport(result);
    return result;
  }

  private buildResult(): BenchmarkResult {
    const n = Math.max(1, this.frameMs.length);
    const sum = this.frameMs.reduce((a, b) => a + b, 0);
    const canvas = document.querySelector('canvas');
    const avgWork = this.workMs.reduce((a, b) => a + b, 0) / Math.max(1, this.workMs.length);
    return {
      build: __APP_VERSION__,
      scene: this.meta.scene,
      durationSec: this.durationSec,
      frames: this.frameMs.length,
      avgFps: round(sum > 0 ? (1000 * this.frameMs.length) / sum : 0),
      onePercentLowFps: round(lowFps(this.frameMs, 0.01)),
      p50Ms: round(percentile(this.frameMs, 50)),
      p99Ms: round(percentile(this.frameMs, 99)),
      worstMs: round(Math.max(0, ...this.frameMs)),
      avgWorkMs: round(avgWork),
      p99WorkMs: round(percentile(this.workMs, 99)),
      estUncappedFps: Math.round(avgWork > 0 ? 1000 / avgWork : 0),
      avgDrawCalls: Math.round(this.calls / n),
      avgTriangles: Math.round(this.tris / n),
      gpu: this.meta.gpu,
      preset: this.meta.preset,
      canvas: canvas ? `${canvas.width}x${canvas.height}` : 'unknown',
      devicePixelRatio: window.devicePixelRatio,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };
  }

  private showReport(result: BenchmarkResult): void {
    const panel = document.createElement('div');
    panel.className = 'bench-report papyrus';
    panel.setAttribute('data-testid', 'bench-report');
    const h = document.createElement('h2');
    h.textContent = t('bench.title');
    const note = document.createElement('p');
    note.textContent = t('bench.note');
    const pre = document.createElement('pre');
    const json = JSON.stringify(result, null, 2);
    pre.textContent = json;
    const copy = document.createElement('button');
    copy.textContent = t('bench.copy');
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(json);
        copy.textContent = t('bench.copied');
      } catch {
        const range = document.createRange();
        range.selectNodeContents(pre);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
      }
    };
    const close = document.createElement('button');
    close.textContent = t('bench.close');
    close.onclick = () => panel.remove();
    const buttons = document.createElement('div');
    buttons.className = 'buttons';
    buttons.append(copy, close);
    panel.append(h, note, pre, buttons);
    this.parent.appendChild(panel);
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
