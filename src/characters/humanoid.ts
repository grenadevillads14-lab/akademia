import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Appearance } from './appearance';

/**
 * Procedural stylized humanoid: a 19-bone skeleton and ONE skinned mesh (one draw call per character).
 * Body parts and clothes are simple solids built in the bind pose and rigidly (or two-bone) weighted,
 * so a chiton hem follows the thighs and a himation drapes from the shoulder.
 *
 * Conventions: character faces +Z, Y up, units metres, feet at y = 0.
 */
export const BONES = [
  'root', 'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'foreArmL', 'handL',
  'shoulderR', 'upperArmR', 'foreArmR', 'handR',
  'thighL', 'shinL', 'footL',
  'thighR', 'shinR', 'footR',
] as const;
export type BoneName = (typeof BONES)[number];
const B = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;

export interface Humanoid {
  readonly object: THREE.Group;
  readonly mesh: THREE.SkinnedMesh;
  readonly bones: Record<BoneName, THREE.Bone>;
  /** Rest heights used by the animator (hip height etc.). */
  readonly dims: Dims;
  readonly appearance: Appearance;
  /** Props attached to hands (scroll, staff, lamp, torch…). */
  readonly props: Map<string, THREE.Object3D>;
  dispose(): void;
}

export interface Dims {
  height: number;
  hipY: number;
  thigh: number;
  shin: number;
  upperArm: number;
  foreArm: number;
  shoulderX: number;
  chestW: number;
}

interface Part {
  geo: THREE.BufferGeometry;
  color: THREE.Color;
  /** Bone index for all vertices, or a function giving [boneA, boneB, weightB] per vertex position. */
  bone: number | ((p: THREE.Vector3) => [number, number, number]);
}

const col = (hex: string) => new THREE.Color(hex);

export function buildHumanoid(a: Appearance): Humanoid {
  const s = a.height / 1.72;
  const broad = 0.85 + a.build * 0.35;
  const fem = a.sex === 'f';
  const dims: Dims = {
    height: a.height,
    hipY: 0.93 * s,
    thigh: 0.43 * s,
    shin: 0.43 * s,
    upperArm: 0.28 * s,
    foreArm: 0.25 * s,
    shoulderX: (fem ? 0.165 : 0.185) * s * broad,
    chestW: (fem ? 0.15 : 0.165) * s * broad,
  };
  const hipY = dims.hipY;
  const spineY = hipY + 0.11 * s;
  const chestY = hipY + 0.29 * s;
  const neckY = hipY + 0.5 * s;
  const headY = neckY + 0.08 * s;
  const shoulderY = chestY + 0.17 * s;

  // --- Skeleton (bind pose: standing, arms slightly away from the body) ---
  const bones = {} as Record<BoneName, THREE.Bone>;
  for (const name of BONES) {
    bones[name] = new THREE.Bone();
    bones[name].name = name;
  }
  const link = (parent: BoneName, child: BoneName, x: number, y: number, z = 0) => {
    bones[child].position.set(x, y, z);
    bones[parent].add(bones[child]);
  };
  link('root', 'hips', 0, hipY);
  link('hips', 'spine', 0, spineY - hipY);
  link('spine', 'chest', 0, chestY - spineY);
  link('chest', 'neck', 0, neckY - chestY);
  link('neck', 'head', 0, headY - neckY);
  for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
    link('chest', `shoulder${side}`, sx * dims.shoulderX * 0.45, shoulderY - chestY);
    link(`shoulder${side}`, `upperArm${side}`, sx * dims.shoulderX * 0.55, 0);
    link(`upperArm${side}`, `foreArm${side}`, 0, -dims.upperArm);
    link(`foreArm${side}`, `hand${side}`, 0, -dims.foreArm);
    link('hips', `thigh${side}`, sx * 0.095 * s * broad, -0.04 * s);
    link(`thigh${side}`, `shin${side}`, 0, -dims.thigh);
    link(`shin${side}`, `foot${side}`, 0, -dims.shin);
  }
  // Arms hang slightly outward in the bind pose.
  bones.upperArmL.rotation.z = 0.08;
  bones.upperArmR.rotation.z = -0.08;
  bones.root.updateMatrixWorld(true);
  const wp = (b: BoneName) => new THREE.Vector3().setFromMatrixPosition(bones[b].matrixWorld);

  // --- Parts ---
  const parts: Part[] = [];
  /** Colours that are fabric (get the linen weave); everything else is skin, hair, leather or metal. */
  const cloth = new Set<THREE.Color>();
  const skin = col(a.skin);
  const hairC = col(a.hair.color);
  const beardC = col(a.beard.color);
  const chitonC = col(a.chiton.color);
  cloth.add(chitonC);
  const sandal = col('#6b4a2e');

  const add = (geo: THREE.BufferGeometry, color: THREE.Color, bone: Part['bone']) => parts.push({ geo, color, bone });

  /** Capsule-ish limb from a to b (world bind positions). */
  const limb = (a0: THREE.Vector3, b0: THREE.Vector3, r0: number, r1: number, radial = 8) => {
    const len = a0.distanceTo(b0);
    const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, false);
    g.translate(0, len / 2, 0);
    const dir = b0.clone().sub(a0).normalize();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    g.translate(a0.x, a0.y, a0.z);
    return g;
  };
  const ball = (p: THREE.Vector3, rx: number, ry: number, rz: number, w = 10, h = 8) => {
    const g = new THREE.SphereGeometry(1, w, h);
    g.scale(rx, ry, rz);
    g.translate(p.x, p.y, p.z);
    return g;
  };

  // Head and face.
  const headC = wp('head').add(new THREE.Vector3(0, 0.11 * s, 0.005));
  add(ball(headC, 0.095 * s, 0.118 * s, 0.108 * s, 14, 12), skin, B.head);
  add(ball(headC.clone().add(new THREE.Vector3(0, -0.01 * s, 0.105 * s)), 0.018 * s, 0.028 * s, 0.025 * s, 6, 5), skin, B.head); // nose
  for (const ex of [-1, 1]) {
    add(ball(headC.clone().add(new THREE.Vector3(ex * 0.035 * s, 0.02 * s, 0.093 * s)), 0.012 * s, 0.009 * s, 0.006 * s, 6, 4), col('#1d140e'), B.head);
    add(ball(headC.clone().add(new THREE.Vector3(ex * 0.095 * s, 0.0, 0.0)), 0.016 * s, 0.026 * s, 0.014 * s, 6, 4), skin, B.head); // ears
  }
  // Hair.
  const hairOn = (rx: number, ry: number, rz: number, dy: number, dz = -0.01) =>
    add(ball(headC.clone().add(new THREE.Vector3(0, dy * s, dz * s)), rx * s, ry * s, rz * s, 12, 10), hairC, B.head);
  switch (a.hair.style) {
    case 'cropped':
      hairOn(0.099, 0.1, 0.106, 0.03);
      break;
    case 'short':
      hairOn(0.103, 0.105, 0.112, 0.03);
      break;
    case 'curly':
      hairOn(0.108, 0.11, 0.115, 0.035);
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2;
        add(ball(headC.clone().add(new THREE.Vector3(Math.cos(ang) * 0.08 * s, 0.07 * s, Math.sin(ang) * 0.075 * s - 0.01 * s)), 0.035 * s, 0.03 * s, 0.035 * s, 6, 5), hairC, B.head);
      }
      break;
    case 'long':
      hairOn(0.105, 0.11, 0.113, 0.03);
      add(ball(headC.clone().add(new THREE.Vector3(0, -0.1 * s, -0.06 * s)), 0.09 * s, 0.14 * s, 0.06 * s), hairC, B.head);
      break;
    case 'bun':
      hairOn(0.103, 0.106, 0.11, 0.03);
      add(ball(headC.clone().add(new THREE.Vector3(0, 0.05 * s, -0.11 * s)), 0.045 * s, 0.045 * s, 0.045 * s), hairC, B.head);
      break;
    case 'bald':
      add(ball(headC.clone().add(new THREE.Vector3(0, -0.02 * s, -0.03 * s)), 0.1 * s, 0.07 * s, 0.09 * s), hairC, B.head);
      break;
    case 'wild':
      hairOn(0.115, 0.12, 0.12, 0.035);
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2;
        add(ball(headC.clone().add(new THREE.Vector3(Math.cos(ang) * 0.1 * s, 0.03 * s, Math.sin(ang) * 0.09 * s - 0.02 * s)), 0.045 * s, 0.05 * s, 0.04 * s, 6, 5), hairC, B.head);
      }
      break;
  }
  // Beard.
  const beardBall = (ry: number, rz: number, dy: number, dz: number) =>
    add(ball(headC.clone().add(new THREE.Vector3(0, dy * s, dz * s)), 0.078 * s, ry * s, rz * s, 10, 8), beardC, B.head);
  switch (a.beard.style) {
    case 'stubble':
      beardBall(0.06, 0.07, -0.07, 0.04);
      break;
    case 'trimmed':
      beardBall(0.07, 0.075, -0.08, 0.045);
      break;
    case 'full':
      beardBall(0.09, 0.08, -0.1, 0.05);
      break;
    case 'long':
      beardBall(0.13, 0.08, -0.14, 0.05);
      break;
    case 'ragged':
      beardBall(0.12, 0.09, -0.13, 0.05);
      add(ball(headC.clone().add(new THREE.Vector3(0.02 * s, -0.22 * s, 0.07 * s)), 0.04 * s, 0.06 * s, 0.03 * s, 6, 5), beardC, B.head);
      break;
    case 'none':
      break;
  }
  // Neck.
  add(limb(wp('neck').add(new THREE.Vector3(0, -0.02 * s, 0)), wp('head').add(new THREE.Vector3(0, 0.04 * s, 0)), 0.045 * s, 0.042 * s), skin, B.neck);

  // Torso (as clothed by the chiton, or bare for athletes).
  const torsoC = a.loincloth ? skin : chitonC;
  const chestCenter = wp('chest').add(new THREE.Vector3(0, 0.07 * s, 0));
  add(ball(chestCenter, dims.chestW * 1.05, 0.17 * s, (fem ? 0.1 : 0.095) * s * broad), torsoC, B.chest);
  add(ball(wp('spine').add(new THREE.Vector3(0, 0.02 * s, 0)), dims.chestW * 0.92, 0.13 * s, 0.085 * s * broad), torsoC, B.spine);
  add(ball(wp('hips').add(new THREE.Vector3(0, 0.0, 0)), dims.chestW * 0.98 * (fem ? 1.08 : 1), 0.1 * s, 0.09 * s * broad), a.loincloth ? col('#e9e1cf') : chitonC, B.hips);
  if (fem) {
    for (const bx of [-1, 1]) add(ball(chestCenter.clone().add(new THREE.Vector3(bx * 0.055 * s, -0.02 * s, 0.075 * s)), 0.05 * s, 0.05 * s, 0.04 * s, 8, 6), torsoC, B.chest);
  }

  // Arms (short chiton sleeves on the upper arm).
  for (const side of ['L', 'R'] as const) {
    const sh = wp(`upperArm${side}`);
    const el = wp(`foreArm${side}`);
    const wr = wp(`hand${side}`);
    add(ball(sh, 0.06 * s * broad, 0.055 * s, 0.06 * s, 8, 6), a.loincloth || (a.exomis && side === 'R') ? skin : chitonC, B[`upperArm${side}`]);
    const sleeveEnd = sh.clone().lerp(el, 0.45);
    add(limb(sh, sleeveEnd, 0.052 * s * broad, 0.05 * s * broad), a.loincloth || (a.exomis && side === 'R') ? skin : chitonC, B[`upperArm${side}`]);
    add(limb(sleeveEnd, el, 0.042 * s * broad, 0.038 * s), skin, B[`upperArm${side}`]);
    add(limb(el, wr, 0.037 * s, 0.03 * s), skin, B[`foreArm${side}`]);
    add(ball(wr.clone().add(new THREE.Vector3(0, -0.045 * s, 0.005)), 0.03 * s, 0.05 * s, 0.022 * s, 8, 6), skin, B[`hand${side}`]);
    if (a.rings && side === 'L') add(ball(wr.clone().add(new THREE.Vector3(0, -0.07 * s, 0.015 * s)), 0.012 * s, 0.006 * s, 0.012 * s, 6, 4), col('#d9b34a'), B[`hand${side}`]);
  }

  // Legs and sandals.
  for (const side of ['L', 'R'] as const) {
    const hp = wp(`thigh${side}`);
    const kn = wp(`shin${side}`);
    const an = wp(`foot${side}`);
    add(limb(hp, kn, 0.068 * s * broad, 0.05 * s), skin, B[`thigh${side}`]);
    add(limb(kn, an, 0.048 * s, 0.035 * s), skin, B[`shin${side}`]);
    const foot = new THREE.BoxGeometry(0.075 * s, 0.045 * s, 0.24 * s);
    foot.translate(an.x, 0.025 * s, an.z + 0.06 * s);
    add(foot, skin, B[`foot${side}`]);
    const sole = new THREE.BoxGeometry(0.085 * s, 0.018 * s, 0.25 * s);
    sole.translate(an.x, 0.009 * s, an.z + 0.06 * s);
    add(sole, sandal, B[`foot${side}`]);
    const strap = new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 0.015 * s, 8, 1, true);
    strap.translate(an.x, 0.07 * s, an.z);
    add(strap, sandal, B[`shin${side}`]);
  }

  // Skirt-like garments: weighted between hips and the nearer thigh/shin so they follow the stride.
  const skirtWeights = (p: THREE.Vector3): [number, number, number] => {
    const side = p.x >= 0 ? 'L' : 'R';
    const hemT = THREE.MathUtils.clamp((hipY - p.y) / (dims.thigh + dims.shin * 0.6), 0, 1);
    const sideW = THREE.MathUtils.clamp(Math.abs(p.x) / (0.12 * s) + Math.max(0, p.z) * 1.5, 0, 1);
    const below = p.y < hipY - dims.thigh;
    return [B.hips, below ? B[`shin${side}`] : B[`thigh${side}`], hemT * (0.25 + 0.55 * sideW)];
  };
  const skirt = (topY: number, bottomY: number, rTop: number, rBot: number, color: THREE.Color, segs = 16, flare = 0) => {
    const g = new THREE.CylinderGeometry(rTop, rBot + flare, topY - bottomY, segs, 4, true);
    g.translate(0, (topY + bottomY) / 2, 0);
    g.scale(1, 1, 0.8);
    add(g, color, skirtWeights);
  };
  if (a.loincloth) {
    const lc = col('#e9e1cf');
    cloth.add(lc);
    skirt(hipY + 0.03 * s, hipY - 0.1 * s, dims.chestW * 1.0, dims.chestW * 1.02, lc);
  } else {
    const hem = a.chiton.length === 'short' ? hipY - 0.25 * s : a.chiton.length === 'knee' ? hipY - dims.thigh - 0.04 * s : 0.12 * s;
    skirt(hipY + 0.08 * s, hem, dims.chestW * 1.02, dims.chestW * 1.25, chitonC, 18, a.chiton.length === 'ankle' ? 0.06 * s : 0.02 * s);
    if (a.chiton.border) {
      const bc = col(a.chiton.border);
      cloth.add(bc);
      skirt(hem + 0.035 * s, hem, dims.chestW * 1.25 + 0.004, dims.chestW * 1.27 + 0.006, bc, 18, a.chiton.length === 'ankle' ? 0.06 * s : 0.02 * s);
    }
    // Belt (zone).
    const belt = new THREE.TorusGeometry(dims.chestW * 1.0, 0.012 * s, 4, 16);
    belt.rotateX(Math.PI / 2);
    belt.scale(1, 1, 0.82);
    belt.translate(0, hipY + 0.12 * s, 0);
    add(belt, chitonC.clone().multiplyScalar(0.7), B.spine);
  }

  // Himation: a heavy cloak wrapped around the body, over the LEFT shoulder, right arm free.
  if (a.himation) {
    const hc = col(a.himation.color);
    cloth.add(hc);
    const hemY = a.age === 'youth' ? hipY - dims.thigh - 0.02 * s : 0.3 * s;
    skirt(hipY + 0.16 * s, hemY, dims.chestW * 1.18, dims.chestW * 1.42, hc, 20, 0.05 * s);
    if (a.himation.border) {
      const hb = col(a.himation.border);
      cloth.add(hb);
      skirt(hemY + 0.04 * s, hemY, dims.chestW * 1.42 + 0.006, dims.chestW * 1.44 + 0.008, hb, 20, 0.05 * s);
    }
    // Diagonal band from the left shoulder across the chest and back to the right hip.
    const band = new THREE.CylinderGeometry(dims.chestW * 1.18, dims.chestW * 1.22, 0.2 * s, 18, 1, true);
    band.scale(1, 1, 0.78);
    band.rotateZ(-0.55);
    band.translate(0.01 * s, chestY + 0.05 * s, 0);
    add(band, hc, B.chest);
    // Fold over the left shoulder hanging down the back.
    const flap = new THREE.BoxGeometry(0.12 * s, 0.55 * s, 0.03 * s);
    flap.translate(dims.shoulderX * 0.7, shoulderY - 0.25 * s, -0.09 * s);
    add(flap, hc, B.chest);
    const shoulderCap = ball(wp('upperArmL').add(new THREE.Vector3(-0.01, 0.01 * s, 0)), 0.075 * s, 0.06 * s, 0.075 * s, 8, 6);
    add(shoulderCap, hc, B.shoulderL);
  }
  // Chlamys: short cloak pinned at the right shoulder (travellers, horsemen, young men).
  if (a.chlamys) {
    const cc = col(a.chlamys);
    cloth.add(cc);
    // Theta 0 is +Z (front); cover the back half and drape over both shoulders.
    const cape = new THREE.CylinderGeometry(dims.chestW * 0.9, dims.chestW * 1.5, 0.62 * s, 16, 3, true, Math.PI * 0.42, Math.PI * 1.16);
    cape.scale(1, 1, 0.85);
    cape.translate(0, shoulderY - 0.27 * s, -0.015 * s);
    add(cape, cc, (p) => [B.chest, B.spine, THREE.MathUtils.clamp((shoulderY - p.y) / (0.5 * s), 0, 1) * 0.6]);
    add(ball(wp('upperArmR').add(new THREE.Vector3(0.02 * s, 0.03 * s, 0.05 * s)), 0.018 * s, 0.018 * s, 0.01 * s, 6, 4), col('#c8a24a'), B.chest);
  }
  if (a.petasos) {
    const brim = new THREE.CylinderGeometry(0.21 * s, 0.22 * s, 0.012 * s, 18);
    brim.translate(headC.x, headC.y + 0.075 * s, headC.z);
    add(brim, col('#a88a5a'), B.head);
    const crown = new THREE.SphereGeometry(0.1 * s, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    crown.translate(headC.x, headC.y + 0.075 * s, headC.z);
    add(crown, col('#9a7c4e'), B.head);
  }

  // --- Merge into one skinned geometry ---
  const prepared: THREE.BufferGeometry[] = [];
  const tmp = new THREE.Vector3();
  for (const part of parts) {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo;
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position!.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('aCloth', new THREE.BufferAttribute(new Float32Array(n).fill(cloth.has(part.color) ? 1 : 0), 1));
    const colors = new Float32Array(n * 3);
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      // Subtle per-vertex shade noise so flat colours read as cloth and skin, not plastic.
      const shade = 0.94 + ((i * 2654435761) % 1000) / 1000 * 0.08;
      colors[i * 3] = part.color.r * shade;
      colors[i * 3 + 1] = part.color.g * shade;
      colors[i * 3 + 2] = part.color.b * shade;
      if (typeof part.bone === 'number') {
        skinIndex[i * 4] = part.bone;
        skinWeight[i * 4] = 1;
      } else {
        tmp.fromBufferAttribute(g.attributes.position as THREE.BufferAttribute, i);
        const [b0, b1, w1] = part.bone(tmp);
        skinIndex[i * 4] = b0;
        skinIndex[i * 4 + 1] = b1;
        skinWeight[i * 4] = 1 - w1;
        skinWeight[i * 4 + 1] = w1;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    prepared.push(g);
  }
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('Could not merge character geometry');
  for (const g of prepared) g.dispose();
  for (const p of parts) p.geo.dispose();
  merged.computeBoundingSphere();

  const material = characterMaterial();
  const mesh = new THREE.SkinnedMesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // skinned bounds aren't updated; culled at the character level instead
  const skeleton = new THREE.Skeleton(BONES.map((n) => bones[n]));
  mesh.add(bones.root);
  mesh.bind(skeleton);

  const object = new THREE.Group();
  object.name = 'humanoid';
  object.add(mesh);

  const props = new Map<string, THREE.Object3D>();
  for (const prop of a.props) {
    const o = buildProp(prop, s);
    if (!o) continue;
    const hand = prop === 'staff' || prop === 'torch' || prop === 'lamp' || prop === 'stick' || prop === 'strigil' ? bones.handR : bones.handL;
    o.position.y -= 0.06 * s;
    hand.add(o);
    props.set(prop, o);
  }

  return {
    object,
    mesh,
    bones,
    dims,
    appearance: a,
    props,
    dispose() {
      merged.dispose();
      material.dispose();
      for (const p of props.values()) p.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
    },
  };
}

/**
 * Shared character material: vertex colours, with the Poly Haven linen weave (albedo and normal)
 * applied only where aCloth = 1. Characters share one program (and one texture load).
 */
let sharedLinen: { diff: THREE.Texture; nor: THREE.Texture } | null = null;
function characterMaterial(): THREE.MeshStandardMaterial {
  if (!sharedLinen && typeof document !== 'undefined') {
    const loader = new THREE.TextureLoader();
    const base = `${import.meta.env.BASE_URL}assets/ph/textures/rough_linen/`;
    const diff = loader.load(`${base}diff.webp`);
    diff.colorSpace = THREE.SRGBColorSpace;
    const nor = loader.load(`${base}nor.webp`);
    for (const t of [diff, nor]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
    }
    sharedLinen = { diff, nor };
  }
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
    ...(sharedLinen ? { map: sharedLinen.diff, normalMap: sharedLinen.nor, normalScale: new THREE.Vector2(0.8, 0.8) } : {}),
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCloth;\nvarying float vCloth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloth = aCloth;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCloth;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
           vec4 weave = texture2D(map, vMapUv * vec2(7.0, 4.0));
           // The linen photo is light grey; normalise it so it adds texture, not tint.
           diffuseColor.rgb *= mix(vec3(1.0), weave.rgb / max(dot(weave.rgb, vec3(0.333)), 0.05) * 0.92, vCloth * 0.85);
         #endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#ifdef USE_NORMALMAP_TANGENTSPACE
           vec3 mapN = texture2D(normalMap, vNormalMapUv * vec2(7.0, 4.0)).xyz * 2.0 - 1.0;
           mapN.xy *= normalScale * vCloth;
           normal = normalize(tbn * mapN);
         #endif`,
      );
  };
  return mat;
}

/** Build a hand prop (scroll, staff, torch…) scaled for a figure of height factor s. */
export function buildProp(kind: string, s: number): THREE.Object3D | null {
  const mat = (c: number, r = 0.8, emissive = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, emissive: emissive ? c : 0, emissiveIntensity: emissive });
  const g = new THREE.Group();
  g.name = `prop-${kind}`;
  switch (kind) {
    case 'scroll': {
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * s, 0.025 * s, 0.24 * s, 8), mat(0xe8dcb5));
      roll.rotation.x = Math.PI / 2;
      g.add(roll);
      break;
    }
    case 'staff': {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.014 * s, 0.018 * s, 1.5 * s, 6), mat(0x6b5236));
      st.position.y = -0.25 * s;
      g.add(st);
      break;
    }
    case 'stick': {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * s, 0.01 * s, 0.9 * s, 5), mat(0x7a5c3a));
      st.rotation.x = 1.2;
      st.position.set(0, -0.1 * s, 0.35 * s);
      g.add(st);
      break;
    }
    case 'lamp': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.045 * s, 8, 6), mat(0xa5643a));
      body.scale.set(1.4, 0.6, 1);
      body.position.z = 0.06 * s;
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.018 * s, 6, 5), mat(0xffb347, 0.5, 2.5));
      flame.position.set(0, 0.035 * s, 0.12 * s);
      flame.scale.set(0.7, 1.4, 0.7);
      flame.name = 'flame';
      g.add(body, flame);
      break;
    }
    case 'tablet': {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.012 * s, 0.11 * s), mat(0x8a6a44));
      t.position.z = 0.05 * s;
      g.add(t);
      break;
    }
    case 'torch': {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * s, 0.025 * s, 0.6 * s, 6), mat(0x5a4027));
      st.position.y = 0.1 * s;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.18 * s, 7), mat(0xff9a3c, 0.5, 3));
      flame.position.y = 0.48 * s;
      flame.name = 'flame';
      g.add(st, flame);
      break;
    }
    case 'strigil': {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.06 * s, 0.008 * s, 4, 10, Math.PI), mat(0xb08a4a, 0.4));
      g.add(t);
      break;
    }
    case 'lyre': {
      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.12 * s, 0.012 * s, 5, 14, Math.PI * 1.3), mat(0x7a5232));
      frame.rotation.z = Math.PI * 0.85;
      frame.position.z = 0.08 * s;
      g.add(frame);
      break;
    }
    case 'basket': {
      const bsk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.11 * s, 0.14 * s, 10, 1, true), mat(0xb08c55));
      bsk.position.y = -0.12 * s;
      g.add(bsk);
      break;
    }
    case 'amphora': {
      const pts = [[0, 0], [0.05, 0.01], [0.12, 0.12], [0.13, 0.25], [0.08, 0.4], [0.04, 0.46], [0.045, 0.52]].map(([x, y]) => new THREE.Vector2(x! * s, y! * s));
      const amp = new THREE.Mesh(new THREE.LatheGeometry(pts, 10), mat(0xa7552c));
      amp.position.set(0, -0.25 * s, 0.05 * s);
      g.add(amp);
      break;
    }
    default:
      return null;
  }
  g.traverse((o) => {
    (o as THREE.Mesh).castShadow = true;
  });
  return g;
}

export { B as BONE_INDEX };
