import * as THREE from 'three';

/**
 * Altar fires: the eternal fire on the altar of Prometheus (where the torch races of the Academy began,
 * Pausanias 1.30.2) and embers of offerings on the smaller altars. Each fire is a few crossed flame cards
 * with an animated noise shader, a soft halo, and a warm pool of light painted on the ground around it
 * (no real light: one draw call for all flames, one for all ground glows). The flames are always there but
 * read mainly at dusk and night, when the glow grows.
 */
export interface FireSpot {
  x: number;
  y: number;
  z: number;
  /** Flame height (m). */
  size: number;
}

export interface Fires {
  readonly group: THREE.Group;
  update(time: number, night: number): void;
  dispose(): void;
}

const FLAME_VERT = /* glsl */ `
  attribute vec3 aSpot; // x, z offset handled by instance matrix; aSpot.x = seed, aSpot.y = size
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = aSpot.x;
    // Billboard around Y: the card faces the camera horizontally.
    vec4 centre = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 toCam = cameraPosition - centre.xyz;
    vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x));
    float s = aSpot.y;
    vec3 p = centre.xyz + right * position.x * s * 0.6 + vec3(0.0, position.y * s, 0.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;

const FLAME_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uNight;
  varying vec2 vUv;
  varying float vSeed;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec2 uv = vUv;
    float t = uTime * 2.2 + vSeed * 10.0;
    // Rising turbulence.
    float turb = n(vec2(uv.x * 4.0, uv.y * 3.0 - t)) * 0.6 + n(vec2(uv.x * 9.0, uv.y * 7.0 - t * 1.7)) * 0.4;
    float x = (uv.x - 0.5) * 2.0 + (turb - 0.5) * 0.5 * uv.y;
    float shape = (1.0 - smoothstep(0.0, 1.0, abs(x) / max(0.05, (1.0 - uv.y) * 0.9))) * smoothstep(0.0, 0.08, uv.y);
    float body = shape * (0.55 + turb * 0.8) * (1.0 - uv.y * 0.85);
    if (body < 0.02) discard;
    vec3 hot = vec3(1.0, 0.85, 0.45);
    vec3 warm = vec3(1.0, 0.42, 0.08);
    vec3 col = mix(warm, hot, smoothstep(0.3, 0.9, body)) * body;
    // HDR: brighter than the day scene so it blooms at night.
    gl_FragColor = vec4(col * (2.0 + uNight * 6.0), 1.0);
  }`;

const GLOW_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uNight;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float flick = 0.85 + 0.15 * sin(uTime * 7.0 + vSeed * 20.0) * sin(uTime * 3.1 + vSeed * 9.0);
    float a = exp(-r * r * 3.5) * (1.0 - smoothstep(0.85, 1.0, r));
    gl_FragColor = vec4(vec3(1.0, 0.5, 0.18) * a * flick * (0.02 + uNight * 0.55), 1.0);
  }`;

const GLOW_VERT = /* glsl */ `
  attribute vec3 aSpot;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = aSpot.x;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  }`;

export function createFires(spots: FireSpot[], ground: (x: number, z: number) => number): Fires {
  const group = new THREE.Group();
  group.name = 'fires';
  const uniforms = { uTime: { value: 0 }, uNight: { value: 0 } };
  // Three flame cards per fire, offset a little, of different heights.
  const cards = spots.flatMap((s, i) => [0, 1, 2].map((k) => ({ ...s, k, seed: i * 3.7 + k * 1.3 })));
  const flameGeo = new THREE.PlaneGeometry(1, 1);
  flameGeo.translate(0, 0.5, 0);
  const flameAttr = new THREE.InstancedBufferAttribute(new Float32Array(cards.length * 3), 3);
  flameGeo.setAttribute('aSpot', flameAttr);
  const flameMat = new THREE.ShaderMaterial({ uniforms, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const flames = new THREE.InstancedMesh(flameGeo, flameMat, Math.max(1, cards.length));
  flames.count = cards.length;
  flames.frustumCulled = false;
  const m = new THREE.Matrix4();
  cards.forEach((c, i) => {
    const off = [[0, 0], [0.12, 0.05], [-0.1, -0.07]][c.k]!;
    m.makeTranslation(c.x + off[0]! * c.size, c.y, c.z + off[1]! * c.size);
    flames.setMatrixAt(i, m);
    flameAttr.setXYZ(i, c.seed, c.size * [1, 0.75, 0.6][c.k]!, 0);
  });
  group.add(flames);

  // Ground glow: a flat disc on the terrain under each fire (and a smaller one at flame height).
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  glowGeo.rotateX(-Math.PI / 2);
  const glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(spots.length * 3), 3);
  glowGeo.setAttribute('aSpot', glowAttr);
  const glowMat = new THREE.ShaderMaterial({ uniforms, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  const glows = new THREE.InstancedMesh(glowGeo, glowMat, Math.max(1, spots.length));
  glows.count = spots.length;
  glows.frustumCulled = false;
  spots.forEach((s, i) => {
    const r = 6 + s.size * 6;
    m.compose(new THREE.Vector3(s.x, ground(s.x, s.z) + 0.04, s.z), new THREE.Quaternion(), new THREE.Vector3(r, 1, r));
    glows.setMatrixAt(i, m);
    glowAttr.setXYZ(i, i * 1.7, 0, 0);
  });
  group.add(glows);

  return {
    group,
    update(time, night) {
      uniforms.uTime.value = time;
      uniforms.uNight.value = night;
    },
    dispose() {
      flameGeo.dispose();
      glowGeo.dispose();
      flameMat.dispose();
      glowMat.dispose();
    },
  };
}
