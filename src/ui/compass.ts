/**
 * Compass strip at the top of the screen: cardinal points, the current objective, and discovered herms
 * within range. Bearings are measured clockwise from north (−Z).
 */
export class Compass {
  readonly root: HTMLDivElement;
  private readonly fov = Math.PI * 0.9;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'compass';
    parent.appendChild(this.root);
  }

  update(cameraYaw: number, from: { x: number; z: number }, markers: { x: number; z: number; label: string; kind: 'objective' | 'herm' }[]): void {
    // Camera looks along -Z at yaw 0 → facing north; bearing increases clockwise (east).
    const facing = -cameraYaw;
    const items: { b: number; text: string; cls: string }[] = [];
    const cardinals: [number, string][] = [[0, 'N'], [Math.PI / 2, 'E'], [Math.PI, 'S'], [-Math.PI / 2, 'W']];
    for (const [b, l] of cardinals) items.push({ b, text: l, cls: '' });
    for (let k = 0; k < 16; k++) if (k % 4) items.push({ b: (k / 16) * Math.PI * 2, text: '·', cls: 'tick' });
    for (const m of markers) {
      const b = Math.atan2(m.x - from.x, -(m.z - from.z));
      items.push({ b, text: m.kind === 'objective' ? '◆' : 'Ⅱ', cls: m.kind === 'objective' ? 'marker' : 'tick' });
    }
    const w = this.root.clientWidth || 400;
    const spans: HTMLSpanElement[] = [];
    for (const it of items) {
      let d = it.b - facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > this.fov / 2) continue;
      const s = document.createElement('span');
      s.textContent = it.text;
      if (it.cls) s.className = it.cls;
      s.style.left = `${(0.5 + d / this.fov) * w}px`;
      spans.push(s);
    }
    this.root.replaceChildren(...spans);
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
  }
}
