import * as THREE from 'three';
import { fbmTile } from '../procgen/noise';

/**
 * Lit cumulus clouds: a dome shader that intersects a cloud sheet 2 km up, shapes density from layered tiling
 * noise, and shadows each point by sampling toward the sun across the sheet (Beer–Lambert), so clouds get bright
 * edges, grey bellies and a silver lining against the sun. Replaces the flat clouds of the sky
 * shader. Drawn without depth writes, so the post pipeline still treats it as sky (haze, aerial perspective).
 */
export interface Clouds {
  readonly mesh: THREE.Mesh;
  update(camera: THREE.Camera, sunDir: THREE.Vector3, sunColor: THREE.Color, skyColor: THREE.Color, time: number, coverage: number, night: number): void;
  dispose(): void;
}

function noiseTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      data[i] = Math.round(THREE.MathUtils.clamp(fbmTile(u * 4, v * 4, 4, 5, 11) * 0.5 + 0.5, 0, 1) * 255);
      data[i + 1] = Math.round(THREE.MathUtils.clamp(fbmTile(u * 8, v * 8, 8, 4, 23) * 0.5 + 0.5, 0, 1) * 255);
      data[i + 2] = Math.round(THREE.MathUtils.clamp(fbmTile(u * 16, v * 16, 16, 3, 37) * 0.5 + 0.5, 0, 1) * 255);
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export function createClouds(): Clouds {
  const tex = noiseTexture();
  const uniforms = {
    uNoise: { value: tex },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSkyColor: { value: new THREE.Color(0.6, 0.7, 0.85) },
    uTime: { value: 0 },
    uCoverage: { value: 0.35 },
    uNight: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // on the far plane
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoise;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyColor;
      uniform float uTime;
      uniform float uCoverage;
      uniform float uNight;
      uniform vec3 uCamPos;
      varying vec3 vDir;
      const float H = 2000.0;
      float density(vec2 xz) {
        vec2 w = vec2(uTime * 7.0, uTime * 2.5);
        vec2 q = (xz + w) / 7000.0;
        float base = texture2D(uNoise, q).r;
        float detail = texture2D(uNoise, q * 3.3 + 0.37).g * 0.5 + texture2D(uNoise, q * 9.1 + 0.71).b * 0.28;
        float d = base * 1.1 + detail * 0.55 - (1.2 - uCoverage);
        return clamp(d * 2.6, 0.0, 1.0);
      }
      void main() {
        vec3 rd = normalize(vDir);
        if (rd.y < 0.012) discard;
        float t = (H - uCamPos.y) / rd.y;
        vec2 p = uCamPos.xz + rd.xz * t;
        float d = density(p);
        if (d < 0.01) discard;
        // Self-shadowing: march a little toward the sun across the sheet (bellies grey, tops bright).
        vec2 sd = normalize(uSunDir.xz + 1e-4) * (1.0 - clamp(uSunDir.y, 0.0, 0.95));
        float occ = density(p + sd * 180.0) * 0.5 + density(p + sd * 420.0) * 0.35 + density(p + sd * 800.0) * 0.25;
        float lightT = exp(-occ * 2.4 - d * 1.2);
        float cosA = dot(rd, uSunDir);
        float silver = pow(max(cosA, 0.0), 10.0) * (1.0 - d) * 2.5;
        vec3 ambient = mix(uSkyColor * 0.85, vec3(0.78, 0.8, 0.84), 0.35) * (1.0 - uNight * 0.85);
        vec3 col = ambient * (0.62 + 0.25 * (1.0 - d)) + uSunColor * (lightT * 1.25 + silver) * (1.0 - uNight);
        float alpha = smoothstep(0.0, 0.55, d) * 0.95;
        // Distant clouds melt into the horizon haze.
        alpha *= smoothstep(0.012, 0.09, rd.y);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), mat);
  mesh.name = 'clouds';
  mesh.frustumCulled = false;
  mesh.renderOrder = -9;
  return {
    mesh,
    update(camera, sunDir, sunColor, skyColor, time, coverage, night) {
      mesh.position.copy(camera.position);
      uniforms.uCamPos.value.copy(camera.position);
      uniforms.uSunDir.value.copy(sunDir);
      uniforms.uSunColor.value.copy(sunColor);
      uniforms.uSkyColor.value.copy(skyColor);
      uniforms.uTime.value = time;
      uniforms.uCoverage.value = coverage;
      uniforms.uNight.value = night;
    },
    dispose() {
      tex.dispose();
      mat.dispose();
      mesh.geometry.dispose();
    },
  };
}
