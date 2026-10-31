import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MaterialLib, TexId } from '../render/materialLib';

/**
 * Architecture kit: accumulates simple solids per material and merges them, so a whole district
 * renders in one draw call per material. Geometry gets UVs in metres (planar projection on the face's
 * dominant axis, or explicit UVs for roofs), so stone courses stay the same size on every building.
 * A per-part vertex colour gives each block, house or stele a slightly different tone.
 */
export type MatKey =
  | 'ashlar' // dressed limestone blocks
  | 'ashlarBig'
  | 'drystone' // rough field stone
  | 'mudbrick' // clay-plastered mudbrick
  | 'whitewash'
  | 'roof'
  | 'marble'
  | 'paving'
  | 'wood'
  | 'dark' // shadowed openings, doorways, windows
  | 'terracotta'
  | 'bronze'
  | 'paint'; // painted architectural details (triglyphs blue, taenia red)

export interface MatSpec {
  tex?: TexId;
  metres: number;
  tint?: number;
  normalScale?: number;
  roughness?: number;
  /** Plain colour material (no texture). */
  color?: number;
}

export const MATERIALS: Record<MatKey, MatSpec> = {
  ashlar: { tex: 'white_sandstone_blocks_02', metres: 3.2, tint: 0xf2e6d0 },
  ashlarBig: { tex: 'white_sandstone_blocks_02', metres: 5.5, tint: 0xe8dcc4, normalScale: 1.4 },
  drystone: { tex: 'stacked_stone_wall', metres: 2.4, tint: 0xd8c8b0 },
  mudbrick: { tex: 'white_plaster_rough_01', metres: 3.2, tint: 0xe8dcc6, normalScale: 1.6 },
  whitewash: { tex: 'white_plaster_rough_01', metres: 2.5, tint: 0xf4efe4 },
  roof: { tex: 'clay_roof_tiles', metres: 2.2, tint: 0xd47a4f, roughness: 0.95 },
  marble: { tex: 'white_plaster_rough_01', metres: 1.4, tint: 0xf6f3ee, roughness: 0.55, normalScale: 0.35 },
  paving: { tex: 'marble_01', metres: 3.0, tint: 0xe6dccb },
  wood: { tex: 'wood_plank_wall', metres: 1.6, tint: 0xb08a68 },
  dark: { color: 0x15100c, metres: 1, roughness: 1 },
  terracotta: { tex: 'clay_plaster', metres: 1.4, tint: 0xd9845a, roughness: 0.85, normalScale: 0.6 },
  bronze: { color: 0x8a6a3a, metres: 1, roughness: 0.35 },
  paint: { color: 0xffffff, metres: 1, roughness: 0.7 },
};

const tmpN = new THREE.Vector3();
const tmpP = new THREE.Vector3();

/** Planar UVs in metres from the face's dominant axis. Assumes non-indexed or flat-shaded geometry. */
export function worldUvs(geo: THREE.BufferGeometry, offset = new THREE.Vector2()): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    tmpP.fromBufferAttribute(pos, i);
    tmpN.fromBufferAttribute(nrm, i);
    const ax = Math.abs(tmpN.x);
    const ay = Math.abs(tmpN.y);
    const az = Math.abs(tmpN.z);
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = tmpP.x;
      v = tmpP.z;
    } else if (ax >= az) {
      u = tmpP.z * Math.sign(tmpN.x);
      v = tmpP.y;
    } else {
      u = -tmpP.x * Math.sign(tmpN.z);
      v = tmpP.y;
    }
    uv[i * 2] = u + offset.x;
    uv[i * 2 + 1] = v + offset.y;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function withColor(geo: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const n = geo.attributes.position!.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function strip(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

export class Builder {
  private readonly parts = new Map<MatKey, THREE.BufferGeometry[]>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  /** Default tint for subsequent parts (1 = untinted). */
  tint = new THREE.Color(1, 1, 1);
  uvOffset = new THREE.Vector2();

  /** Add a geometry already in local space, transformed by `matrix`, with metre UVs unless keepUv. */
  add(mat: MatKey, geo: THREE.BufferGeometry, matrix: THREE.Matrix4, opts: { keepUv?: boolean; tint?: THREE.Color } = {}): void {
    let g = strip(geo.clone());
    g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!opts.keepUv || !g.attributes.uv) worldUvs(g, this.uvOffset);
    g = withColor(g, opts.tint ?? this.tint);
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
  }

  /** Axis-aligned (then rotated about Y) box by centre and size. */
  box(mat: MatKey, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rotY = 0, tint?: THREE.Color): void {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    this.q.setFromEuler(this.e.set(0, rotY, 0));
    this.m.compose(new THREE.Vector3(cx, cy, cz), this.q, new THREE.Vector3(1, 1, 1));
    this.add(mat, g, this.m, tint ? { tint } : {});
    g.dispose();
  }

  /** Box placed in a local frame (origin + rotation), with local centre and size. */
  boxIn(frame: Frame, mat: MatKey, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, tint?: THREE.Color): void {
    const [x, z] = frame.toWorld(lx, lz);
    this.box(mat, x, frame.y + ly, z, sx, sy, sz, frame.rot, tint);
  }

  cylinder(mat: MatKey, x: number, y: number, z: number, rTop: number, rBot: number, h: number, seg = 12, tint?: THREE.Color): void {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    this.m.makeTranslation(x, y + h / 2, z);
    this.add(mat, g, this.m, tint ? { tint } : {});
    g.dispose();
  }

  /** Arbitrary geometry with full transform. */
  geometry(mat: MatKey, geo: THREE.BufferGeometry, pos: THREE.Vector3, rot: THREE.Euler, scale = new THREE.Vector3(1, 1, 1), opts: { keepUv?: boolean; tint?: THREE.Color } = {}): void {
    this.m.compose(pos, this.q.setFromEuler(rot), scale);
    this.add(mat, geo, this.m, opts);
  }

  /**
   * Gabled tiled roof over a rectangle in a frame: ridge along local X, eaves overhang `over`,
   * pitch ~ 15° like Greek roofs. Explicit UVs so tile rows run along the eaves.
   */
  gableRoof(frame: Frame, lx: number, lz: number, w: number, d: number, eaveY: number, pitch = 0.27, over = 0.45): void {
    const hw = w / 2 + over;
    const hd = d / 2 + over;
    const rise = hd * Math.tan(pitch);
    const slope = Math.hypot(hd, rise);
    const tiles = (sideSign: number) => {
      const g = new THREE.BufferGeometry();
      // Quad from eave (z = sideSign*hd, y = 0) to ridge (z = 0, y = rise).
      const p = [-hw, 0, sideSign * hd, hw, 0, sideSign * hd, hw, rise, 0, -hw, rise, 0];
      const uv = [0, 0, w + over * 2, 0, w + over * 2, slope, 0, slope];
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(sideSign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
      g.computeVertexNormals();
      return g;
    };
    const [x, z] = frame.toWorld(lx, lz);
    this.m.compose(new THREE.Vector3(x, frame.y + eaveY, z), this.q.setFromEuler(this.e.set(0, frame.rot, 0)), new THREE.Vector3(1, 1, 1));
    for (const s of [1, -1]) {
      const g = tiles(s);
      this.add('roof', g, this.m, { keepUv: true });
      // Underside so the roof isn't see-through from below.
      const under = g.clone();
      under.translate(0, -0.12, 0);
      under.index!.array.reverse();
      this.add('wood', under, this.m);
      g.dispose();
      under.dispose();
    }
    // Pediment / gable ends (plastered triangles) and a ridge beam.
    for (const sx of [-1, 1]) {
      const tri = new THREE.BufferGeometry();
      const xx = sx * (w / 2);
      tri.setAttribute('position', new THREE.Float32BufferAttribute([xx, 0, -d / 2, xx, 0, d / 2, xx, rise * (d / 2 / hd), 0], 3));
      tri.setIndex(sx > 0 ? [0, 2, 1] : [0, 1, 2]);
      tri.computeVertexNormals();
      this.add('mudbrick', tri, this.m);
      tri.dispose();
    }
    const ridge = new THREE.BoxGeometry(w + over * 2, 0.16, 0.24);
    ridge.translate(0, rise + 0.02, 0);
    this.add('terracotta', ridge, this.m);
    ridge.dispose();
  }

  /** Flat roof with a slight parapet (poorer houses, tower tops). */
  flatRoof(frame: Frame, lx: number, lz: number, w: number, d: number, y: number): void {
    this.boxIn(frame, 'mudbrick', lx, y + 0.12, lz, w + 0.2, 0.24, d + 0.2);
  }

  /** Merge everything into one mesh per material. */
  async build(lib: MaterialLib, name: string, opts: { castShadow?: boolean } = {}): Promise<THREE.Group> {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, geos] of this.parts) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const material = await resolveMaterial(lib, mat);
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `${name}-${mat}`;
      mesh.castShadow = opts.castShadow ?? true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

const plainCache = new Map<MatKey, THREE.MeshStandardMaterial>();

export async function resolveMaterial(lib: MaterialLib, key: MatKey): Promise<THREE.MeshStandardMaterial> {
  const spec = MATERIALS[key];
  let m: THREE.MeshStandardMaterial;
  if (spec.tex) {
    m = await lib.material(spec.tex, { metres: spec.metres, ...(spec.tint !== undefined ? { tint: spec.tint } : {}), ...(spec.normalScale !== undefined ? { normalScale: spec.normalScale } : {}), ...(spec.roughness !== undefined ? { roughness: spec.roughness } : {}) });
  } else {
    m = plainCache.get(key) ?? new THREE.MeshStandardMaterial({ color: spec.color ?? 0xffffff, roughness: spec.roughness ?? 0.9, metalness: key === 'bronze' ? 0.8 : 0 });
    plainCache.set(key, m);
  }
  m.vertexColors = true;
  return m;
}

/** A local 2D frame on the ground: origin, rotation about Y, base height. Local +Z = "forward". */
export class Frame {
  constructor(
    readonly x: number,
    readonly z: number,
    readonly rot: number,
    readonly y: number,
  ) {}

  toWorld(lx: number, lz: number): [number, number] {
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    // Rotation about +Y: local (x, z) → world (x c + z s, -x s + z c).
    return [this.x + lx * c + lz * s, this.z - lx * s + lz * c];
  }

  sub(lx: number, lz: number, rot = 0, y = this.y): Frame {
    const [x, z] = this.toWorld(lx, lz);
    return new Frame(x, z, this.rot + rot, y);
  }
}
