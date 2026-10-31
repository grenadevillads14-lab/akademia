import * as THREE from 'three';
import { Builder, Frame } from './kit';

/**
 * The Doric order (docs/RESEARCH.md §11; Vitruvius 4.3).
 * Module = lower column diameter D. 4th-century proportions: column height ≈ 5.8 D, 20 flutes meeting in
 * sharp arrises, subtle entasis from a third of the way up, echinus + abacus capital; architrave ≈ 0.55 D
 * with a taenia; frieze of triglyphs (painted blue-black) and metopes; mutules and guttae; cornice.
 * Gymnasia were poros limestone, stuccoed (the ashlar/whitewash materials stand in).
 */

/** A fluted column shaft with entasis as a lathe-like geometry (20 flutes). */
export function fluteShaft(D: number, H: number, detail: 0 | 1 = 0): THREE.BufferGeometry {
  const flutes = 20;
  const perFlute = detail === 0 ? 4 : 2;
  const radial = flutes * perFlute;
  const rings = detail === 0 ? 12 : 6;
  const pos: number[] = [];
  const idx: number[] = [];
  const r0 = D / 2;
  const r1 = r0 * 0.78; // upper diameter ≈ 0.78 D
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const y = t * H;
    // Entasis: a gentle swell (max ~1.5% of D) peaking around 0.35 H.
    const swell = Math.sin(Math.min(1, t / 0.9) * Math.PI) * 0.015 * D;
    const r = r0 + (r1 - r0) * t + swell;
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      // Shallow concave flutes meeting at sharp arrises.
      const f = (i % perFlute) / perFlute;
      const depth = Math.sin(f * Math.PI) * r * 0.045;
      const rr = r - depth;
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < radial; i++) {
      const a = j * (radial + 1) + i;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  g.dispose();
  ng.computeVertexNormals();
  return ng;
}

export interface DoricSpec {
  D: number; // lower column diameter
  H: number; // column height
}

export const GYMNASIUM_ORDER: DoricSpec = { D: 0.62, H: 3.6 };

/** One column with capital, placed with its base at (x, y, z). */
export function column(b: Builder, x: number, y: number, z: number, o: DoricSpec, rot = 0, detail: 0 | 1 = 0): void {
  const shaft = fluteShaft(o.D, o.H - o.D * 0.38, detail);
  b.geometry('whitewash', shaft, new THREE.Vector3(x, y, z), new THREE.Euler(0, rot, 0));
  shaft.dispose();
  // Echinus (cushion) and abacus (square slab).
  const top = y + o.H - o.D * 0.38;
  const echinus = new THREE.CylinderGeometry(o.D * 0.62, o.D * 0.4, o.D * 0.2, 20);
  b.geometry('whitewash', echinus, new THREE.Vector3(x, top + o.D * 0.1, z), new THREE.Euler(0, rot, 0));
  echinus.dispose();
  b.box('whitewash', x, top + o.D * 0.29, z, o.D * 1.18, o.D * 0.18, o.D * 1.18, rot);
}

/**
 * Entablature along a run of columns in a frame: from local x0 to x1 at local z, with the frieze facing
 * local +Z (`face` = 1) or -Z (-1). Triglyphs over every column and between columns.
 */
export function entablature(b: Builder, f: Frame, x0: number, x1: number, z: number, y: number, o: DoricSpec, spacing: number, face: 1 | -1): void {
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const archH = o.D * 0.55;
  const friezeH = o.D * 0.65;
  const depth = o.D * 1.1;
  const blue = new THREE.Color(0.32, 0.38, 0.55);
  const red = new THREE.Color(0.75, 0.32, 0.22);
  // Architrave and its taenia (red band).
  b.boxIn(f, 'whitewash', cx, y + archH / 2, z, len + o.D, archH, depth);
  b.boxIn(f, 'paint', cx, y + archH + 0.03, z + face * (depth / 2 + 0.01), len + o.D, 0.06, 0.04, red);
  // Frieze body.
  const fy = y + archH + 0.06;
  b.boxIn(f, 'whitewash', cx, fy + friezeH / 2, z, len + o.D, friezeH, depth * 0.92);
  // Triglyphs: over each column and midway between.
  const tw = o.D * 0.5;
  for (let x = x0; x <= x1 + 1e-3; x += spacing / 2) {
    b.boxIn(f, 'paint', x, fy + friezeH / 2, z + face * (depth * 0.46 + 0.03), tw, friezeH, 0.07, blue);
    // Guttae under the regula.
    for (let g = -2.5; g <= 2.5; g += 1) b.boxIn(f, 'paint', x + g * tw * 0.16, fy - 0.04, z + face * (depth / 2 + 0.02), 0.04, 0.05, 0.05, blue);
  }
  // Cornice (geison) projecting, with a red sima line.
  const cy = fy + friezeH;
  b.boxIn(f, 'whitewash', cx, cy + 0.1, z + face * 0.08, len + o.D + 0.5, 0.2, depth + 0.35);
  b.boxIn(f, 'paint', cx, cy + 0.22, z + face * (depth / 2 + 0.25), len + o.D + 0.5, 0.04, 0.04, red);
}

/** Total height of columns + entablature, for placing roofs. */
export const orderHeight = (o: DoricSpec) => o.H + o.D * 0.55 + 0.06 + o.D * 0.65 + 0.3;

/**
 * A stoa (portico): a row of columns in front of a back wall, with a lean-to tiled roof.
 * Local frame: columns run along X at z = depth/2, back wall at z = -depth/2, facing +Z.
 */
export function stoa(b: Builder, f: Frame, length: number, depth: number, o: DoricSpec, opts: { backWall?: boolean; interior?: boolean; detail?: 0 | 1 } = {}): void {
  const n = Math.max(2, Math.round(length / (o.D * 4.2)));
  const spacing = length / (n - 1);
  const x0 = -length / 2;
  // Stylobate (three steps).
  for (let s = 0; s < 3; s++) b.boxIn(f, 'ashlar', 0, 0.12 + s * 0.2 - 0.6 + 0.5, depth / 2 - s * 0.25, length + o.D * 2 - s * 0.4, 0.2, o.D * 2.2 - s * 0.3);
  b.boxIn(f, 'paving', 0, 0.52, 0, length + o.D, 0.1, depth);
  const base = f.y + 0.57;
  for (let i = 0; i < n; i++) {
    const [x, z] = f.toWorld(x0 + i * spacing, depth / 2);
    column(b, x, base, z, o, f.rot, opts.detail ?? 0);
  }
  const ef = new Frame(f.x, f.z, f.rot, base);
  entablature(b, ef, x0, x0 + length, depth / 2, o.H, o, spacing, 1);
  const top = orderHeight(o);
  if (opts.backWall !== false) {
    b.boxIn(f, 'whitewash', 0, 0.57 + top / 2, -depth / 2, length + o.D * 1.4, top, 0.6);
    // Exedra niches / doors along the back.
    for (let i = 1; i < n - 1; i += 3) b.boxIn(f, 'dark', x0 + i * spacing, 0.57 + 1.3, -depth / 2 + 0.31, 1.4, 2.6, 0.05);
  }
  // Lean-to roof sloping toward the colonnade.
  const roofFrame = f.sub(0, 0, 0, f.y + 0.57 + top);
  const hw = length / 2 + o.D + 0.4;
  const geo = new THREE.BufferGeometry();
  const rise = depth * 0.22;
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-hw, 0, depth / 2 + 0.7, hw, 0, depth / 2 + 0.7, hw, rise, -depth / 2 - 0.3, -hw, rise, -depth / 2 - 0.3], 3));
  const slope = Math.hypot(depth + 1, rise);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, hw * 2, 0, hw * 2, slope, 0, slope], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  const [rx, rz] = roofFrame.toWorld(0, 0);
  b.geometry('roof', geo, new THREE.Vector3(rx, roofFrame.y, rz), new THREE.Euler(0, f.rot, 0), new THREE.Vector3(1, 1, 1), { keepUv: true });
  const under = geo.clone();
  under.translate(0, -0.1, 0);
  under.setIndex([0, 2, 1, 0, 3, 2]);
  under.computeVertexNormals();
  b.geometry('wood', under, new THREE.Vector3(rx, roofFrame.y, rz), new THREE.Euler(0, f.rot, 0));
  geo.dispose();
  under.dispose();
}
