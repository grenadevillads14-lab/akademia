import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mulberry32 } from '../procgen/rng';
import { moonDirection, sunDirection, type WorldClock } from './clock';
import type { WorldUniforms } from './uniforms';

/**
 * Sky, sun, moon, stars, ambient light and fog, all driven by the world clock.
 * Colour keys are tuned for "warm Mediterranean light": cool dawn, amber golden hour, violet dusk.
 */
export interface SkySystem {
  readonly sun: THREE.DirectionalLight;
  readonly sunDir: THREE.Vector3;
  update(clock: WorldClock, camera: THREE.Camera, focus: THREE.Vector3, dt: number): void;
  /** Extra fog multiplier from zones (plane canopy, river mist). */
  fogBoost: number;
  /** Scales hemisphere light (lower it when an environment map supplies ambient light). */
  ambientScale: number;
  /** 0..1 overcast amount (weather). */
  overcast: number;
  /** Current fog colour/density and sun colour, for the post-processing atmosphere. */
  readonly fogColor: THREE.Color;
  fogDensity: number;
  readonly sunColor: THREE.Color;
  /** The sky dome (shared with the environment-map capture). */
  readonly skyMesh: THREE.Mesh;
  dispose(): void;
}

interface Key {
  el: number; // sun elevation in degrees
  sun: THREE.Color;
  sunI: number;
  sky: THREE.Color; // hemisphere sky
  ground: THREE.Color;
  hemiI: number;
  fog: THREE.Color;
  exposure: number;
}

const C = (hex: number) => new THREE.Color(hex);
// Ordered by elevation. Interpolated linearly between neighbours.
const KEYS: Key[] = [
  { el: -18, sun: C(0x000000), sunI: 0, sky: C(0x1b2440), ground: C(0x0c0d12), hemiI: 0.35, fog: C(0x0d1220), exposure: 1.25 },
  { el: -6, sun: C(0x000000), sunI: 0, sky: C(0x3a3f6e), ground: C(0x1a1620), hemiI: 0.45, fog: C(0x2a2c4a), exposure: 1.15 },
  { el: -1, sun: C(0xff6a3a), sunI: 0.3, sky: C(0x7b6a9a), ground: C(0x3a2c2a), hemiI: 0.6, fog: C(0x8a6f86), exposure: 1.0 },
  { el: 4, sun: C(0xff8c4a), sunI: 2.0, sky: C(0xd9a07a), ground: C(0x5a4030), hemiI: 0.8, fog: C(0xe0a982), exposure: 1.0 },
  { el: 12, sun: C(0xffb36b), sunI: 3.5, sky: C(0xb9c6d4), ground: C(0x7a6040), hemiI: 1.0, fog: C(0xe6caa4), exposure: 0.98 },
  { el: 30, sun: C(0xffe2b8), sunI: 3.9, sky: C(0xb4c6d6), ground: C(0x8a7350), hemiI: 1.1, fog: C(0xcdd6da), exposure: 0.92 },
  { el: 90, sun: C(0xfff2dc), sunI: 4.1, sky: C(0xaac2dc), ground: C(0x8a7a5a), hemiI: 1.15, fog: C(0xc8d6e0), exposure: 0.9 },
];

function sampleKeys(el: number, out: Key): Key {
  let a = KEYS[0]!;
  let b = KEYS[KEYS.length - 1]!;
  if (el <= a.el) b = a;
  else if (el >= b.el) a = b;
  else {
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (el >= KEYS[i]!.el && el <= KEYS[i + 1]!.el) {
        a = KEYS[i]!;
        b = KEYS[i + 1]!;
        break;
      }
    }
  }
  const t = a === b ? 0 : (el - a.el) / (b.el - a.el);
  out.sun.copy(a.sun).lerp(b.sun, t);
  out.sky.copy(a.sky).lerp(b.sky, t);
  out.ground.copy(a.ground).lerp(b.ground, t);
  out.fog.copy(a.fog).lerp(b.fog, t);
  out.sunI = a.sunI + (b.sunI - a.sunI) * t;
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * t;
  out.exposure = a.exposure + (b.exposure - a.exposure) * t;
  out.el = el;
  return out;
}

export function createSky(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  uniforms: WorldUniforms,
  opts: { shadowMapSize: number; shadows: boolean },
): SkySystem {
  const sky = new Sky();
  sky.scale.setScalar(8000);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  const su = sky.material.uniforms;
  su.turbidity!.value = 4.2; // Attic summer haze
  su.rayleigh!.value = 1.6;
  su.mieCoefficient!.value = 0.006;
  su.mieDirectionalG!.value = 0.82;
  su.cloudCoverage!.value = 0.22;
  su.cloudDensity!.value = 0.35;
  su.cloudElevation!.value = 0.55;
  scene.add(sky);

  // Stars: fixed random field on a sphere, faded in at night.
  const rng = mulberry32(343);
  const starCount = 1800;
  const starPos = new Float32Array(starCount * 3);
  const starSize = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const u = rng() * 2 - 1;
    const th = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    starPos[i * 3] = r * Math.cos(th) * 3500;
    starPos[i * 3 + 1] = Math.abs(u) * 3500; // upper hemisphere only
    starPos[i * 3 + 2] = r * Math.sin(th) * 3500;
    starSize[i] = 1 + Math.pow(rng(), 6) * 3.5;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('size', new THREE.BufferAttribute(starSize, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uTime: uniforms.time },
    vertexShader: `attribute float size; varying float vTw; uniform float uTime;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
      vTw = 0.75 + 0.25*sin(uTime*2.0 + position.x*0.37 + position.z*0.11);
      gl_PointSize = size; }`,
    fragmentShader: `uniform float uOpacity; varying float vTw;
      void main(){ vec2 c = gl_PointCoord-0.5; float d = dot(c,c); if(d>0.25) discard;
      gl_FragColor = vec4(vec3(1.0,0.97,0.9), uOpacity * vTw * smoothstep(0.25,0.0,d)); }`,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  scene.add(stars);

  // Moon: a soft disc sprite.
  const moonCanvas = document.createElement('canvas');
  moonCanvas.width = moonCanvas.height = 128;
  const g = moonCanvas.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  grad.addColorStop(0, 'rgba(250,246,230,1)');
  grad.addColorStop(0.45, 'rgba(236,230,210,1)');
  grad.addColorStop(0.5, 'rgba(220,214,200,0.25)');
  grad.addColorStop(1, 'rgba(200,200,220,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(160,156,150,0.35)';
  for (const [x, y, r] of [[52, 50, 9], [74, 70, 7], [60, 78, 5], [80, 48, 4]] as const) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const moonTex = new THREE.CanvasTexture(moonCanvas);
  moonTex.colorSpace = THREE.SRGBColorSpace;
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true }));
  moon.scale.setScalar(160);
  moon.renderOrder = -8;
  scene.add(moon);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = opts.shadows;
  sun.shadow.mapSize.set(opts.shadowMapSize, opts.shadowMapSize);
  const span = 70;
  sun.shadow.camera.left = -span;
  sun.shadow.camera.right = span;
  sun.shadow.camera.top = span;
  sun.shadow.camera.bottom = -span;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  const moonLight = new THREE.DirectionalLight(0x8fa6d8, 0);
  scene.add(moonLight);
  scene.add(moonLight.target);

  scene.fog = new THREE.FogExp2(0xcdd6da, 0.0016);

  const key: Key = { el: 0, sun: new THREE.Color(), sunI: 0, sky: new THREE.Color(), ground: new THREE.Color(), hemiI: 0, fog: new THREE.Color(), exposure: 1 };
  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const grey = new THREE.Color(0x9aa0a6);

  const system: SkySystem = {
    sun,
    sunDir,
    fogBoost: 1,
    ambientScale: 1,
    overcast: 0,
    fogColor: new THREE.Color(),
    fogDensity: 0.0016,
    sunColor: new THREE.Color(),
    skyMesh: sky,
    update(clock, camera, focus, _dt) {
      const [sx, sy, sz] = sunDirection(clock.hours, clock.dayOfYear);
      sunDir.set(sx, sy, sz);
      const [mx, my, mz] = moonDirection(clock.hours, clock.dayOfYear);
      moonDir.set(mx, my, mz);
      const el = (Math.asin(sy) * 180) / Math.PI;
      sampleKeys(el, key);

      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
      su.sunPosition!.value.copy(sunDir).multiplyScalar(450000);
      su.time!.value = uniforms.time.value;
      su.cloudCoverage!.value = 0.22 + system.overcast * 0.6;
      su.turbidity!.value = 4.2 + system.overcast * 6;

      const nightness = THREE.MathUtils.smoothstep(-el, -2, 12);
      uniforms.night.value = nightness;
      starMat.uniforms.uOpacity!.value = THREE.MathUtils.smoothstep(-el, 4, 14) * (1 - system.overcast);

      moon.position.copy(camera.position).addScaledVector(moonDir, 3400);
      moon.visible = moonDir.y > -0.05;
      (moon.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.smoothstep(-el, -4, 6) * 0.95;

      // Sun light follows the focus (player); shadow frustum snapped to texels to avoid shimmering.
      const texel = (span * 2) / sun.shadow.mapSize.x;
      const fx = Math.round(focus.x / texel) * texel;
      const fz = Math.round(focus.z / texel) * texel;
      const lightUp = Math.max(sunDir.y, 0.08);
      tmp.set(sunDir.x, lightUp, sunDir.z).normalize();
      sun.position.set(fx + tmp.x * 200, focus.y + tmp.y * 200, fz + tmp.z * 200);
      sun.target.position.set(fx, focus.y, fz);
      const overcastDim = 1 - system.overcast * 0.75;
      sun.color.copy(key.sun);
      sun.intensity = key.sunI * overcastDim;
      sun.castShadow = opts.shadows && key.sunI > 0.05;

      moonLight.position.copy(focus).addScaledVector(moonDir, 200);
      moonLight.target.position.copy(focus);
      moonLight.intensity = moonDir.y > 0 ? nightness * 0.55 : 0;

      hemi.color.copy(key.sky).lerp(grey, system.overcast * 0.5);
      hemi.groundColor.copy(key.ground);
      hemi.intensity = key.hemiI * (1 + system.overcast * 0.2) * system.ambientScale;

      system.fogColor.copy(key.fog).lerp(grey, system.overcast * 0.6);
      system.fogDensity = (0.0011 + system.overcast * 0.0025) * system.fogBoost;
      system.sunColor.copy(key.sun).multiplyScalar(key.sunI / 3);
      const fog = scene.fog as THREE.FogExp2 | null;
      if (fog) {
        fog.color.copy(system.fogColor);
        fog.density = system.fogDensity;
      }
      renderer.toneMappingExposure = key.exposure;
    },
    dispose() {
      for (const o of [sky, stars, moon, hemi, sun, sun.target, moonLight, moonLight.target]) scene.remove(o);
      scene.fog = null;
      sky.geometry.dispose();
      sky.material.dispose();
      starGeo.dispose();
      starMat.dispose();
      moonTex.dispose();
      moon.material.dispose();
    },
  };
  return system;
}
