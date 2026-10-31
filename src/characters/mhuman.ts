import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Appearance } from './appearance';
import { BONES, buildProp, type BoneName, type Dims, type Humanoid } from './humanoid';

/**
 * Realistic characters from CC0 MakeHuman data (baked by scripts/build_humans.py into public/assets/humans/).
 *
 * Per character: blend the macro targets for sex, age and build; fit the hair, beard, eyebrows and eyes to the
 * shaped body; cut Greek clothes from MakeHuman's bodysuit and skirt helpers (which deform with the body);
 * pose the arms down and the legs straight; bind it all to the game's 20-bone skeleton. The existing procedural
 * Animator then drives these bodies exactly as it drove the stylised ones.
 *
 * Units: the data is in MakeHuman decimetres; everything here ends in metres, feet at y = 0, facing +Z.
 */
const BASE = `${import.meta.env.BASE_URL}assets/humans/`;

type Target = { idx: Uint16Array; d: Int16Array; scale: number };
interface ProxyData {
  name: string;
  vRef: Uint16Array;
  uv: Float32Array;
  index: Uint16Array | Uint32Array;
  refs: Uint16Array;
  w: Float32Array;
  off: Float32Array;
  scales: Partial<Record<'x' | 'y' | 'z', [number, number, number]>>;
  texture: THREE.Texture | null;
  count: number;
}
interface HelperData {
  vRef: Uint16Array;
  uv: Float32Array;
  index: Uint16Array;
}
interface Kit {
  count: number;
  base: Float32Array;
  vRef: Uint16Array;
  uv: Float32Array;
  index: Uint16Array;
  skinIndex: Uint8Array;
  skinWeight: Uint8Array;
  joints: Record<string, number[]>;
  targets: Map<string, Target>;
  helpers: { tights: HelperData; skirt: HelperData };
  proxies: Map<string, ProxyData>;
  skins: Map<string, THREE.Texture>;
  eyes: Map<string, THREE.Texture>;
  linen: { diff: THREE.Texture; nor: THREE.Texture };
  /** Per base vertex: list of [bone, weight] (top 4). */
  weights: { b: Uint8Array; w: Float32Array };
  /** Body triangles' base-vertex corners, for normals. */
}

function decode<T>(b64: string, Ctor: new (buf: ArrayBuffer) => T): T {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Ctor(bytes.buffer);
}

let kit: Kit | null = null;
const k0 = () => kit!;
let loading: Promise<boolean> | null = null;

/** True once the realistic character data has loaded. */
export function realHumansReady(): boolean {
  return kit !== null;
}

/** Load the baked data and textures (once). Resolves false if the data is missing (falls back to stylised figures). */
export function loadHumanKit(): Promise<boolean> {
  loading ??= (async () => {
    try {
      const [bodyRes, manRes] = await Promise.all([fetch(`${BASE}body.json`), fetch(`${BASE}manifest.json`)]);
      if (!bodyRes.ok || !manRes.ok) return false;
      const body = (await bodyRes.json()) as Record<string, unknown> & {
        count: number;
        base: string;
        vRef: string;
        uv: string;
        index: string;
        skinIndex: string;
        skinWeight: string;
        joints: Record<string, number[]>;
        targets: Record<string, { idx: string; d: string; scale: number }>;
        helpers: Record<'tights' | 'skirt', { vRef: string; uv: string; index: string }>;
      };
      const man = (await manRes.json()) as { hair: string[]; beard: string[]; eyebrows: string[]; bodies?: string[]; skins: Record<string, string>; eyes: Record<string, string> };
      const tl = new THREE.TextureLoader();
      const tex = async (path: string, srgb = true) => {
        const t = await tl.loadAsync(`${BASE}${path}`);
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        return t;
      };
      const proxyNames = ['eyes', 'eyelashes', ...man.eyebrows, ...man.hair, ...man.beard, ...(man.bodies ?? [])];
      const proxies = new Map<string, ProxyData>();
      await Promise.all(
        proxyNames.map(async (n) => {
          const r = await fetch(`${BASE}${n}.json`);
          const p = (await r.json()) as { name: string; vRef: string; uv: string; index: string; refs: string; w: string; off: string; scales: ProxyData['scales']; texture: string | null; count: number };
          const count = p.count;
          const idx = decode(p.index, Uint16Array);
          proxies.set(n, {
            name: n,
            vRef: decode(p.vRef, Uint16Array),
            uv: decode(p.uv, Float32Array),
            index: count >= 65536 ? decode(p.index, Uint32Array) : idx,
            refs: decode(p.refs, Uint16Array),
            w: decode(p.w, Float32Array),
            off: decode(p.off, Float32Array),
            scales: p.scales,
            texture: p.texture ? await tex(p.texture) : null,
            count,
          });
        }),
      );
      const skins = new Map<string, THREE.Texture>();
      await Promise.all(Object.entries(man.skins).map(async ([k, v]) => skins.set(k, await tex(v))));
      const eyes = new Map<string, THREE.Texture>();
      await Promise.all(Object.entries(man.eyes).map(async ([k, v]) => eyes.set(k, await tex(v))));
      const lbase = `${import.meta.env.BASE_URL}assets/ph/textures/rough_linen/`;
      const linen = { diff: await tl.loadAsync(`${lbase}diff.webp`), nor: await tl.loadAsync(`${lbase}nor.webp`) };
      linen.diff.colorSpace = THREE.SRGBColorSpace;
      for (const t of [linen.diff, linen.nor]) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
      }
      const targets = new Map<string, Target>();
      for (const [k, v] of Object.entries(body.targets)) targets.set(k, { idx: decode(v.idx, Uint16Array), d: decode(v.d, Int16Array), scale: v.scale });
      const helper = (h: { vRef: string; uv: string; index: string }): HelperData => ({ vRef: decode(h.vRef, Uint16Array), uv: decode(h.uv, Float32Array), index: decode(h.index, Uint16Array) });
      const skinIndex = decode(body.skinIndex, Uint8Array);
      const skinWeight = decode(body.skinWeight, Uint8Array);
      const wf = new Float32Array(skinWeight.length);
      for (let i = 0; i < wf.length; i++) wf[i] = skinWeight[i]! / 255;
      kit = {
        count: body.count,
        base: decode(body.base, Float32Array),
        vRef: decode(body.vRef, Uint16Array),
        uv: decode(body.uv, Float32Array),
        index: decode(body.index, Uint16Array),
        skinIndex,
        skinWeight,
        joints: body.joints,
        targets,
        helpers: { tights: helper(body.helpers.tights), skirt: helper(body.helpers.skirt) },
        proxies,
        skins,
        eyes,
        linen,
        weights: { b: skinIndex, w: wf },
      };
      return true;
    } catch (e) {
      console.info('[humans] realistic characters unavailable, using stylised figures', e);
      return false;
    }
  })();
  return loading;
}

const PARENT: Record<BoneName, BoneName | null> = {
  root: null, hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  shoulderL: 'chest', upperArmL: 'shoulderL', foreArmL: 'upperArmL', handL: 'foreArmL',
  shoulderR: 'chest', upperArmR: 'shoulderR', foreArmR: 'upperArmR', handR: 'foreArmR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL',
  thighR: 'hips', shinR: 'thighR', footR: 'shinR',
};
const BI = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;
const ARM_OUT = 0.08;

const HAIR_FOR: Record<Appearance['hair']['style'], string | null> = {
  cropped: 'short04', short: 'short02', curly: 'short03', long: 'long01', bun: 'bob02', bald: null, wild: 'short01',
};
const BEARD_FOR: Record<Appearance['beard']['style'], string | null> = {
  none: null, stubble: 'beard_scruffy', trimmed: 'beard_sigmund', full: 'beard_viking', long: 'beard_viking', ragged: 'beard_scruffy',
};

function lum(c: THREE.Color): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

const LITE_HAIR: Record<string, string> = { short01: 'short04', short02: 'short04', short03: 'short03', long01: 'bob02', bob02: 'bob02' };

/**
 * Build a realistic humanoid. Requires loadHumanKit() to have resolved true.
 * `lite` (crowds, distant figures): the low-poly MakeHuman body, light hair, no eyes or lashes.
 */
export function buildRealHumanoid(a: Appearance, opts: { lite?: boolean } = {}): Humanoid {
  const lite = !!opts.lite && k0().proxies.has('body_male_lo');
  const k = kit!;
  // ---------------------------------------------------------------- 1. shape (decimetres)
  const P = Float32Array.from(k.base);
  const male = a.sex === 'm' ? 1 : 0;
  const old = a.age === 'youth' ? 0 : a.age === 'adult' ? 0.28 : 0.66;
  const wgt = THREE.MathUtils.clamp(0.5 + (a.build - 0.5) * 0.9, 0, 1);
  const mus = THREE.MathUtils.clamp(male ? 0.45 + a.build * 0.45 : 0.4 + a.build * 0.2, 0, 1);
  const sexW: Record<string, number> = { male, female: 1 - male };
  const ageW: Record<string, number> = { young: 1 - old, old };
  const mm = Math.max(0, (mus - 0.5) * 2);
  const muscleW: Record<string, number> = { averagemuscle: 1 - mm, maxmuscle: mm };
  const weightW: Record<string, number> = { minweight: Math.max(0, 1 - 2 * wgt), averageweight: 1 - Math.abs(2 * wgt - 1), maxweight: Math.max(0, 2 * wgt - 1) };
  const skinC = new THREE.Color(a.skin);
  const african = THREE.MathUtils.clamp((0.32 - lum(skinC)) / 0.2, 0, 1);
  const add = (name: string, w: number) => {
    if (w < 1e-3) return;
    const t = k.targets.get(name);
    if (!t) return;
    const s = t.scale * w;
    for (let i = 0; i < t.idx.length; i++) {
      const v = t.idx[i]! * 3;
      P[v] = P[v]! + t.d[i * 3]! * s;
      P[v + 1] = P[v + 1]! + t.d[i * 3 + 1]! * s;
      P[v + 2] = P[v + 2]! + t.d[i * 3 + 2]! * s;
    }
  };
  for (const sx of ['male', 'female']) {
    for (const ag of ['young', 'old']) {
      const sa = sexW[sx]! * ageW[ag]!;
      if (sa < 1e-3) continue;
      for (const mu of ['averagemuscle', 'maxmuscle']) for (const we of ['minweight', 'averageweight', 'maxweight']) add(`universal-${sx}-${ag}-${mu}-${we}`, sa * muscleW[mu]! * weightW[we]!);
      add(`caucasian-${sx}-${ag}`, sa * (1 - african));
      add(`african-${sx}-${ag}`, sa * african);
    }
  }

  // ---------------------------------------------------------------- 2. fit proxies (still decimetres)
  const fit = (p: ProxyData): Float32Array => {
    const out = new Float32Array(p.count * 3);
    const sc = [1, 1, 1];
    (['x', 'y', 'z'] as const).forEach((ax, i) => {
      const s = p.scales[ax];
      if (s) sc[i] = Math.abs(P[s[0] * 3 + i]! - P[s[1] * 3 + i]!) / s[2];
    });
    for (let i = 0; i < p.count; i++) {
      for (let c = 0; c < 3; c++) {
        let v = 0;
        for (let r = 0; r < 3; r++) v += P[p.refs[i * 3 + r]! * 3 + c]! * p.w[i * 3 + r]!;
        out[i * 3 + c] = v + p.off[i * 3 + c]! * sc[c]!;
      }
    }
    return out;
  };
  const proxyWeights = (p: ProxyData): Float32Array => {
    // 20 weights per proxy vertex, blended from its reference vertices.
    const W = new Float32Array(p.count * BONES.length);
    for (let i = 0; i < p.count; i++) {
      for (let r = 0; r < 3; r++) {
        const ref = p.refs[i * 3 + r]!;
        const pw = p.w[i * 3 + r]!;
        for (let j = 0; j < 4; j++) {
          const at = i * BONES.length + k.weights.b[ref * 4 + j]!;
          W[at] = W[at]! + pw * k.weights.w[ref * 4 + j]!;
        }
      }
    }
    return W;
  };
  const parts: { name: string; p: ProxyData; pos: Float32Array }[] = [];
  const want = (name: string | null) => {
    if (!name) return;
    const p = k.proxies.get(name);
    if (p) parts.push({ name, p, pos: fit(p) });
  };
  const hairName = a.sex === 'f' && a.hair.style === 'short' ? 'bob02' : HAIR_FOR[a.hair.style];
  if (lite) {
    want(a.sex === 'm' ? 'body_male_lo' : 'body_female_lo');
    want(hairName ? (LITE_HAIR[hairName] ?? hairName) : null);
    if (a.sex === 'm' && a.beard.style !== 'none' && a.beard.style !== 'stubble') want('beard_sigmund');
  } else {
    want('eyes');
    want('eyelashes');
    want(a.sex === 'f' ? 'eyebrow006' : a.age === 'old' ? 'eyebrow010' : 'eyebrow001');
    want(hairName);
    if (a.sex === 'm') want(BEARD_FOR[a.beard.style]);
  }

  // ---------------------------------------------------------------- 3. metres, feet on the ground, exact height
  const bodyMin = new THREE.Vector3(Infinity, Infinity, Infinity);
  const bodyMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < k.vRef.length; i++) {
    const v = k.vRef[i]! * 3;
    bodyMin.min(new THREE.Vector3(P[v], P[v + 1], P[v + 2]));
    bodyMax.max(new THREE.Vector3(P[v], P[v + 1], P[v + 2]));
  }
  const scale = a.height / (bodyMax.y - bodyMin.y);
  const toM = (arr: Float32Array) => {
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = arr[i]! * scale;
      arr[i + 1] = (arr[i + 1]! - bodyMin.y) * scale;
      arr[i + 2] = arr[i + 2]! * scale;
    }
  };
  toM(P);
  for (const pt of parts) toM(pt.pos);
  const joint = (name: string) => {
    const ids = k.joints[name]!;
    const v = new THREE.Vector3();
    for (const id of ids) v.add(new THREE.Vector3(P[id * 3], P[id * 3 + 1], P[id * 3 + 2]));
    return v.multiplyScalar(1 / ids.length);
  };
  const pivot: Record<BoneName, THREE.Vector3> = {} as Record<BoneName, THREE.Vector3>;
  for (const b of BONES) pivot[b] = b === 'root' ? new THREE.Vector3() : joint(b);
  const handEnd = { L: joint('handEndL'), R: joint('handEndR') };

  // ---------------------------------------------------------------- 4. repose: arms down, legs straight
  const M: Record<BoneName, THREE.Matrix4> = {} as Record<BoneName, THREE.Matrix4>;
  const R: Record<BoneName, THREE.Quaternion> = {} as Record<BoneName, THREE.Quaternion>;
  const tmp = new THREE.Vector3();
  for (const b of BONES) {
    const parent = PARENT[b];
    const Mp = parent ? M[parent] : new THREE.Matrix4();
    const Rp = parent ? R[parent] : new THREE.Quaternion();
    let q = new THREE.Quaternion();
    const p0 = pivot[b].clone().applyMatrix4(Mp);
    const aim = (from: THREE.Vector3, to: THREE.Vector3) => {
      const cur = from.clone().applyMatrix4(Mp).sub(p0).normalize();
      q = new THREE.Quaternion().setFromUnitVectors(cur, to);
    };
    const side = b.endsWith('L') ? 1 : -1;
    const armDir = new THREE.Vector3(side * Math.sin(ARM_OUT), -Math.cos(ARM_OUT), 0);
    if (b === 'upperArmL' || b === 'upperArmR') aim(pivot[b === 'upperArmL' ? 'foreArmL' : 'foreArmR'], armDir);
    else if (b === 'foreArmL' || b === 'foreArmR') aim(pivot[b === 'foreArmL' ? 'handL' : 'handR'], armDir);
    else if (b === 'handL' || b === 'handR') aim(handEnd[b === 'handL' ? 'L' : 'R'], armDir.clone().add(new THREE.Vector3(0, 0, 0.12)).normalize());
    else if (b === 'thighL' || b === 'thighR') aim(pivot[b === 'thighL' ? 'footL' : 'footR'], new THREE.Vector3(side * 0.03, -1, 0).normalize());
    const D = new THREE.Matrix4().makeTranslation(p0.x, p0.y, p0.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-p0.x, -p0.y, -p0.z));
    M[b] = D.multiply(Mp);
    R[b] = q.clone().multiply(Rp);
  }
  const Marr = BONES.map((b) => M[b]);
  const pose = (pos: Float32Array, W: (i: number, add: (bone: number, w: number) => void) => void) => {
    const out = new THREE.Vector3();
    const acc = new THREE.Vector3();
    for (let i = 0; i < pos.length / 3; i++) {
      tmp.set(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!);
      acc.set(0, 0, 0);
      let total = 0;
      W(i, (bone, w) => {
        out.copy(tmp).applyMatrix4(Marr[bone]!).multiplyScalar(w);
        acc.add(out);
        total += w;
      });
      if (total > 0) acc.multiplyScalar(1 / total);
      else acc.copy(tmp);
      pos[i * 3] = acc.x;
      pos[i * 3 + 1] = acc.y;
      pos[i * 3 + 2] = acc.z;
    }
  };
  pose(P, (i, addW) => {
    for (let j = 0; j < 4; j++) {
      const w = k.weights.w[i * 4 + j]!;
      if (w > 0) addW(k.weights.b[i * 4 + j]!, w);
    }
  });
  const partW = parts.map((pt) => proxyWeights(pt.p));
  parts.forEach((pt, pi) => {
    const W = partW[pi]!;
    pose(pt.pos, (i, addW) => {
      for (let b = 0; b < BONES.length; b++) {
        const w = W[i * BONES.length + b]!;
        if (w > 1e-4) addW(b, w);
      }
    });
  });
  const posed: Record<BoneName, THREE.Vector3> = {} as Record<BoneName, THREE.Vector3>;
  for (const b of BONES) posed[b] = pivot[b].clone().applyMatrix4(PARENT[b] ? M[PARENT[b]!] : new THREE.Matrix4());

  // ---------------------------------------------------------------- 5. skeleton (bind pose)
  const bones = {} as Record<BoneName, THREE.Bone>;
  for (const b of BONES) {
    bones[b] = new THREE.Bone();
    bones[b].name = b;
  }
  bones.upperArmL.rotation.z = ARM_OUT;
  bones.upperArmR.rotation.z = -ARM_OUT;
  const worldRot: Record<BoneName, THREE.Quaternion> = {} as Record<BoneName, THREE.Quaternion>;
  for (const b of BONES) {
    const parent = PARENT[b];
    const own = new THREE.Quaternion().setFromEuler(bones[b].rotation);
    worldRot[b] = parent ? worldRot[parent].clone().multiply(own) : own;
    if (!parent) continue;
    const off = posed[b].clone().sub(posed[parent]).applyQuaternion(worldRot[parent].clone().invert());
    bones[b].position.copy(off);
    bones[parent].add(bones[b]);
  }
  bones.root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(BONES.map((b) => bones[b]));

  // ---------------------------------------------------------------- 6. meshes
  const object = new THREE.Group();
  object.name = 'humanoid';
  object.add(bones.root);
  const meshes: THREE.SkinnedMesh[] = [];
  const geoms: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const bindMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, shadows = true, shared = false) => {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.bind(skeleton);
    m.castShadow = shadows;
    m.receiveShadow = true;
    // Off-screen culling with a fixed sphere around the figure (animation never leaves it).
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, a.height * 0.5, 0), a.height * 0.75);
    object.add(m);
    meshes.push(m);
    geoms.push(geo);
    if (!shared) mats.push(mat);
    return m;
  };
  /** Geometry for render vertices that reference base vertices (body, helpers): positions, uvs, skin weights. */
  const baseGeo = (vRef: Uint16Array, uv: Float32Array, index: ArrayLike<number>, offset?: (i: number, p: THREE.Vector3, nrm: THREE.Vector3) => void) => {
    const nv = vRef.length;
    const pos = new Float32Array(nv * 3);
    const si = new Uint16Array(nv * 4);
    const sw = new Float32Array(nv * 4);
    for (let i = 0; i < nv; i++) {
      const v = vRef[i]!;
      pos.set([P[v * 3]!, P[v * 3 + 1]!, P[v * 3 + 2]!], i * 3);
      for (let j = 0; j < 4; j++) {
        si[i * 4 + j] = k.weights.b[v * 4 + j]!;
        sw[i * 4 + j] = k.weights.w[v * 4 + j]!;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(uv), 2));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    geo.setIndex(Array.from(index));
    smoothNormals(geo, vRef);
    if (offset) {
      const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
      const pv = new THREE.Vector3();
      const nn = new THREE.Vector3();
      for (let i = 0; i < nv; i++) {
        pv.fromBufferAttribute(geo.getAttribute('position'), i);
        nn.fromBufferAttribute(nrm, i);
        offset(i, pv, nn);
        pos.set([pv.x, pv.y, pv.z], i * 3);
      }
      smoothNormals(geo, vRef);
    }
    return geo;
  };

  // Body: hide what clothes fully cover (saves triangles and stops skin poking through).
  const dims: Dims = {
    height: a.height,
    hipY: posed.hips.y,
    thigh: posed.thighL.distanceTo(posed.shinL),
    shin: posed.shinL.distanceTo(posed.footL),
    upperArm: posed.upperArmL.distanceTo(posed.foreArmL),
    foreArm: posed.foreArmL.distanceTo(posed.handL),
    shoulderX: Math.abs(posed.upperArmL.x),
    chestW: Math.abs(posed.upperArmL.x) * 0.85,
  };
  const lengthHem = a.chiton.length === 'short' ? posed.shinL.y + dims.thigh * 0.45 : a.chiton.length === 'knee' ? posed.shinL.y - 0.03 : posed.footL.y + 0.07;
  const hemY = a.loincloth ? posed.thighL.y - 0.12 : lengthHem;
  const dominant = (v: number) => k.weights.b[v * 4]!;
  const TORSO = new Set([BI.hips, BI.spine, BI.chest]);
  const covered = (v: number) => {
    const y = P[v * 3 + 1]!;
    const b = dominant(v);
    if (a.loincloth) return b === BI.hips && y < posed.hips.y + 0.04 && y > hemY + 0.02;
    if (TORSO.has(b)) return y < posed.neck.y - 0.08 && y > hemY + 0.03;
    if (b === BI.thighL || b === BI.thighR) return y > hemY + 0.05;
    if (b === BI.shinL || b === BI.shinR) return y > hemY + 0.05;
    return false;
  };
  const bodyIdx: number[] = [];
  for (let t = 0; t < k.index.length; t += 3) {
    const a0 = k.vRef[k.index[t]!]!;
    const a1 = k.vRef[k.index[t + 1]!]!;
    const a2 = k.vRef[k.index[t + 2]!]!;
    if (covered(a0) && covered(a1) && covered(a2)) continue;
    bodyIdx.push(k.index[t]!, k.index[t + 1]!, k.index[t + 2]!);
  }
  const ageKey = a.age === 'youth' ? 'young' : a.age === 'adult' ? 'middleage' : 'old';
  const sexKey = a.sex === 'm' ? 'male' : 'female';
  const race = african > 0.5 ? 'african' : 'caucasian';
  const skinTex = k.skins.get(`${ageKey}_${race}_${sexKey}`) ?? k.skins.get(`young_${race}_${sexKey}`) ?? k.skins.get(`young_caucasian_${sexKey}`)!;
  // Tint the photographic skin toward the character's tone (the textures are light).
  const texMean = race === 'african' ? new THREE.Color(0.36, 0.24, 0.18) : new THREE.Color(0.8, 0.62, 0.52);
  const tint = new THREE.Color(Math.min(1.25, skinC.r / texMean.r), Math.min(1.25, skinC.g / texMean.g), Math.min(1.25, skinC.b / texMean.b));
  const skinMat = new THREE.MeshStandardMaterial({ map: skinTex, color: tint, roughness: 0.55, metalness: 0 });
  skinMat.onBeforeCompile = (sh) => {
    // Cheap subsurface look: soften the terminator and add a little warm wrap light.
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
       reflectedLight.directDiffuse += reflectedLight.indirectDiffuse * vec3(0.10, 0.03, 0.02);`,
    );
  };
  let body: THREE.SkinnedMesh | null = lite ? null : bindMesh(baseGeo(k.vRef, k.uv, bodyIdx), skinMat);

  // Proxies: eyes, lashes, brows, hair, beard.
  const hairC = new THREE.Color(a.hair.color);
  const beardC = new THREE.Color(a.beard.color);
  parts.forEach((pt, pi) => {
    const p = pt.p;
    const nv = p.vRef.length;
    const pos = new Float32Array(nv * 3);
    const si = new Uint16Array(nv * 4);
    const sw = new Float32Array(nv * 4);
    const W = partW[pi]!;
    for (let i = 0; i < nv; i++) {
      const v = p.vRef[i]!;
      pos.set([pt.pos[v * 3]!, pt.pos[v * 3 + 1]!, pt.pos[v * 3 + 2]!], i * 3);
      // Top 4 of the 20 blended weights.
      const ws = Array.from({ length: BONES.length }, (_, b) => [b, W[v * BONES.length + b]!] as [number, number]).sort((x, y) => y[1] - x[1]).slice(0, 4);
      const sum = ws.reduce((s, x) => s + x[1], 0) || 1;
      ws.forEach(([b, w], j) => {
        si[i * 4 + j] = b;
        sw[i * 4 + j] = w / sum;
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(p.uv), 2));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    if (pt.name.startsWith('body_')) {
      // Low-poly body: drop triangles the clothes cover (dominant bone and height of each vertex).
      const tri: number[] = [];
      const domOf = (i: number) => si[i * 4]!;
      const cov = (i: number) => {
        const yy = pos[i * 3 + 1]!;
        const b = domOf(i);
        if (TORSO.has(b)) return yy < posed.neck.y - 0.08 && yy > hemY + 0.03;
        if (b === BI.thighL || b === BI.thighR || b === BI.shinL || b === BI.shinR) return yy > hemY + 0.05;
        return false;
      };
      for (let t = 0; t < p.index.length; t += 3) {
        const i0 = p.index[t]!;
        const i1 = p.index[t + 1]!;
        const i2 = p.index[t + 2]!;
        if (!a.loincloth && cov(i0) && cov(i1) && cov(i2)) continue;
        tri.push(i0, i1, i2);
      }
      geo.setIndex(tri);
      geo.computeVertexNormals();
      body = bindMesh(geo, skinMat);
      return;
    }
    geo.setIndex(Array.from(p.index));
    geo.computeVertexNormals();
    const isHair = pt.name.startsWith('short') || pt.name.startsWith('long') || pt.name.startsWith('bob') || pt.name.startsWith('braid') || pt.name.startsWith('ponytail');
    const isBeard = pt.name.startsWith('beard');
    const isBrow = pt.name.startsWith('eyebrow') || pt.name === 'eyelashes';
    let mat: THREE.Material;
    if (pt.name === 'eyes') {
      const eyeTex = k.eyes.get(a.age === 'old' ? 'grey' : skinC.r > 0.75 ? 'bluegreen' : 'brown') ?? p.texture;
      mat = new THREE.MeshStandardMaterial({ map: eyeTex, roughness: 0.15 });
    } else {
      const color = isBeard ? beardC : isBrow ? (a.sex === 'm' && a.beard.style !== 'none' ? beardC : hairC) : hairC;
      mat = new THREE.MeshStandardMaterial({
        map: p.texture,
        color: color.clone().multiplyScalar(isHair || isBeard ? 2.4 : 1.6),
        roughness: 0.85,
        envMapIntensity: 0.35,
        alphaTest: 0.45,
        alphaToCoverage: true,
        side: THREE.DoubleSide,
      });
    }
    bindMesh(geo, mat, isHair || isBeard);
  });

  // ---------------------------------------------------------------- 7. clothes from the helpers
  const clothes = buildClothes(k, a, P, posed, dims, hemY, baseGeo);
  if (clothes.length) {
    // One draw call for all garments (they share the material and attribute layout).
    const merged = clothes.length === 1 ? clothes[0]! : mergeGeometries(clothes, false);
    if (merged) {
      if (merged !== clothes[0]) for (const g of clothes) g.dispose();
      bindMesh(merged, clothMaterial(k), true, true);
    }
  }

  // Petasos (traveller's hat) on the head bone.
  if (a.petasos) {
    const hat = new THREE.Group();
    const felt = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.012, 24), felt);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), felt);
    crown.scale.y = 0.75;
    hat.add(brim, crown);
    const top = joint('headTop').applyMatrix4(M.neck);
    hat.position.copy(top.sub(posed.head)).add(new THREE.Vector3(0, -0.055, 0));
    hat.traverse((o) => (o.castShadow = true));
    bones.head.add(hat);
  }

  // Props in the hands.
  const props = new Map<string, THREE.Object3D>();
  for (const prop of a.props) {
    const o = buildProp(prop, a.height / 1.72);
    if (!o) continue;
    const hand = prop === 'staff' || prop === 'torch' || prop === 'lamp' || prop === 'stick' || prop === 'strigil' ? bones.handR : bones.handL;
    o.position.y -= 0.07 * (a.height / 1.72);
    hand.add(o);
    props.set(prop, o);
  }

  return {
    object,
    mesh: body!,
    bones,
    dims,
    appearance: a,
    props,
    dispose() {
      for (const g of geoms) g.dispose();
      for (const m of mats) m.dispose();
      for (const p of props.values())
        p.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
          (m.material as THREE.Material | undefined)?.dispose();
        });
    },
  };
}

/** Area-weighted normals shared across UV seams (render vertices that come from the same base vertex). */
function smoothNormals(geo: THREE.BufferGeometry, vRef: Uint16Array): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const idx = geo.getIndex()!;
  const acc = new Map<number, THREE.Vector3>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < idx.count; t += 3) {
    const i0 = idx.getX(t);
    const i1 = idx.getX(t + 1);
    const i2 = idx.getX(t + 2);
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    const nrm = b.clone().sub(a).cross(c.clone().sub(a));
    for (const i of [i0, i1, i2]) {
      const key = vRef[i]!;
      const s = acc.get(key);
      if (s) s.add(nrm);
      else acc.set(key, nrm.clone());
    }
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const s = acc.get(vRef[i]!);
    if (s) {
      const l = s.length() || 1;
      out.set([s.x / l, s.y / l, s.z / l], i * 3);
    } else out.set([0, 1, 0], i * 3);
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
}

type BaseGeo = (vRef: Uint16Array, uv: Float32Array, index: ArrayLike<number>, offset?: (i: number, p: THREE.Vector3, nrm: THREE.Vector3) => void) => THREE.BufferGeometry;

/**
 * Chiton, himation, chlamys and exomis cut from MakeHuman's bodysuit and skirt helpers. Each garment is a scalar
 * field over the helper vertices (> 0 = cloth, in metres): triangles straddling the edge are kept and the fragment
 * shader discards where the interpolated field is negative, so hems, necklines and the diagonal edge of the
 * himation are smooth lines, not triangle steps. Borders are drawn the same way from a second field.
 */
function buildClothes(k: Kit, a: Appearance, P: Float32Array, posed: Record<BoneName, THREE.Vector3>, dims: Dims, hemY: number, baseGeo: BaseGeo): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const dom = (v: number) => k.weights.b[v * 4]!;
  const y = (v: number) => P[v * 3 + 1]!;
  const x = (v: number) => P[v * 3]!;
  const zc = (v: number) => P[v * 3 + 2]!;
  const ARM_L = new Set([BI.upperArmL, BI.foreArmL, BI.handL]);
  const ARM_R = new Set([BI.upperArmR, BI.foreArmR, BI.handR]);
  const isArm = (v: number) => ARM_L.has(dom(v)) || ARM_R.has(dom(v));
  const centre = new THREE.Vector2(posed.hips.x, posed.hips.z);
  const fold = (p: THREE.Vector3, amount: number, freq: number, phase = 0) => {
    const ang = Math.atan2(p.z - centre.y, p.x - centre.x);
    const d = Math.sin(ang * freq + phase + Math.sin(ang * 3.1 + p.y * 7) * 0.8) * amount;
    const dir = new THREE.Vector2(p.x - centre.x, p.z - centre.y).normalize();
    p.x += dir.x * d;
    p.z += dir.y * d;
  };
  const garment = (h: HelperData, field: (v: number) => number, edge: (v: number) => number, base: string, border: string | undefined, offset: (p: THREE.Vector3, n: THREE.Vector3) => void) => {
    const idx: number[] = [];
    for (let t = 0; t < h.index.length; t += 3) {
      const f0 = field(h.vRef[h.index[t]!]!);
      const f1 = field(h.vRef[h.index[t + 1]!]!);
      const f2 = field(h.vRef[h.index[t + 2]!]!);
      if (Math.max(f0, f1, f2) > 0 && Math.min(f0, f1, f2) > -0.3) idx.push(h.index[t]!, h.index[t + 1]!, h.index[t + 2]!);
    }
    if (!idx.length) return;
    const geo = baseGeo(h.vRef, h.uv, idx, (_i, p, n) => offset(p, n));
    const nv = h.vRef.length;
    const mask = new Float32Array(nv);
    const edgeA = new Float32Array(nv);
    const cols = new Float32Array(nv * 3);
    const bcols = new Float32Array(nv * 3);
    const c0 = new THREE.Color(base);
    const c1 = new THREE.Color(border ?? base);
    for (let i = 0; i < nv; i++) {
      const v = h.vRef[i]!;
      mask[i] = field(v);
      edgeA[i] = border ? edge(v) : 1;
      c0.toArray(cols, i * 3);
      c1.toArray(bcols, i * 3);
    }
    geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
    geo.setAttribute('aEdge', new THREE.BufferAttribute(edgeA, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.setAttribute('aBorder', new THREE.BufferAttribute(bcols, 3));
    out.push(geo);
  };
  const tights = k.helpers.tights;
  const skirt = k.helpers.skirt;
  const waist = posed.hips.y + 0.06;
  const neckCut = posed.neck.y - 0.05;
  const elbowY = posed.foreArmL.y;
  const HARD = -1;

  if (a.loincloth) {
    garment(tights, (v) => (isArm(v) ? HARD : Math.min(waist - y(v), y(v) - (posed.thighL.y - 0.12))), () => 1, a.chiton.color, undefined, (p, n) => p.addScaledVector(n, 0.008));
    return out;
  }

  // The himation's diagonal edge: under the right arm, over the left shoulder.
  const sx = dims.shoulderX;
  const cut = (v: number) => THREE.MathUtils.lerp(posed.chest.y - 0.07, posed.neck.y + 0.03, THREE.MathUtils.clamp((x(v) / sx + 1) / 2, 0, 1));
  const himHem = Math.max(posed.footL.y + 0.16, hemY - 0.12);

  // --- Chiton (exomis: right shoulder bare) ---
  const chitonUpper = (v: number) => {
    const yy = y(v);
    if (ARM_R.has(dom(v)) && a.exomis) return HARD;
    let f = Math.min(neckCut - yy, yy - (posed.hips.y - 0.05));
    if (isArm(v)) f = Math.min(f, yy - (elbowY + 0.035));
    if (a.exomis && x(v) < 0) f = Math.min(f, posed.chest.y + 0.03 - yy + Math.max(0, -x(v) - sx * 0.5) * -1);
    if (a.himation) f = Math.min(f, Math.max(yy - cut(v) + 0.04, ARM_R.has(dom(v)) ? 1 : -1));
    return f;
  };
  garment(tights, chitonUpper, (v) => neckCut - y(v), a.chiton.color, a.chiton.border, (p, n) => {
    p.addScaledVector(n, 0.012);
    if (p.y < posed.chest.y) fold(p, 0.003, 11);
  });
  garment(
    skirt,
    (v) => (a.himation ? Math.min(y(v) - hemY, himHem + 0.06 - y(v)) : y(v) - hemY),
    (v) => y(v) - hemY,
    a.chiton.color,
    a.chiton.border,
    (p, n) => {
      const t = THREE.MathUtils.clamp((waist - p.y) / Math.max(0.1, waist - hemY), 0, 1);
      p.addScaledVector(n, 0.012 + t * 0.01);
      fold(p, 0.003 + t * 0.012, 13);
    },
  );

  // --- Himation ---
  if (a.himation) {
    const top = (v: number) => {
      const d = dom(v);
      if (ARM_R.has(d) || d === BI.foreArmL || d === BI.handL) return HARD;
      if (d === BI.upperArmL) return y(v) - (elbowY + 0.07);
      return Math.min(cut(v) - y(v), y(v) - (posed.hips.y - 0.1));
    };
    garment(tights, top, (v) => cut(v) - y(v), a.himation.color, a.himation.border, (p, n) => {
      p.addScaledVector(n, 0.03);
      p.addScaledVector(n, Math.sin((p.y * 0.8 - p.x * 0.6) * 55) * 0.005);
    });
    garment(skirt, (v) => y(v) - himHem, (v) => y(v) - himHem, a.himation.color, a.himation.border, (p, n) => {
      const t = THREE.MathUtils.clamp((waist - p.y) / Math.max(0.1, waist - himHem), 0, 1);
      p.addScaledVector(n, 0.034 + t * 0.012);
      fold(p, 0.006 + t * 0.014, 9, 1.3);
    });
  }

  // --- Chlamys: short cloak over the shoulders and back ---
  if (a.chlamys) {
    const cl = (v: number) => {
      const d = dom(v);
      if (d === BI.foreArmL || d === BI.foreArmR || d === BI.handL || d === BI.handR) return HARD;
      let f = Math.min(neckCut + 0.015 - y(v), y(v) - (posed.hips.y - 0.02));
      if (isArm(v)) f = Math.min(f, y(v) - (elbowY + 0.1));
      else f = Math.min(f, Math.max(posed.chest.z + 0.02 - zc(v), y(v) - (posed.chest.y + 0.07)));
      return f;
    };
    garment(tights, cl, () => 1, a.chlamys, undefined, (p, n) => {
      p.addScaledVector(n, 0.035);
      fold(p, 0.005, 8, 0.6);
    });
  }
  return out;
}

let clothMat: THREE.MeshStandardMaterial | null = null;
function clothMaterial(k: Kit): THREE.MeshStandardMaterial {
  if (clothMat) return clothMat;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, map: k.linen.diff, normalMap: k.linen.nor, normalScale: new THREE.Vector2(0.7, 0.7), side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMask;\nattribute float aEdge;\nattribute vec3 aBorder;\nvarying float vMask;\nvarying float vEdge;\nvarying vec3 vBorder;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMask = aMask; vEdge = aEdge; vBorder = aBorder;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMask;\nvarying float vEdge;\nvarying vec3 vBorder;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (vMask < 0.0) discard;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         // A woven border along the hem or edge, with a thin darker line inside it.
         float band = 1.0 - smoothstep(0.026, 0.03, vEdge);
         diffuseColor.rgb = mix(diffuseColor.rgb, vBorder, band);
         diffuseColor.rgb *= 1.0 - 0.35 * (smoothstep(0.03, 0.033, vEdge) - smoothstep(0.036, 0.04, vEdge));`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
           vec4 weave = texture2D(map, vMapUv * vec2(9.0, 9.0));
           diffuseColor.rgb *= weave.rgb / max(dot(weave.rgb, vec3(0.333)), 0.05) * 0.9;
         #endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#ifdef USE_NORMALMAP_TANGENTSPACE
           vec3 mapN = texture2D(normalMap, vNormalMapUv * vec2(9.0, 9.0)).xyz * 2.0 - 1.0;
           mapN.xy *= normalScale;
           normal = normalize(tbn * mapN);
         #endif`,
      );
  };
  clothMat = mat;
  return mat;
}
