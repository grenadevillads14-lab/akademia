import * as THREE from 'three';
import { fbm, ridged, smoothstep } from '../procgen/noise';
import { mulberry32, range } from '../procgen/rng';
import type { MaterialLib } from '../render/materialLib';
import type { Layout } from './layout';

/**
 * Far scenery (never reachable): a plain extending to the horizon, the mountain ring of Attica,
 * Lycabettus, the Acropolis with the Parthenon, and the city's roofscape between the walls and the rock.
 * Built coarse; atmospheric haze in the post pipeline does the heavy lifting.
 */
export async function buildBackdrop(layout: Layout, lib: MaterialLib, baseAt: (x: number, z: number) => number): Promise<THREE.Group> {
  const g = new THREE.Group();
  g.name = 'backdrop';
  const bd = layout.backdrop;
  const b = layout.bounds;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;

  const dryMat = await lib.material('dry_ground_01', { metres: 60, tint: 0xb8a78a });
  const rockMat = await lib.material('rock_face', { metres: 90, tint: 0xc8bba6, normalScale: 1.5 });

  // 1. Far plain: a big disc with a hole the size of the playable terrain, gently undulating.
  {
    const R = 9000;
    const seg = 160;
    const geo = new THREE.PlaneGeometry(R * 2, R * 2, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx;
      const z = pos.getZ(i) + cz;
      const inside = x > b.minX + 130 && x < b.maxX - 130 && z > b.minZ + 130 && z < b.maxZ - 130;
      const edgeDist = Math.max(b.minX - x, x - b.maxX, b.minZ - z, z - b.maxZ, 0);
      const roll = fbm(x * 0.0008, z * 0.0008, 3, 77) * 14 * smoothstep(0, 1500, edgeDist);
      pos.setXYZ(i, x, inside ? -30 : baseAt(THREE.MathUtils.clamp(x, b.minX, b.maxX), THREE.MathUtils.clamp(z, b.minZ, b.maxZ)) - 0.8 + roll, z);
    }
    geo.computeVertexNormals();
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), -pos.getZ(i));
    const plain = new THREE.Mesh(geo, dryMat);
    plain.receiveShadow = false;
    plain.name = 'far-plain';
    g.add(plain);
  }

  // 2. Mountain ranges: ridge strips with ridged-noise crests.
  if (bd) {
    for (const r of bd.ranges) {
      const along = 90;
      const across = 18;
      const pts = r.points;
      const total = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0);
      const pos: number[] = [];
      const uvs: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i <= along; i++) {
        // Point and tangent along the polyline.
        let s = (i / along) * total;
        let k = 0;
        while (k < pts.length - 2 && s > Math.hypot(pts[k + 1]![0] - pts[k]![0], pts[k + 1]![1] - pts[k]![1])) {
          s -= Math.hypot(pts[k + 1]![0] - pts[k]![0], pts[k + 1]![1] - pts[k]![1]);
          k++;
        }
        const a = pts[k]!;
        const c = pts[k + 1]!;
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
        const tx = (c[0] - a[0]) / len;
        const tz = (c[1] - a[1]) / len;
        const px = a[0] + tx * s;
        const pz = a[1] + tz * s;
        const endFade = smoothstep(0, 0.12, i / along) * smoothstep(1, 0.88, i / along);
        for (let j = 0; j <= across; j++) {
          const v = (j / across) * 2 - 1;
          const x = px - tz * v * r.width;
          const z = pz + tx * v * r.width;
          const crest = 0.65 + 0.55 * ridged(x * 0.0012, z * 0.0012, 4, r.id.length);
          const prof = Math.exp(-v * v * 3.2) * (1 - Math.abs(v) * 0.15);
          const y = r.height * crest * prof * endFade - 10;
          pos.push(x, y, z);
          uvs.push(x, -z);
        }
      }
      for (let i = 0; i < along; i++) {
        for (let j = 0; j < across; j++) {
          const a0 = i * (across + 1) + j;
          const b0 = a0 + across + 1;
          idx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, rockMat);
      m.name = `range-${r.id}`;
      g.add(m);
    }

    // 3. Lycabettus: a steep, pointed limestone hill.
    if (bd.lycabettus) {
      const L = bd.lycabettus;
      const geo = new THREE.ConeGeometry(L.radius, L.height, 48, 12, true);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const t = (y + L.height / 2) / L.height;
        const n = 1 + 0.25 * fbm(x * 0.01, z * 0.01 + y * 0.01, 3, 5);
        const flare = 1 + (1 - t) * (1 - t) * 0.5;
        pos.setXYZ(i, x * n * flare, Math.pow(t, 1.35) * L.height, z * n * flare);
      }
      geo.computeVertexNormals();
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i));
      const m = new THREE.Mesh(geo, rockMat);
      m.position.set(L.x, -6, L.z);
      m.name = 'lycabettus';
      g.add(m);
    }

    // 4. The Acropolis rock and the Parthenon.
    if (bd.acropolis) {
      const A = bd.acropolis;
      const geo = new THREE.CylinderGeometry(A.radius * 0.9, A.radius * 1.25, A.height, 40, 6);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const ang = Math.atan2(z, x);
        const n = 1 + 0.12 * fbm(Math.cos(ang) * 2, y * 0.03 + Math.sin(ang) * 2, 3, 9);
        // Elongated west–east like the real rock.
        pos.setXYZ(i, x * n * 1.7, y + A.height / 2, z * n * 0.85);
      }
      geo.computeVertexNormals();
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) + pos.getZ(i), pos.getY(i));
      const rock = new THREE.Mesh(geo, rockMat);
      rock.position.set(A.x, -4, A.z);
      rock.rotation.y = 0.35;
      rock.name = 'acropolis';
      g.add(rock);

      const marble = new THREE.MeshStandardMaterial({ color: 0xe9e1d2, roughness: 0.7 });
      const temple = new THREE.Group();
      const W = 31;
      const D = 70;
      const colH = 10.4;
      temple.add(new THREE.Mesh(new THREE.BoxGeometry(W + 3, 1.6, D + 3), marble)).position.set(0, 0.8, 0);
      const col = new THREE.CylinderGeometry(0.85, 0.95, colH, 8);
      const cols = new THREE.InstancedMesh(col, marble, 46);
      const mtx = new THREE.Matrix4();
      let n = 0;
      for (let i = 0; i < 8; i++) for (const zz of [-D / 2, D / 2]) cols.setMatrixAt(n++, mtx.makeTranslation(-W / 2 + (W / 7) * i, 1.6 + colH / 2, zz));
      for (let j = 1; j < 16; j++) for (const xx of [-W / 2, W / 2]) cols.setMatrixAt(n++, mtx.makeTranslation(xx, 1.6 + colH / 2, -D / 2 + (D / 16) * j));
      cols.count = n;
      temple.add(cols);
      temple.add(new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, 3.3, D + 1.6), marble)).position.set(0, 1.6 + colH + 1.65, 0);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, (W + 2) / 2, D + 2, 3, 1), new THREE.MeshStandardMaterial({ color: 0xbfa98a, roughness: 0.8 }));
      roof.rotation.x = Math.PI / 2;
      roof.rotation.z = Math.PI;
      roof.scale.set(1, 1, 0.18);
      roof.position.y = 1.6 + colH + 3.3 + 1.7;
      temple.add(roof);
      temple.add(new THREE.Mesh(new THREE.BoxGeometry(W - 8, colH, D - 14), marble)).position.set(0, 1.6 + colH / 2, 0); // cella
      temple.position.set(A.x + 30, A.height - 4, A.z - 10);
      temple.rotation.y = 0.35;
      temple.name = 'parthenon';
      g.add(temple);
    }

    // 5. The city between the walls and the Acropolis: thousands of small houses, instanced.
    if (bd.acropolis) {
      const A = bd.acropolis;
      const rng = mulberry32(1234);
      const houseGeo = new THREE.BoxGeometry(1, 1, 1);
      houseGeo.translate(0, 0.5, 0);
      const roofGeo = new THREE.CylinderGeometry(0.01, 0.62, 1.04, 4, 1);
      roofGeo.rotateY(Math.PI / 4);
      roofGeo.scale(1, 0.22, 1);
      roofGeo.translate(0, 0.11, 0);
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xe4d9c4, roughness: 0.95 });
      const roofMat = new THREE.MeshStandardMaterial({ color: 0xa65a3a, roughness: 0.85 });
      const N = 2400;
      const houses = new THREE.InstancedMesh(houseGeo, wallMat, N);
      const roofs = new THREE.InstancedMesh(roofGeo, roofMat, N);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const col = new THREE.Color();
      let k = 0;
      for (let tries = 0; tries < N * 4 && k < N; tries++) {
        // Spread in a band from just inside the walls toward and around the Acropolis.
        const t = rng();
        const x = THREE.MathUtils.lerp(520, A.x + 500, t) + range(rng, -380, 380) * (0.4 + t);
        const z = THREE.MathUtils.lerp(640, A.z + 300, t) + range(rng, -380, 380) * (0.4 + t);
        if (x < b.maxX + 20 && z < b.maxZ + 20) continue; // the playable map has real buildings
        if (Math.hypot((x - A.x) / 1.7, z - A.z) < A.radius * 1.3) continue;
        const w = range(rng, 8, 18);
        const d = range(rng, 8, 16);
        const h = range(rng, 3.2, 6.5);
        const y = -0.5 + fbm(x * 0.0008, z * 0.0008, 2, 77) * 4;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.35 + (rng() < 0.5 ? 0 : Math.PI / 2) + range(rng, -0.1, 0.1));
        m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, d));
        houses.setMatrixAt(k, m4);
        houses.setColorAt(k, col.setHSL(0.09, 0.2 + rng() * 0.15, 0.72 + rng() * 0.12));
        m4.compose(new THREE.Vector3(x, y + h, z), q, new THREE.Vector3(w * 1.05, w * 0.9, d * 1.05));
        roofs.setMatrixAt(k, m4);
        k++;
      }
      houses.count = roofs.count = k;
      houses.name = 'city-houses-far';
      g.add(houses, roofs);
    }

    // 6. The Saronic gulf glinting to the south-west.
    if (bd.sea) {
      const sea = new THREE.Mesh(new THREE.CircleGeometry(bd.sea.radius, 48), new THREE.MeshStandardMaterial({ color: 0x3f6f86, roughness: 0.15, metalness: 0.1 }));
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(bd.sea.x, -3, bd.sea.z);
      sea.name = 'saronic-gulf';
      g.add(sea);
    }
  }
  g.traverse((o) => {
    o.castShadow = false;
    o.frustumCulled = true;
  });
  return g;
}
