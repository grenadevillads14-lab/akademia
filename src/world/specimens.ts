import * as THREE from 'three';
import data from '../../content/collectibles/specimens.json';
import type { Heightfield } from './heightfield';
import type { Poi } from './structures';

/**
 * Aristotle's catalogue (Act 3): small living things placed along the Cephissus and in the grove, each a
 * point of interest of kind "specimen" that the story's collect trigger adds to the "specimens" set.
 * Built from a handful of primitives each; one group, a few dozen draw calls at most, all culled by distance.
 */
const mat = (color: number, roughness = 0.8, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

const BUILDERS: Record<string, () => THREE.Object3D> = {
  heron() {
    const g = new THREE.Group();
    const grey = mat(0x9aa0a4);
    const body = mesh(new THREE.SphereGeometry(0.22, 12, 8), grey, 0, 0.75, 0);
    body.scale.set(1, 0.8, 1.6);
    const neck = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 6), grey, 0, 1.05, 0.22);
    neck.rotation.x = 0.5;
    const head = mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(0xe8e8e0), 0, 1.3, 0.36);
    const beak = mesh(new THREE.ConeGeometry(0.02, 0.18, 6), mat(0xc9a040), 0, 1.3, 0.48);
    beak.rotation.x = Math.PI / 2;
    const legL = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 4), mat(0x8a7a50), -0.06, 0.3, 0);
    const legR = legL.clone();
    legR.position.x = 0.06;
    g.add(body, neck, head, beak, legL, legR);
    return g;
  },
  tortoise() {
    const g = new THREE.Group();
    const shell = mesh(new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6a5a32, 0.7), 0, 0.02, 0);
    shell.scale.set(1, 0.7, 1.25);
    const head = mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0x7a6a4a), 0, 0.05, 0.22);
    g.add(shell, head);
    return g;
  },
  frog() {
    const g = new THREE.Group();
    const pad = mesh(new THREE.CircleGeometry(0.22, 14), mat(0x3e5a2a, 0.6), 0, 0.01, 0);
    pad.rotation.x = -Math.PI / 2;
    const body = mesh(new THREE.SphereGeometry(0.05, 10, 8), mat(0x5a7a32, 0.5), 0, 0.05, 0);
    body.scale.set(1, 0.7, 1.3);
    const eyeL = mesh(new THREE.SphereGeometry(0.015, 6, 6), mat(0xd8c060, 0.3), -0.025, 0.085, 0.04);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.025;
    g.add(pad, body, eyeL, eyeR);
    return g;
  },
  crab() {
    const g = new THREE.Group();
    const m = mat(0x8a4a2a, 0.6);
    const body = mesh(new THREE.SphereGeometry(0.06, 10, 6), m, 0, 0.03, 0);
    body.scale.set(1.3, 0.45, 1);
    g.add(body);
    for (let i = 0; i < 4; i++) {
      for (const s of [-1, 1]) {
        const leg = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 4), m, s * 0.085, 0.025, -0.03 + i * 0.022);
        leg.rotation.z = s * 1.1;
        g.add(leg);
      }
    }
    const claw = mesh(new THREE.SphereGeometry(0.022, 6, 6), m, 0.05, 0.03, 0.07);
    const claw2 = claw.clone();
    claw2.position.x = -0.05;
    g.add(claw, claw2);
    return g;
  },
  eel() {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) pts.push(new THREE.Vector3(Math.sin(i * 0.6) * 0.08, -0.06, i * 0.035 - 0.35));
    const g = new THREE.Group();
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.018, 6), mat(0x2a2a20, 0.4)));
    return g;
  },
  cicada() {
    const g = new THREE.Group();
    const stump = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.55, 10), mat(0x6a5a48, 0.95), 0, 0.27, 0);
    const body = mesh(new THREE.CapsuleGeometry(0.012, 0.035, 4, 6), mat(0x4a4030), 0, 0.42, 0.16);
    body.rotation.x = Math.PI / 2 - 0.3;
    const wing = mesh(new THREE.PlaneGeometry(0.03, 0.06), mat(0xd8e0e0, 0.2, { transparent: true, opacity: 0.6, side: THREE.DoubleSide }), 0, 0.43, 0.17);
    g.add(stump, body, wing);
    return g;
  },
  bees() {
    const g = new THREE.Group();
    const skep = mesh(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xb89a5a, 0.95), 0, 0.3, 0);
    skep.scale.y = 1.3;
    const stand = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.3, 12), mat(0x7a6a52, 0.9), 0, 0.15, 0);
    g.add(stand, skep);
    const bee = new THREE.SphereGeometry(0.012, 5, 4);
    const bm = mat(0x3a2a10);
    for (let i = 0; i < 14; i++) g.add(mesh(bee, bm, Math.sin(i * 2.4) * 0.45, 0.4 + (i % 5) * 0.09, Math.cos(i * 2.4) * 0.45));
    g.userData.spin = true;
    return g;
  },
  snail() {
    const g = new THREE.Group();
    const rock = mesh(new THREE.DodecahedronGeometry(0.25, 0), mat(0x8a8070, 0.95), 0, 0.12, 0);
    rock.scale.y = 0.5;
    const shell = mesh(new THREE.TorusGeometry(0.025, 0.014, 6, 10), mat(0xa08050, 0.5), 0, 0.27, 0.04);
    const foot = mesh(new THREE.CapsuleGeometry(0.01, 0.05, 4, 6), mat(0xa09080, 0.4), 0, 0.25, 0.06);
    foot.rotation.x = Math.PI / 2;
    g.add(rock, shell, foot);
    return g;
  },
  planeleaf() {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = 0.12 * (0.65 + 0.35 * Math.abs(Math.cos(a * 2.5)));
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const leaf = mesh(new THREE.ShapeGeometry(shape), mat(0x9a7a3a, 0.8, { side: THREE.DoubleSide }), 0, 0.02, 0);
    leaf.rotation.x = -Math.PI / 2;
    const seed = mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(0x7a6a3a, 0.9), 0.15, 0.03, 0.05);
    g.add(leaf, seed);
    return g;
  },
  asphodel() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.9, 5), mat(0x6a7a4a), 0, 0.45, 0));
    const fl = mat(0xf2ece0, 0.6);
    const f = new THREE.SphereGeometry(0.018, 5, 4);
    for (let i = 0; i < 18; i++) g.add(mesh(f, fl, Math.sin(i * 2.1) * 0.03, 0.65 + i * 0.016, Math.cos(i * 2.1) * 0.03));
    for (let i = 0; i < 6; i++) {
      const leaf = mesh(new THREE.ConeGeometry(0.012, 0.4, 4), mat(0x7a8a5a), Math.sin(i) * 0.05, 0.15, Math.cos(i) * 0.05);
      leaf.rotation.set(Math.sin(i) * 0.5, 0, Math.cos(i) * 0.5);
      g.add(leaf);
    }
    return g;
  },
};

export interface SpecimenField {
  group: THREE.Group;
  update(camera: THREE.Camera, time: number): void;
}

export function buildSpecimens(hf: Heightfield, pois: Poi[]): SpecimenField {
  const group = new THREE.Group();
  group.name = 'specimens';
  for (const [id, it] of Object.entries(data.items)) {
    const make = BUILDERS[it.kind];
    if (!make) throw new Error(`No model for specimen kind "${it.kind}"`);
    const o = make();
    const water = hf.water(it.x, it.z);
    const ground = hf.height(it.x, it.z);
    const y = water.id && (it.kind === 'frog' || it.kind === 'eel') ? Math.max(ground, water.level) : ground;
    o.position.set(it.x, y, it.z);
    o.rotation.y = (it.x * 13.1 + it.z * 7.3) % (Math.PI * 2);
    o.userData.id = id;
    group.add(o);
    pois.push({ id, kind: 'specimen', position: new THREE.Vector3(it.x, y, it.z) });
  }
  return {
    group,
    update(camera, time) {
      for (const o of group.children) {
        o.visible = o.position.distanceToSquared(camera.position) < 120 * 120;
        if (o.visible && o.userData.spin) o.children.forEach((c, i) => i > 1 && c.position.set(Math.sin(time * 2 + i * 2.4) * 0.45, 0.4 + (i % 5) * 0.09 + Math.sin(time * 5 + i) * 0.03, Math.cos(time * 2 + i * 2.4) * 0.45));
      }
    },
  };
}
