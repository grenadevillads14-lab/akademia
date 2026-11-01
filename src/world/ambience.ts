import * as THREE from 'three';
import { mulberry32, range } from '../procgen/rng';
import type { Heightfield } from './heightfield';
import type { WorldUniforms } from './uniforms';

/**
 * The small living things that make the grove feel enchanted rather than empty:
 *  - motes: pollen, seed fluff and dust drifting in the air around the camera, glinting when they are between
 *    the eye and the sun (forward scattering); after dusk in summer they become fireflies (Lampyris);
 *  - butterflies over the meadows: cabbage whites, Cleopatra brimstones, painted ladies, common blues;
 *  - swallows and swifts wheeling high over the precinct by day.
 * Three draw calls. Butterflies and birds are animated on the CPU (a few dozen matrices).
 */
export interface Ambience {
  readonly group: THREE.Group;
  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3, sunDir: THREE.Vector3, night: number, season: number): void;
  dispose(): void;
}

const MOTE_BOX = 34;

function motes(count: number): { points: THREE.Points; uniforms: Record<string, THREE.IUniform> } {
  const rng = mulberry32(31);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rng() * MOTE_BOX;
    pos[i * 3 + 1] = Math.pow(rng(), 1.6) * 9; // most near the ground
    pos[i * 3 + 2] = rng() * MOTE_BOX;
    seed[i] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = {
    uCam: { value: new THREE.Vector3() },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.6, -0.4) },
    uNight: { value: 0 },
    uSummer: { value: 1 },
    uGround: { value: 0 },
    uPx: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform vec3 uCam; uniform vec3 uSun; uniform float uTime; uniform vec2 uWind; uniform float uNight; uniform float uGround; uniform float uPx;
      varying float vGlow; varying float vSeed; varying float vFade;
      void main() {
        // Drift with the wind plus a slow personal wander; wrap in a box that follows the camera.
        vec3 p = position;
        float t = uTime;
        p.xz += uWind * t * (0.35 + aSeed * 0.5) + vec2(sin(t * 0.3 + aSeed * 40.0), cos(t * 0.23 + aSeed * 17.0)) * 1.2;
        p.y += sin(t * 0.4 + aSeed * 23.0) * 0.6;
        vec3 base = uCam - vec3(${(MOTE_BOX / 2).toFixed(1)});
        p.xz = base.xz + mod(p.xz - base.xz, ${MOTE_BOX.toFixed(1)});
        p.y = uGround + p.y + (uNight > 0.5 ? 0.0 : 0.3);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        vec3 view = normalize(p - uCam);
        // Forward scattering: motes light up when they lie toward the sun.
        float fs = pow(max(dot(view, uSun), 0.0), 8.0);
        vGlow = mix(0.05 + fs * 2.5, 1.0, uNight);
        vSeed = aSeed;
        vFade = smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(${(MOTE_BOX * 0.35).toFixed(1)}, ${(MOTE_BOX * 0.5).toFixed(1)}, d));
        gl_PointSize = clamp((uNight > 0.5 ? 0.06 : 0.035 + aSeed * 0.03) * uPx / d, 1.0, 9.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uNight; uniform float uSummer;
      varying float vGlow; varying float vSeed; varying float vFade;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = dot(c, c) * 4.0;
        float a = exp(-r * 3.0);
        vec3 day = mix(vec3(1.0, 0.92, 0.7), vec3(1.0, 1.0, 0.95), vSeed);
        // Fireflies blink in their own rhythm; only some of the motes are fireflies.
        float blink = smoothstep(0.55, 1.0, sin(uTime * (1.3 + vSeed) + vSeed * 50.0)) * step(0.55, vSeed) * uSummer;
        vec3 col = mix(day * vGlow * 0.5, vec3(0.75, 1.0, 0.3) * blink * 3.0, uNight);
        gl_FragColor = vec4(col * a * vFade, 1.0);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'motes';
  points.renderOrder = 5;
  return { points, uniforms };
}

function wingAtlas(): THREE.CanvasTexture {
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = S * 4;
  cv.height = S;
  const g = cv.getContext('2d')!;
  // One right wing per cell (fore + hind), hinge on the left edge.
  const wing = (i: number, fore: string, hind: string, tip: string | null, spots: string | null) => {
    const x = i * S;
    g.fillStyle = hind;
    g.beginPath();
    g.ellipse(x + S * 0.3, S * 0.68, S * 0.26, S * 0.2, 0.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = fore;
    g.beginPath();
    g.moveTo(x + 2, S * 0.5);
    g.quadraticCurveTo(x + S * 0.4, S * 0.02, x + S * 0.95, S * 0.12);
    g.quadraticCurveTo(x + S * 0.75, S * 0.5, x + 2, S * 0.56);
    g.fill();
    if (tip) {
      g.fillStyle = tip;
      g.beginPath();
      g.ellipse(x + S * 0.82, S * 0.17, S * 0.13, S * 0.07, -0.2, 0, Math.PI * 2);
      g.fill();
    }
    if (spots) {
      g.fillStyle = spots;
      for (const [sx, sy] of [[0.5, 0.25], [0.62, 0.32], [0.3, 0.7]]) {
        g.beginPath();
        g.arc(x + S * sx!, S * sy!, S * 0.04, 0, Math.PI * 2);
        g.fill();
      }
    }
  };
  wing(0, '#f4f2ea', '#efece2', '#3a3a3a', '#3a3a3a'); // cabbage white
  wing(1, '#f0e04a', '#e8d84a', '#e8902a', null); // Cleopatra
  wing(2, '#e08a3a', '#d8803a', '#2a2018', '#f2efe6'); // painted lady
  wing(3, '#6f8fe0', '#7b98e4', '#c8d4f4', null); // common blue
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Fly {
  cx: number;
  cz: number;
  phase: number;
  speed: number;
  cell: number;
  x: number;
  z: number;
}

export function createAmbience(hf: Heightfield, u: WorldUniforms, opts: { motes: number; butterflies: number; birds: number }): Ambience {
  const group = new THREE.Group();
  group.name = 'ambience';
  const m = motes(opts.motes);
  group.add(m.points);

  // Butterflies: two wing quads hinged on the body axis (local z), flapped on the CPU.
  const wingGeo = new THREE.BufferGeometry();
  {
    // Right wing (x > 0) and left wing (x < 0), each in its own cell window chosen per instance.
    const P = [0, 0, -0.5, 1, 0, -0.5, 1, 0, 0.5, 0, 0, 0.5, 0, 0, -0.5, -1, 0, -0.5, -1, 0, 0.5, 0, 0, 0.5];
    const UV = [0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0];
    const SIDE = [1, 1, 1, 1, -1, -1, -1, -1];
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    wingGeo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    wingGeo.setAttribute('aSide', new THREE.Float32BufferAttribute(SIDE, 1));
    wingGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
    wingGeo.computeVertexNormals();
  }
  const flyCount = opts.butterflies;
  const flyAttr = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, flyCount) * 2), 2); // cell, flap phase
  wingGeo.setAttribute('aFly', flyAttr);
  const wingMat = new THREE.MeshStandardMaterial({ map: wingAtlas(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 });
  const uFlyTime = { value: 0 };
  wingMat.onBeforeCompile = (sh) => {
    sh.uniforms.uFlyTime = uFlyTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSide; attribute vec2 aFly; uniform float uFlyTime;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vec2((aFly.x + vMapUv.x) / 4.0, vMapUv.y);')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // Flap: rotate each wing about the body axis (z). Fast beats with glides.
        float beat = sin(uFlyTime * 22.0 + aFly.y) * (0.6 + 0.4 * sin(uFlyTime * 1.3 + aFly.y));
        float ang = 0.25 + beat * 1.0;
        float r = abs(transformed.x);
        transformed.x = aSide * r * cos(ang);
        transformed.y = r * sin(ang);`,
      );
  };
  wingMat.customProgramCacheKey = () => 'butterfly';
  const flies = new THREE.InstancedMesh(wingGeo, wingMat, Math.max(1, flyCount));
  flies.frustumCulled = false;
  flies.count = flyCount;
  flies.name = 'butterflies';
  group.add(flies);
  const rng = mulberry32(77);
  const flyState: Fly[] = [];
  for (let i = 0; i < flyCount; i++) {
    const cell = rng() < 0.4 ? 0 : rng() < 0.5 ? 1 : rng() < 0.6 ? 2 : 3;
    flyState.push({ cx: 0, cz: 0, phase: rng() * 100, speed: range(rng, 0.5, 1.1), cell, x: 0, z: 0 });
    flyAttr.setXY(i, cell, rng() * 6.28);
  }
  let flyInit = false;

  // Birds: a loose flock of swallows (dark, forked) high over the focus.
  const birdGeo = new THREE.BufferGeometry();
  {
    // Body along -z (forward), swept wings, forked tail. The wing tips sit above the body, so scaling y by the
    // flap (−1..1) beats the wings up and down.
    const P = [0, 0, -0.1, 0.05, 0, 0.05, -0.05, 0, 0.05, 0.03, 0, -0.02, 0.32, 0.15, 0.1, 0.12, 0.04, 0.06, -0.03, 0, -0.02, -0.32, 0.15, 0.1, -0.12, 0.04, 0.06, 0, 0, 0.05, 0.06, 0, 0.2, -0.06, 0, 0.2];
    birdGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    birdGeo.setIndex([0, 2, 1, 3, 5, 4, 6, 7, 8, 9, 11, 10]);
    birdGeo.computeVertexNormals();
  }
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x1c1a1e, side: THREE.DoubleSide });
  const birds = new THREE.InstancedMesh(birdGeo, birdMat, Math.max(1, opts.birds));
  birds.count = opts.birds;
  birds.frustumCulled = false;
  birds.name = 'swallows';
  group.add(birds);
  const birdPhase = Array.from({ length: opts.birds }, () => [rng() * 6.28, range(rng, 22, 55), range(rng, 25, 45), range(rng, 0.25, 0.45), rng() < 0.5 ? 1 : -1] as const);

  const mat4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  let t = 0;
  const birdCenter = new THREE.Vector3();

  return {
    group,
    update(dt, camera, focus, sunDir, night, season) {
      t += dt;
      camera.getWorldPosition(camPos);
      const mu = m.uniforms;
      mu.uCam!.value.copy(camPos);
      mu.uSun!.value.copy(sunDir);
      mu.uTime!.value = t;
      mu.uWind!.value.copy(u.windDir.value).multiplyScalar(0.3 + u.windStrength.value);
      mu.uNight!.value = THREE.MathUtils.smoothstep(night, 0.55, 0.85);
      mu.uSummer!.value = season;
      mu.uGround!.value = hf.height(camPos.x, camPos.z);
      const persp = camera as THREE.PerspectiveCamera;
      mu.uPx!.value = (window.innerHeight * Math.min(2, window.devicePixelRatio)) / (2 * Math.tan(((persp.fov ?? 60) * Math.PI) / 360));
      m.points.visible = night < 0.5 || season > 0.2;

      // Butterflies: only by day, in the warm months, over grass.
      uFlyTime.value = t;
      const day = night < 0.3 && sunDir.y > 0.1;
      flies.visible = day && season > 0.15;
      if (flies.visible) {
        for (let i = 0; i < flyCount; i++) {
          const f = flyState[i]!;
          // Re-home butterflies that fell far behind the player (or on first use) to a grassy spot nearby.
          if (!flyInit || Math.hypot(f.cx - focus.x, f.cz - focus.z) > 28) {
            for (let k = 0; k < 6; k++) {
              const a = rng() * Math.PI * 2;
              const r = range(rng, 4, 24);
              f.cx = focus.x + Math.cos(a) * r;
              f.cz = focus.z + Math.sin(a) * r;
              if (hf.grassDensity(f.cx, f.cz) > 0.4) break;
            }
          }
          const ph = f.phase + t * f.speed * 0.5;
          // Erratic wander around the home spot.
          const x = f.cx + Math.sin(ph * 1.3) * 2.2 + Math.sin(ph * 3.1) * 0.6;
          const z = f.cz + Math.cos(ph * 0.9) * 2.2 + Math.sin(ph * 2.3 + 1) * 0.6;
          const y = hf.height(x, z) + 0.45 + Math.sin(ph * 2.7) * 0.25 + Math.max(0, Math.sin(ph * 0.7)) * 0.6;
          const heading = Math.atan2(x - f.x, z - f.z);
          f.x = x;
          f.z = z;
          pos.set(x, y, z);
          e.set(Math.sin(ph * 4) * 0.2, heading, 0);
          q.setFromEuler(e);
          sc.setScalar(0.055);
          mat4.compose(pos, q, sc);
          flies.setMatrixAt(i, mat4);
        }
        flyInit = true;
        flies.instanceMatrix.needsUpdate = true;
      }

      // Swallows: wide circles that drift with the focus, swooping up and down, wings beating in bursts.
      birds.visible = day;
      if (birds.visible) {
        birdCenter.lerp(focus, birdCenter.lengthSq() === 0 ? 1 : Math.min(1, dt * 0.05));
        for (let i = 0; i < opts.birds; i++) {
          const [p0, r, h, w, dir] = birdPhase[i]!;
          const a = p0 + t * w * dir;
          const rr = r + Math.sin(t * 0.3 + p0) * 8;
          const x = birdCenter.x + Math.cos(a) * rr;
          const z = birdCenter.z + Math.sin(a) * rr;
          const y = hf.height(birdCenter.x, birdCenter.z) + h + Math.sin(t * 0.7 + p0 * 3) * 6;
          pos.set(x, y, z);
          // Tangent of the circle; bank into the turn.
          const heading = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir) + Math.PI;
          e.set(Math.cos(t * 0.7 + p0 * 3) * 0.3, heading, dir * 0.5);
          q.setFromEuler(e);
          const flap = Math.sin(t * 14 + p0 * 5) * (Math.sin(t * 0.9 + p0) > 0 ? 1 : 0.15);
          sc.set(1.6, 1.6 * (0.3 + flap), 1.6);
          mat4.compose(pos, q, sc);
          birds.setMatrixAt(i, mat4);
        }
        birds.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      m.points.geometry.dispose();
      (m.points.material as THREE.Material).dispose();
      wingGeo.dispose();
      wingMat.map?.dispose();
      wingMat.dispose();
      birdGeo.dispose();
      birdMat.dispose();
    },
  };
}
