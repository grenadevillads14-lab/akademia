import { closestOnPolyline } from '../procgen/geometry2d';
import { FOG_N, type GameState } from '../systems/state';
import type { Layout } from '../world/layout';
import type { Poi } from '../world/structures';

/**
 * A hand-drawn-looking map of the world (drawn on canvas from the layout data): papyrus ground,
 * rivers and Cimon's channels in ink-blue, roads and paths in sepia, buildings as hatched blocks,
 * zone names in capitals, herms and the objective marked. Unexplored areas are hidden under fog.
 */
export function drawMap(
  canvas: HTMLCanvasElement,
  layout: Layout,
  pois: Poi[],
  state: GameState,
  player: { x: number; z: number; heading: number },
  objective: [number, number] | null,
  zoneName: (key: string) => string,
): void {
  const g = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  const b = layout.bounds;
  const sx = W / (b.maxX - b.minX);
  const sz = H / (b.maxZ - b.minZ);
  const s = Math.min(sx, sz);
  const ox = (W - (b.maxX - b.minX) * s) / 2;
  const oz = (H - (b.maxZ - b.minZ) * s) / 2;
  const px = (x: number) => ox + (x - b.minX) * s;
  const pz = (z: number) => oz + (z - b.minZ) * s;

  // Papyrus.
  const grad = g.createRadialGradient(W / 2, H / 2, W * 0.1, W / 2, H / 2, W * 0.75);
  grad.addColorStop(0, '#efe0bd');
  grad.addColorStop(1, '#d6bf8f');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Fibre texture.
  g.globalAlpha = 0.08;
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = i % 2 ? '#8a6a3a' : '#fff6dc';
    g.beginPath();
    const y = (i / 260) * H;
    g.moveTo(0, y);
    g.lineTo(W, y + Math.sin(i) * 3);
    g.stroke();
  }
  g.globalAlpha = 1;

  // Hills as hachured circles.
  g.strokeStyle = 'rgba(120, 90, 50, 0.45)';
  for (const h of layout.hills) {
    for (let r = 0.3; r <= 1; r += 0.18) {
      g.beginPath();
      g.arc(px(h.x), pz(h.z), h.radius * s * r, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // Water.
  const line = (pts: readonly (readonly [number, number])[], width: number, color: string, dash: number[] = []) => {
    g.strokeStyle = color;
    g.lineWidth = Math.max(1, width);
    g.setLineDash(dash);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))));
    g.stroke();
    g.setLineDash([]);
  };
  for (const r of layout.rivers) line(r.points, r.width * s * 0.9, 'rgba(70, 105, 130, 0.85)');
  for (const c of layout.channels) line(c.points, 1.6, 'rgba(70, 105, 130, 0.8)');
  for (const p of layout.paths) line(p.points, Math.max(1.2, p.width * s * 0.7), p.surface === 'road' ? 'rgba(120, 80, 45, 0.75)' : 'rgba(120, 80, 45, 0.55)', p.surface === 'road' ? [] : [4, 3]);
  // Built areas (flats that aren't grass) as hatched blocks.
  g.fillStyle = 'rgba(110, 70, 40, 0.25)';
  g.strokeStyle = 'rgba(90, 55, 30, 0.6)';
  for (const f of layout.flats) {
    if (f.surface === 'grass') continue;
    g.save();
    g.translate(px(f.x), pz(f.z));
    g.rotate(-(f.rot ?? 0));
    g.fillRect(-f.hw * s, -f.hd * s, f.hw * 2 * s, f.hd * 2 * s);
    g.strokeRect(-f.hw * s, -f.hd * s, f.hw * 2 * s, f.hd * 2 * s);
    g.restore();
  }
  // Moriai and herms.
  for (const p of pois) {
    if (p.kind === 'moria') {
      g.fillStyle = state.data.discovered.collectibles.moriai?.includes(p.id) ? '#4f6a3a' : 'rgba(79, 106, 58, 0.45)';
      g.beginPath();
      g.arc(px(p.position.x), pz(p.position.z), 3.5, 0, Math.PI * 2);
      g.fill();
    } else if (p.kind === 'herm' && state.data.discovered.herms.includes(p.id)) {
      g.fillStyle = '#8c3b2a';
      g.fillRect(px(p.position.x) - 3, pz(p.position.z) - 5, 6, 10);
    }
  }
  // Zone names.
  g.fillStyle = 'rgba(70, 40, 20, 0.85)';
  g.textAlign = 'center';
  g.font = `${Math.round(W / 70)}px "Cinzel", "Palatino Linotype", serif`;
  for (const zn of layout.zones) g.fillText(zoneName(zn.nameKey).toUpperCase(), px(zn.center[0]), pz(zn.center[1]));

  // Fog of war.
  const fog = state.data.discovered.fog;
  if (fog.length === FOG_N * FOG_N) {
    const cw = (b.maxX - b.minX) / FOG_N;
    const chh = (b.maxZ - b.minZ) / FOG_N;
    g.fillStyle = 'rgba(214, 191, 143, 0.97)';
    for (let j = 0; j < FOG_N; j++) {
      for (let i = 0; i < FOG_N; i++) {
        if (fog[j * FOG_N + i] === '1') continue;
        g.fillRect(px(b.minX + i * cw) - 0.5, pz(b.minZ + j * chh) - 0.5, cw * s + 1, chh * s + 1);
      }
    }
  }

  // Objective and player.
  if (objective) {
    g.strokeStyle = '#b4582f';
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(px(objective[0]), pz(objective[1]), 9, 0, Math.PI * 2);
    g.stroke();
  }
  g.save();
  g.translate(px(player.x), pz(player.z));
  g.rotate(-player.heading + Math.PI);
  g.fillStyle = '#1c1410';
  g.beginPath();
  g.moveTo(0, -9);
  g.lineTo(6, 7);
  g.lineTo(0, 3);
  g.lineTo(-6, 7);
  g.closePath();
  g.fill();
  g.restore();
  // Compass rose.
  g.fillStyle = 'rgba(70, 40, 20, 0.9)';
  g.font = `${Math.round(W / 55)}px serif`;
  g.fillText('N', W - 30, 34);
  g.beginPath();
  g.moveTo(W - 30, 40);
  g.lineTo(W - 25, 60);
  g.lineTo(W - 35, 60);
  g.fill();
  void closestOnPolyline;
}
