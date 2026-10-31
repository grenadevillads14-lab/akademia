import * as THREE from 'three';
import { noise2 } from '../procgen/noise';
import { mulberry32, range, type Rng } from '../procgen/rng';
import { atlasRect } from './leafAtlas';
import type { LevelSpec, SpeciesSpec } from './species';

/**
 * Procedural tree generator: recursive branching with gnarl and tropism, tube meshes with
 * fluted/twisted trunks (olives), and leaf-spray cards clustered at branch tips.
 *
 * Output geometries carry these attributes (all trees share them so they can be batched):
 *   wood:   position, normal, uv, aSway(vec2: height01, flex), aBark(float)
 *   leaves: position, normal, uv, aSway(vec2), aLeaf(vec2: kind, phase), aBill(float: 0 card, 1 impostor)
 */
export interface TreeGeometry {
  wood: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  height: number;
  radius: number;
}

interface Branch {
  pts: THREE.Vector3[];
  radii: number[];
  level: number;
}

/** Detail level: 0 = full, 1 = medium, 2 = low. */
export type Detail = 0 | 1 | 2;

const UP = new THREE.Vector3(0, 1, 0);

export function generateTree(spec: SpeciesSpec, seed: number, detail: Detail): TreeGeometry {
  const rng = mulberry32(seed);
  const branches: Branch[] = [];
  const clusters: { p: THREE.Vector3; r: number }[] = [];

  const trunkLen = range(rng, ...spec.trunk.length);
  const trunkR = range(rng, ...spec.trunk.radius);
  const leanDir = new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5).normalize();
  const dir0 = UP.clone().addScaledVector(leanDir, spec.trunk.lean * rng()).normalize();
  const segScale = detail === 0 ? 1 : detail === 1 ? 0.7 : 0.5;

  const grow = (start: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, level: number, levelSpec: { gnarl: number; segments: number; tropism: number }, taper: number) => {
    const n = Math.max(2, Math.round(levelSpec.segments * segScale));
    const pts = [start.clone()];
    const radii = [radius];
    const d = dir.clone();
    const p = start.clone();
    for (let i = 1; i <= n; i++) {
      // Gnarl: random rotation about an axis perpendicular to the current direction.
      const axis = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(d).normalize();
      if (axis.lengthSq() > 0) d.applyAxisAngle(axis, (rng() - 0.5) * 2 * levelSpec.gnarl);
      d.y += levelSpec.tropism / n;
      d.normalize();
      p.addScaledVector(d, length / n);
      pts.push(p.clone());
      radii.push(radius * (1 - (1 - taper) * (i / n)));
    }
    const b: Branch = { pts, radii, level };
    branches.push(b);
    return b;
  };

  const trunk = grow(new THREE.Vector3(0, -0.3, 0), dir0, trunkLen + 0.3, trunkR, 0, { gnarl: spec.trunk.gnarl, segments: spec.trunk.segments, tropism: 0 }, spec.trunk.taper);

  const pointAt = (b: Branch, t: number): { p: THREE.Vector3; r: number; d: THREE.Vector3 } => {
    const f = t * (b.pts.length - 1);
    const i = Math.min(b.pts.length - 2, Math.floor(f));
    const k = f - i;
    const a = b.pts[i]!;
    const c = b.pts[i + 1]!;
    return {
      p: a.clone().lerp(c, k),
      r: b.radii[i]! + (b.radii[i + 1]! - b.radii[i]!) * k,
      d: c.clone().sub(a).normalize(),
    };
  };

  const branchLength = (b: Branch) => {
    let len = 0;
    for (let i = 1; i < b.pts.length; i++) len += b.pts[i]!.distanceTo(b.pts[i - 1]!);
    return len;
  };

  const addClusters = (b: Branch) => {
    const len = branchLength(b);
    const step = spec.leaves.clusterSpacing * (detail === 2 ? 1.8 : detail === 1 ? 1.3 : 1);
    for (let s = len * spec.leaves.fromT; s <= len + 1e-3; s += step) {
      const { p } = pointAt(b, Math.min(1, s / len));
      clusters.push({ p, r: spec.leaves.clusterRadius * (0.8 + rng() * 0.4) });
    }
    clusters.push({ p: b.pts[b.pts.length - 1]!.clone(), r: spec.leaves.clusterRadius });
  };

  const recurse = (parent: Branch, levelIdx: number, parentLen: number) => {
    const ls: LevelSpec | undefined = spec.levels[levelIdx];
    if (!ls) {
      addClusters(parent);
      return;
    }
    let count = Math.round(range(rng, ...ls.count));
    if (detail === 2 && levelIdx >= 2) count = Math.max(1, Math.round(count * 0.5));
    let phyllo = rng() * Math.PI * 2;
    for (let c = 0; c < count; c++) {
      const t = range(rng, ...ls.startAt);
      const at = pointAt(parent, t);
      phyllo += 2.39996; // golden angle
      const perp = new THREE.Vector3().crossVectors(at.d, Math.abs(at.d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
      perp.applyAxisAngle(at.d, phyllo);
      const ang = range(rng, ...ls.angle);
      const dir = at.d.clone().multiplyScalar(Math.cos(ang)).addScaledVector(perp, Math.sin(ang)).normalize();
      const len = parentLen * range(rng, ...ls.lengthRatio) * (1 - (t - ls.startAt[0]) * 0.35);
      const child = grow(at.p, dir, len, at.r * ls.radiusRatio, levelIdx + 1, ls, 0.55);
      recurse(child, levelIdx + 1, len);
    }
    // Terminal-ish branches of the last level also hold leaves on the parent's outer part.
    if (levelIdx === spec.levels.length - 1) addClusters(parent);
  };

  if (spec.crown !== 'reed') recurse(trunk, 0, trunkLen);

  // Bounds for normalisation.
  let height = 0;
  let radius = 0;
  for (const b of branches) for (const p of b.pts) {
    height = Math.max(height, p.y);
    radius = Math.max(radius, Math.hypot(p.x, p.z));
  }
  for (const c of clusters) {
    height = Math.max(height, c.p.y + c.r);
    radius = Math.max(radius, Math.hypot(c.p.x, c.p.z) + c.r);
  }
  if (spec.crown === 'cypress') height = Math.max(height, trunkLen * 1.05);
  if (spec.crown === 'reed') height = spec.leaves.cardSize[1];

  const wood = buildWood(spec, branches, detail, height, seed);
  const leaves = spec.crown === 'cypress'
    ? buildCypressCrown(spec, trunkLen, rng, detail, height)
    : spec.crown === 'reed'
      ? buildReeds(spec, rng, detail)
      : buildLeafCards(spec, clusters, rng, detail, height);
  return { wood, leaves, height, radius: Math.max(radius, 0.5) };
}

function buildWood(spec: SpeciesSpec, branches: Branch[], detail: Detail, height: number, seed: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const sway: number[] = [];
  const bark: number[] = [];
  const idx: number[] = [];
  const minR = detail === 0 ? 0.012 : detail === 1 ? 0.03 : 0.06;

  for (const b of branches) {
    if (b.radii[0]! < minR && b.level > 0) continue;
    const radial = Math.max(3, (b.level === 0 ? 10 : b.level === 1 ? 7 : 5) - detail * 2);
    const base = pos.length / 3;
    let normal = new THREE.Vector3();
    let vAcc = 0;
    for (let i = 0; i < b.pts.length; i++) {
      const p = b.pts[i]!;
      const tangent = (i < b.pts.length - 1 ? b.pts[i + 1]!.clone().sub(p) : p.clone().sub(b.pts[i - 1]!)).normalize();
      if (i === 0) {
        normal = new THREE.Vector3().crossVectors(tangent, Math.abs(tangent.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
      } else {
        // Parallel transport keeps the ring from twisting.
        normal.sub(tangent.clone().multiplyScalar(normal.dot(tangent))).normalize();
      }
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      if (i > 0) vAcc += p.distanceTo(b.pts[i - 1]!);
      let r = b.radii[i]!;
      if (b.level === 0 && i === 0) r *= 1.7; // root flare
      for (let k = 0; k <= radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        let rr = r;
        if (b.level <= 1 && spec.trunk.flute > 0) {
          // Fluted, twisting olive trunks; lumpy bark elsewhere.
          const twist = spec.trunk.twist * (p.y / Math.max(1, height));
          const groove = Math.pow(Math.abs(Math.sin(a * 2.5 + twist * 3 + seed)), 5);
          rr *= 1 - spec.trunk.flute * groove * (b.level === 0 ? 1 : 0.5);
          rr *= 1 + 0.12 * noise2(a * 1.5 + seed, p.y * 1.3);
        }
        const dir = normal.clone().multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a));
        pos.push(p.x + dir.x * rr, p.y + dir.y * rr, p.z + dir.z * rr);
        nrm.push(dir.x, dir.y, dir.z);
        uv.push(k / radial, vAcc / 1.5);
        const flex = b.level === 0 ? 0.05 : b.level === 1 ? 0.35 : 0.8;
        sway.push(Math.max(0, p.y) / height, flex);
        bark.push(spec.bark);
      }
    }
    for (let i = 0; i < b.pts.length - 1; i++) {
      for (let k = 0; k < radial; k++) {
        const a = base + i * (radial + 1) + k;
        const c = a + radial + 1;
        idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 2));
  g.setAttribute('aBark', new THREE.Float32BufferAttribute(bark, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

interface CardBuffers {
  pos: number[];
  nrm: number[];
  uv: number[];
  sway: number[];
  leaf: number[];
  bill: number[];
  idx: number[];
}

const newCards = (): CardBuffers => ({ pos: [], nrm: [], uv: [], sway: [], leaf: [], bill: [], idx: [] });

function pushQuad(
  b: CardBuffers,
  centre: THREE.Vector3,
  ax: THREE.Vector3,
  ay: THREE.Vector3,
  n: THREE.Vector3,
  rect: [number, number, number, number],
  flipU: boolean,
  swayH: number,
  kind: number,
  phase: number,
): void {
  const base = b.pos.length / 3;
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sy] of corners) {
    b.pos.push(centre.x + ax.x * sx + ay.x * sy, centre.y + ax.y * sx + ay.y * sy, centre.z + ax.z * sx + ay.z * sy);
    b.nrm.push(n.x, n.y, n.z);
    const u = (sx + 1) / 2;
    const v = (sy + 1) / 2;
    b.uv.push(rect[0] + (rect[2] - rect[0]) * (flipU ? 1 - u : u), rect[1] + (rect[3] - rect[1]) * v);
    b.sway.push(swayH, 1);
    b.leaf.push(kind, phase);
    b.bill.push(0);
  }
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function finishCards(b: CardBuffers): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(b.sway, 2));
  g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(b.leaf, 2));
  g.setAttribute('aBill', new THREE.Float32BufferAttribute(b.bill, 1));
  g.setIndex(b.idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

function buildLeafCards(spec: SpeciesSpec, clusters: { p: THREE.Vector3; r: number }[], rng: Rng, detail: Detail, height: number): THREE.BufferGeometry {
  const b = newCards();
  const rect = atlasRect(spec.leafCell);
  // Crown centre for soft "spherical" normals: canopy shades like a volume, not a pile of cards.
  const centre = new THREE.Vector3();
  for (const c of clusters) centre.add(c.p);
  centre.divideScalar(Math.max(1, clusters.length));
  centre.y = Math.max(centre.y, height * 0.55);

  const perCluster = Math.max(2, Math.round(spec.leaves.cardsPerCluster * (detail === 0 ? 1 : detail === 1 ? 0.55 : 0.3)));
  const sizeBoost = detail === 0 ? 1 : detail === 1 ? 1.3 : 1.7; // fewer, bigger cards keep the silhouette
  for (const c of clusters) {
    for (let k = 0; k < perCluster; k++) {
      const offset = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(c.r * Math.cbrt(rng()));
      const q = c.p.clone().add(offset);
      const outward = q.clone().sub(centre).normalize();
      const random = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
      const n = random.lerp(outward, spec.leaves.outwardBias).normalize();
      const ax = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
      ax.applyAxisAngle(n, (rng() - 0.5) * 1.2);
      const ay = new THREE.Vector3().crossVectors(ax, n).normalize();
      const s = range(rng, ...spec.leaves.cardSize) * sizeBoost * 0.5;
      ax.multiplyScalar(s);
      ay.multiplyScalar(s);
      const shadeN = n.clone().lerp(outward, 0.7).normalize();
      pushQuad(b, q, ax, ay, shadeN, rect, rng() > 0.5, Math.max(0, q.y) / height, spec.leafKind, rng() * 6.283);
    }
  }
  return finishCards(b);
}

function buildCypressCrown(spec: SpeciesSpec, trunkLen: number, rng: Rng, detail: Detail, height: number): THREE.BufferGeometry {
  // A flame-shaped spindle built as a lathe with noisy, tufted radius.
  const b = newCards();
  const rect = atlasRect(spec.leafCell);
  const rings = detail === 0 ? 22 : detail === 1 ? 14 : 8;
  const radial = detail === 0 ? 14 : detail === 1 ? 9 : 6;
  const maxR = 0.9 + rng() * 0.5;
  const bottom = 0.6 + rng() * 0.6;
  const top = trunkLen * 1.05;
  const seed = rng() * 100;
  const verts: THREE.Vector3[][] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const y = bottom + (top - bottom) * t;
    // Widest a third of the way up, tapering to a soft point.
    const profile = Math.sin(Math.pow(t, 0.75) * Math.PI) * (1 - t * 0.35);
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const tuft = 1 + 0.18 * noise2(Math.cos(a) * 2 + seed, y * 0.7) + 0.08 * noise2(a * 4, y * 2 + seed);
      const r = Math.max(0.05, maxR * profile * tuft);
      ring.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    verts.push(ring);
  }
  for (let i = 0; i <= rings; i++) {
    for (let k = 0; k <= radial; k++) {
      const p = verts[i]![k]!;
      const n = new THREE.Vector3(p.x, 0.35, p.z).normalize();
      b.pos.push(p.x, p.y, p.z);
      b.nrm.push(n.x, n.y, n.z);
      b.uv.push(rect[0] + (rect[2] - rect[0]) * (k / radial), rect[1] + (rect[3] - rect[1]) * ((p.y / height) * 4 % 1));
      b.sway.push(p.y / height, 0.6);
      b.leaf.push(spec.leafKind, rng() * 6.283);
      b.bill.push(0);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * (radial + 1) + k;
      const c = a + radial + 1;
      b.idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  return finishCards(b);
}

function buildReeds(spec: SpeciesSpec, rng: Rng, detail: Detail): THREE.BufferGeometry {
  // A clump of crossed vertical cards.
  const b = newCards();
  const rect = atlasRect(spec.leafCell);
  const cards = detail === 0 ? 5 : detail === 1 ? 3 : 2;
  const h = range(rng, ...spec.leaves.cardSize);
  for (let k = 0; k < cards; k++) {
    const a = (k / cards) * Math.PI + rng() * 0.4;
    const ax = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(h * 0.45);
    const ay = new THREE.Vector3(0, h * 0.5, 0);
    const centre = new THREE.Vector3((rng() - 0.5) * 0.6, h * 0.5, (rng() - 0.5) * 0.6);
    const n = new THREE.Vector3(-Math.sin(a), 0.3, Math.cos(a)).normalize();
    // Sway grows with height: set per-vertex below by re-writing the bottom pair.
    pushQuad(b, centre, ax, ay, n, rect, rng() > 0.5, 1, spec.leafKind, rng() * 6.283);
    const s = b.sway.length;
    b.sway[s - 8] = 0; // bottom-left
    b.sway[s - 6] = 0; // bottom-right
  }
  return finishCards(b);
}

/** Camera-facing impostor quad: x is the sideways offset; the vertex shader turns it to the camera. */
export function buildImpostorQuad(height: number, radius: number, rect: [number, number, number, number]): THREE.BufferGeometry {
  const b = newCards();
  const w = radius * 1.05;
  const pos = [[-w, 0], [w, 0], [w, height * 1.02], [-w, height * 1.02]] as const;
  const uvs = [[rect[0], rect[1]], [rect[2], rect[1]], [rect[2], rect[3]], [rect[0], rect[3]]] as const;
  for (let i = 0; i < 4; i++) {
    b.pos.push(pos[i]![0], pos[i]![1], 0);
    b.nrm.push(0, 0.6, 0.8);
    b.uv.push(uvs[i]![0], uvs[i]![1]);
    b.sway.push(pos[i]![1] / height, 0.15);
    b.leaf.push(-1, 0);
    b.bill.push(1);
  }
  b.idx.push(0, 1, 2, 0, 2, 3);
  return finishCards(b);
}
