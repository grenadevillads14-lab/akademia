import type * as THREE from 'three';
import { t } from '../core/i18n';
import type { FrameStats } from './frameStats';

export interface OverlayExtras {
  bodies: number;
  preset: string;
  gpu: string;
  camera: string;
}

/** Debug stats panel (F3). Refreshes a few times a second to stay cheap. */
export class DebugOverlay {
  readonly el: HTMLDivElement;
  private visible: boolean;
  private sinceRefresh = 0;

  constructor(parent: HTMLElement, visible = true) {
    this.el = document.createElement('div');
    this.el.className = 'debug-overlay';
    this.el.setAttribute('data-testid', 'debug-overlay');
    parent.appendChild(this.el);
    this.visible = visible;
    this.el.hidden = !visible;
  }

  toggle(): boolean {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
    return this.visible;
  }

  update(dt: number, stats: FrameStats, info: THREE.WebGLInfo, extras: OverlayExtras): void {
    this.sinceRefresh += dt;
    if (!this.visible || this.sinceRefresh < 0.25) return;
    this.sinceRefresh = 0;
    const rows: [string, string][] = [
      [t('overlay.fps'), stats.avgFps().toFixed(0)],
      [t('overlay.frame'), `${stats.avgMs().toFixed(2)} ms`],
      [t('overlay.low'), stats.onePercentLowFps().toFixed(0)],
      [t('overlay.calls'), String(info.render.calls)],
      [t('overlay.tris'), info.render.triangles.toLocaleString('en-US')],
      [t('overlay.geos'), String(info.memory.geometries)],
      [t('overlay.tex'), String(info.memory.textures)],
      [t('overlay.programs'), String(info.programs?.length ?? 0)],
      [t('overlay.bodies'), String(extras.bodies)],
      [t('overlay.preset'), extras.preset],
      [t('overlay.camera'), extras.camera],
      [t('overlay.gpu'), extras.gpu],
    ];
    this.el.replaceChildren(
      ...rows.map(([k, v]) => {
        const row = document.createElement('div');
        const key = document.createElement('span');
        key.textContent = k;
        const val = document.createElement('b');
        val.textContent = v;
        row.append(key, val);
        return row;
      }),
    );
  }
}
