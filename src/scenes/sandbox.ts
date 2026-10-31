import * as THREE from 'three';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics/physics';

/**
 * M0 sandbox: proves rendering, lighting, shadows, physics and the stats overlay work together.
 * Replaced by the real terrain and grove in M1. Everything here is throwaway graybox.
 */
export interface Sandbox {
  update(): void;
  dropObjects(): void;
  dispose(): void;
}

interface Dynamic {
  mesh: THREE.Mesh;
  body: RigidBody;
}

export function buildSandbox(scene: THREE.Scene, physics: Physics, opts: { stress: number; shadowMapSize: number }): Sandbox {
  const R = physics.R;
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d);
    return d;
  };

  // Sky and fog: warm late-afternoon placeholder until the physical sky lands in M1.
  // Fog colour == background colour so the far ground melts into a hazy horizon.
  const haze = 0xc4d2d8;
  scene.background = new THREE.Color(haze);
  scene.fog = new THREE.Fog(haze, 60, 520);

  const hemi = new THREE.HemisphereLight(0xcfe0f0, 0x8a7350, 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffd9a8, 3.2);
  sun.position.set(-40, 38, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(opts.shadowMapSize, opts.shadowMapSize);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  // Ground: packed earth with a 1 m / 10 m measuring grid so scale is always readable.
  const groundTex = track(makeGridTexture());
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(300, 300);
  groundTex.anisotropy = 8;
  const ground = new THREE.Mesh(
    track(new THREE.PlaneGeometry(3000, 3000)),
    track(new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 })),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  physics.world.createCollider(R.ColliderDesc.cuboid(1500, 0.5, 1500).setTranslation(0, -0.5, 0));

  // A graybox Doric colonnade at roughly the real proportions (column height ≈ 5.5 × lower diameter).
  const limestone = track(new THREE.MeshStandardMaterial({ color: 0xd9cdb4, roughness: 0.85 }));
  const shaftGeo = track(new THREE.CylinderGeometry(0.42, 0.5, 5.2, 20));
  const capGeo = track(new THREE.BoxGeometry(1.15, 0.25, 1.15));
  const echinusGeo = track(new THREE.CylinderGeometry(0.6, 0.44, 0.25, 20));
  const columns = new THREE.Group();
  const spacing = 2.4;
  for (let i = 0; i < 8; i++) {
    for (const z of [-6, 6]) {
      const x = (i - 3.5) * spacing;
      const shaft = new THREE.Mesh(shaftGeo, limestone);
      shaft.position.set(x, 2.6, z);
      const echinus = new THREE.Mesh(echinusGeo, limestone);
      echinus.position.set(x, 5.32, z);
      const abacus = new THREE.Mesh(capGeo, limestone);
      abacus.position.set(x, 5.57, z);
      for (const m of [shaft, echinus, abacus]) {
        m.castShadow = m.receiveShadow = true;
        columns.add(m);
      }
      physics.world.createCollider(R.ColliderDesc.cylinder(2.6, 0.5).setTranslation(x, 2.6, z));
    }
  }
  const entablature = new THREE.Mesh(track(new THREE.BoxGeometry(spacing * 7 + 1.4, 1.1, 1.3)), limestone);
  for (const z of [-6, 6]) {
    const e = entablature.clone();
    e.position.set(0, 6.25, z);
    e.castShadow = e.receiveShadow = true;
    columns.add(e);
  }
  columns.position.set(0, 0, -18);
  scene.add(columns);

  // Falling props (amphora stand-ins) to exercise Rapier.
  const dynamics: Dynamic[] = [];
  const terracotta = track(new THREE.MeshStandardMaterial({ color: 0xb4582f, roughness: 0.7 }));
  const marble = track(new THREE.MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.4 }));
  const boxGeo = track(new THREE.BoxGeometry(0.8, 0.8, 0.8));
  const ballGeo = track(new THREE.SphereGeometry(0.45, 20, 14));
  for (let i = 0; i < 24; i++) {
    const isBall = i % 3 === 0;
    const mesh = new THREE.Mesh(isBall ? ballGeo : boxGeo, isBall ? marble : terracotta);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    const body = physics.world.createRigidBody(R.RigidBodyDesc.dynamic());
    physics.world.createCollider(
      (isBall ? R.ColliderDesc.ball(0.45) : R.ColliderDesc.cuboid(0.4, 0.4, 0.4)).setRestitution(0.2).setFriction(0.8),
      body,
    );
    dynamics.push({ mesh, body });
  }

  const rng = mulberry32(367); // 367 BC
  const dropObjects = () => {
    for (const [i, d] of dynamics.entries()) {
      d.body.setTranslation({ x: (rng() - 0.5) * 8, y: 6 + i * 0.9, z: (rng() - 0.5) * 8 }, true);
      d.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      d.body.setAngvel({ x: rng() * 2, y: rng() * 2, z: rng() * 2 }, true);
    }
  };
  dropObjects();

  // Optional stress test: ?stress=N renders N instanced stones in ONE draw call.
  if (opts.stress > 0) {
    const inst = new THREE.InstancedMesh(track(new THREE.DodecahedronGeometry(0.35, 0)), limestone, opts.stress);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < opts.stress; i++) {
      p.set((rng() - 0.5) * 300, 0.2, (rng() - 0.5) * 300);
      q.setFromEuler(new THREE.Euler(rng() * 6, rng() * 6, rng() * 6));
      const k = 0.5 + rng() * 1.5;
      s.set(k, k, k);
      inst.setMatrixAt(i, m.compose(p, q, s));
    }
    inst.castShadow = inst.receiveShadow = true;
    scene.add(inst);
  }

  return {
    update() {
      for (const d of dynamics) {
        const t = d.body.translation();
        const r = d.body.rotation();
        d.mesh.position.set(t.x, t.y, t.z);
        d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }
    },
    dropObjects,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

function makeGridTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b59d76';
  g.fillRect(0, 0, size, size);
  // Subtle noise so the ground doesn't look like flat plastic.
  const rng = mulberry32(42);
  for (let i = 0; i < 2500; i++) {
    const v = 150 + Math.floor(rng() * 50);
    g.fillStyle = `rgba(${v},${v - 20},${v - 50},0.35)`;
    g.fillRect(rng() * size, rng() * size, 2, 2);
  }
  g.strokeStyle = 'rgba(80,60,35,0.25)';
  g.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * size + 0.5;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, size);
    g.moveTo(0, x);
    g.lineTo(size, x);
    g.stroke();
  }
  g.strokeStyle = 'rgba(70,45,20,0.6)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Small seeded PRNG so procedural content is identical every run (and in screenshots). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
