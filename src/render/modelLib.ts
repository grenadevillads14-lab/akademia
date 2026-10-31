import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WIND_GLSL } from '../world/wind';
import type { WorldUniforms } from '../world/uniforms';

/**
 * Poly Haven models (public/assets/ph/game/<id>/lod{0,1}.gltf), flattened to one geometry per material
 * and drawn with InstancedMesh. `ModelField` places many instances and swaps LOD0/LOD1 by distance.
 */
export interface ModelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}
export interface ModelLods {
  id: string;
  lods: [ModelPart[], ModelPart[]];
  /** Bounding radius at scale 1. */
  radius: number;
}

const BASE = `${import.meta.env.BASE_URL}assets/ph/game/`;
const FOLIAGE = /shrub|grass|bush|rooibos|fern|plant/;

export class ModelLib {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<ModelLods>>();

  constructor(private readonly uniforms: WorldUniforms) {}

  get(id: string): Promise<ModelLods> {
    let p = this.cache.get(id);
    if (!p) {
      p = Promise.all([this.loadLod(id, 0), this.loadLod(id, 1)]).then(([a, b]) => {
        const box = new THREE.Box3();
        for (const part of a) {
          part.geometry.computeBoundingBox();
          box.union(part.geometry.boundingBox!);
        }
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        return { id, lods: [a, b], radius: sphere.radius };
      });
      this.cache.set(id, p);
    }
    return p;
  }

  private async loadLod(id: string, lod: number): Promise<ModelPart[]> {
    const gltf = await loadGltf(this.loader, `${BASE}${id}/lod${lod}.gltf`);
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      const mat = mesh.material as THREE.Material;
      const list = byMat.get(mat) ?? [];
      list.push(g);
      byMat.set(mat, list);
    });
    const parts: ModelPart[] = [];
    for (const [mat, geos] of byMat) {
      const geometry = geos.length === 1 ? geos[0]! : mergeGeometries(geos.map((g) => (g.index ? g : g)), false);
      if (!geometry) continue;
      const m = mat as THREE.MeshStandardMaterial;
      if (FOLIAGE.test(id)) this.addSway(m);
      if (m.map) m.map.anisotropy = 4;
      parts.push({ geometry, material: m });
    }
    return parts;
  }

  /** Foliage sways with the global wind (bottom anchored, top moves most). */
  private addSway(m: THREE.MeshStandardMaterial): void {
    if (m.userData.sway) return;
    m.userData.sway = true;
    m.side = THREE.DoubleSide;
    const u = this.uniforms;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.time;
      shader.uniforms.uWindDir = u.windDir;
      shader.uniforms.uWindStrength = u.windStrength;
      shader.uniforms.uGust = u.gust;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${WIND_GLSL}`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
             vec3 iw = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
           #else
             vec3 iw = vec3(0.0);
           #endif
           float hgt = clamp(position.y / 1.2, 0.0, 1.0);
           transformed.xz += windSway(iw + position, hgt, 2.2) * 0.5;`,
        );
    };
  }
}

export interface Placement {
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  /** Optional tilt (rocks). */
  tilt?: number;
}

/** Many instances of several models with distance-based LOD. One InstancedMesh per (model, lod, part). */
export class ModelField {
  readonly group = new THREE.Group();
  private readonly entries: { model: ModelLods; items: Placement[]; meshes: [THREE.InstancedMesh[], THREE.InstancedMesh[]]; matrices: THREE.Matrix4[] }[] = [];
  private timer = 0;
  private readonly cam = new THREE.Vector3();

  constructor(
    private readonly lodDistance: number,
    private readonly maxDistance: number,
    private readonly shadows: boolean,
  ) {
    this.group.name = 'model-field';
  }

  add(model: ModelLods, items: Placement[], castShadow = true): void {
    if (items.length === 0) return;
    const matrices = items.map((p) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.tilt ?? 0, p.rot, (p.tilt ?? 0) * 0.6));
      return new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale));
    });
    const meshes: [THREE.InstancedMesh[], THREE.InstancedMesh[]] = [[], []];
    for (const lod of [0, 1] as const) {
      for (const part of model.lods[lod]) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, items.length);
        im.castShadow = this.shadows && castShadow && lod === 0;
        im.receiveShadow = true;
        im.count = 0;
        im.frustumCulled = false;
        im.name = `${model.id}-lod${lod}`;
        meshes[lod].push(im);
        this.group.add(im);
      }
    }
    this.entries.push({ model, items, meshes, matrices });
  }

  /** Rebucket instances by camera distance a few times per second. */
  update(camera: THREE.Camera, dt: number, force = false): void {
    this.timer -= dt;
    if (this.timer > 0 && !force) return;
    this.timer = 0.25;
    camera.getWorldPosition(this.cam);
    for (const e of this.entries) {
      const counts = [0, 0];
      for (let i = 0; i < e.items.length; i++) {
        const p = e.items[i]!;
        const d = Math.hypot(p.x - this.cam.x, p.y - this.cam.y, p.z - this.cam.z) / Math.max(0.5, p.scale);
        if (d > this.maxDistance) continue;
        const lod = d < this.lodDistance ? 0 : 1;
        const idx = counts[lod]!++;
        for (const im of e.meshes[lod]) im.setMatrixAt(idx, e.matrices[i]!);
      }
      for (const lod of [0, 1] as const) {
        for (const im of e.meshes[lod]) {
          im.count = counts[lod]!;
          im.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }

  dispose(): void {
    for (const e of this.entries) for (const l of e.meshes) for (const im of l) im.dispose();
  }
}

/**
 * Load a glTF. The hosted build embeds buffers as base64 data URIs (the artifact host serves no .bin files),
 * and its content policy blocks fetching data: URLs, so such files are decoded here and handed to the loader
 * as an in-memory GLB.
 */
async function loadGltf(loader: GLTFLoader, url: string): Promise<{ scene: THREE.Group }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}: ${res.status}`);
  const json = (await res.json()) as { buffers?: { uri?: string; byteLength: number }[]; bufferViews?: { buffer: number; byteOffset?: number }[] };
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  const buffers = json.buffers ?? [];
  if (!buffers.some((b) => b.uri?.startsWith('data:'))) return loader.parseAsync(JSON.stringify(json), base);
  // Concatenate every buffer into one binary chunk (4-byte aligned) and rebase the buffer views.
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let total = 0;
  for (const b of buffers) {
    if (!b.uri?.startsWith('data:')) throw new Error(`Mixed external and embedded buffers in ${url}`);
    const bin = atob(b.uri.slice(b.uri.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    offsets.push(total);
    parts.push(bytes);
    total += Math.ceil(bytes.length / 4) * 4;
  }
  for (const v of json.bufferViews ?? []) {
    v.byteOffset = (v.byteOffset ?? 0) + offsets[v.buffer]!;
    v.buffer = 0;
  }
  json.buffers = [{ byteLength: total }];
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const jsonBytes = new TextEncoder().encode(text);
  const glb = new ArrayBuffer(12 + 8 + jsonBytes.length + 8 + total);
  const dv = new DataView(glb);
  const u8 = new Uint8Array(glb);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, glb.byteLength, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  u8.set(jsonBytes, 20);
  const binStart = 20 + jsonBytes.length;
  dv.setUint32(binStart, total, true);
  dv.setUint32(binStart + 4, 0x004e4942, true); // 'BIN\0'
  parts.forEach((p, i) => u8.set(p, binStart + 8 + offsets[i]!));
  return loader.parseAsync(glb, base);
}
