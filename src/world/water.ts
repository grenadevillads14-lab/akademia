import * as THREE from 'three';
import { polylineLength, samplePolyline, type Vec2 } from '../procgen/geometry2d';
import type { Heightfield } from './heightfield';
import type { WorldUniforms } from './uniforms';

/**
 * Stylized water ribbons for the rivers and Cimon's irrigation channels.
 * Each channel is its own mesh (userData.channelId) so the waterworks puzzle can fill or drain it.
 */
export interface WaterSystem {
  readonly group: THREE.Group;
  readonly channels: Map<string, THREE.Mesh>;
  /** 0 = dry, 1 = full; animated toward the target. */
  setChannelFlow(id: string, flowing: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

function ribbon(points: readonly Vec2[], halfWidth: number, levelAt: (x: number, z: number, along: number) => number, step: number): THREE.BufferGeometry {
  const len = polylineLength(points);
  const n = Math.max(2, Math.ceil(len / step) + 1);
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const flow = new Float32Array(n * 2 * 2);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * len;
    const p = samplePolyline(points, s);
    const nx = -p.tz;
    const nz = p.tx;
    const y = levelAt(p.x, p.z, s);
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? -1 : 1;
      const k = i * 2 + side;
      pos[k * 3] = p.x + nx * halfWidth * sgn;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = p.z + nz * halfWidth * sgn;
      uv[k * 2] = side;
      uv[k * 2 + 1] = s;
      flow[k * 2] = p.tx;
      flow[k * 2 + 1] = p.tz;
    }
    if (i < n - 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function createWaterMaterial(u: WorldUniforms, opts: { deep: number; shallow: number; speed: number; foam: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.06,
    metalness: 0.0,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  const uFill = { value: 1 };
  mat.userData.fill = uFill;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.time;
    shader.uniforms.uDeep = { value: new THREE.Color(opts.deep) };
    shader.uniforms.uShallow = { value: new THREE.Color(opts.shallow) };
    shader.uniforms.uSpeed = { value: opts.speed };
    shader.uniforms.uFoam = { value: opts.foam };
    shader.uniforms.uFill = uFill;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aFlow; varying vec2 vFlow; varying vec2 vWUv; varying vec3 vWPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFlow = aFlow; vWUv = uv; vWPos = (modelMatrix * vec4(position,1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uSpeed; uniform float uFoam; uniform float uFill;
        varying vec2 vFlow; varying vec2 vWUv; varying vec3 vWPos;
        float wh(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1))) * 15731.743); }
        float wn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(wh(i),wh(i+vec2(1,0)),f.x), mix(wh(i+vec2(0,1)),wh(i+vec2(1,1)),f.x), f.y); }
        vec2 flowUv(vec2 p, float t){ return p - vFlow * t; }`)
      .replace('#include <map_fragment>', `
        if (uFill < 0.02) discard;
        float edge = abs(vWUv.x - 0.5) * 2.0; // 0 centre .. 1 bank
        vec3 base = mix(uDeep, uShallow, smoothstep(0.2, 1.0, edge));
        float foamN = wn(flowUv(vWPos.xz * 0.9, uTime * uSpeed * 1.4)) * wn(flowUv(vWPos.xz * 2.3, uTime * uSpeed * 2.0));
        float foam = smoothstep(0.75, 1.0, edge) * smoothstep(0.15, 0.4, foamN) * uFoam;
        diffuseColor.rgb = mix(base, vec3(0.92, 0.94, 0.9), foam);
        diffuseColor.a *= mix(0.75, 0.95, 1.0 - edge) * uFill;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // Two scrolling noise layers perturb the normal: ripples moving downstream.
        vec2 q1 = flowUv(vWPos.xz * 0.55, uTime * uSpeed);
        vec2 q2 = flowUv(vWPos.xz * 1.3 + 17.0, uTime * uSpeed * 1.6);
        float e = 0.08;
        float h0 = wn(q1) + 0.5 * wn(q2);
        float hx = wn(q1 + vec2(e, 0.0)) + 0.5 * wn(q2 + vec2(e, 0.0));
        float hz = wn(q1 + vec2(0.0, e)) + 0.5 * wn(q2 + vec2(0.0, e));
        vec3 wn3 = normalize(vec3((h0 - hx) * 1.6, 1.0, (h0 - hz) * 1.6));
        normal = normalize((viewMatrix * vec4(wn3, 0.0)).xyz);`);
  };
  return mat;
}

export function createWater(hf: Heightfield, u: WorldUniforms): WaterSystem {
  const group = new THREE.Group();
  group.name = 'water';
  const channels = new Map<string, THREE.Mesh>();
  const targets = new Map<string, number>();
  const riverMat = createWaterMaterial(u, { deep: 0x2f5a52, shallow: 0x5f8a6c, speed: 0.7, foam: 0.8 });
  const materials: THREE.Material[] = [riverMat];

  for (const r of hf.layout.rivers) {
    const geo = ribbon(r.points, r.width * 0.5 + 1.5, (x, z) => {
      const w = hf.water(x, z);
      return Number.isFinite(w.level) ? w.level : hf.height(x, z);
    }, 4);
    const mesh = new THREE.Mesh(geo, riverMat);
    mesh.name = `river-${r.id}`;
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  for (const c of hf.layout.channels) {
    const mat = createWaterMaterial(u, { deep: 0x3d6a5c, shallow: 0x6f9a7a, speed: 1.2, foam: 0.4 });
    materials.push(mat);
    const geo = ribbon(c.points, c.width * 0.5, (x, z) => hf.height(x, z) + c.depth * 0.6, 1.5);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `channel-${c.id}`;
    mesh.userData.channelId = c.id;
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    group.add(mesh);
    channels.set(c.id, mesh);
    targets.set(c.id, 1);
  }

  return {
    group,
    channels,
    setChannelFlow(id, flowing) {
      targets.set(id, flowing ? 1 : 0);
    },
    update(dt) {
      for (const [id, mesh] of channels) {
        const fill = (mesh.material as THREE.Material).userData.fill as { value: number };
        const target = targets.get(id) ?? 1;
        fill.value += (target - fill.value) * Math.min(1, dt * 0.8);
        mesh.visible = fill.value > 0.02;
      }
    },
    dispose() {
      for (const m of group.children) (m as THREE.Mesh).geometry.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
