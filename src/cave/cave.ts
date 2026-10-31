import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import text from '../../content/cave/cave.json';
import type { AppearanceInput } from '../characters/appearance';
import { t } from '../core/i18n';
import type { InputState } from '../core/input';
import { Npc } from '../npc/npc';
import { mulberry32 } from '../procgen/rng';
import type { GameState } from '../systems/state';

/**
 * The Allegory of the Cave (Republic VII 514a–518b) as a dreamlike first-person interlude, in its own small
 * scene. Stages follow the text: chained before the wall of shadows; freed and turned to the fire (it dazzles);
 * the carried objects behind the low wall; the steep ascent; outside, blinded, the eyes adapt (exposure is the
 * mechanic): first shadows, then reflections, then things, last the sun. Then the choice to go back down.
 *
 * Local frame: the prisoners face −Z toward the back wall; the fire is behind them at +Z; the passage climbs to
 * the outside further along +Z.
 */
type Stage = 'chained' | 'turned' | 'ascent' | 'outside' | 'choice' | 'descend' | 'done';

const T = text;
const EYE = 1.55;
const WALL_Z = -10;
const PARAPET_Z = 6;
const FIRE = new THREE.Vector3(0, 0.6, 13);
const TUNNEL_START = 17;
const TUNNEL_END = 52;
const TUNNEL_RISE = 14;
const SUN_DIR = new THREE.Vector3(0.25, 0.55, 1).normalize();

export interface CaveDeps {
  app: HTMLElement;
  camera: THREE.PerspectiveCamera;
  state: GameState;
  appearance: (id: string) => AppearanceInput | undefined;
}

export class CaveInterlude {
  readonly scene = new THREE.Scene();
  active = false;
  /** Tone-mapping exposure the game should use while the cave is shown. */
  exposure = 1;
  /** Background/fog colour for the post pipeline. */
  readonly fogColor = new THREE.Color(0x050302);
  private stage: Stage = 'chained';
  private built = false;
  private readonly pos = new THREE.Vector3(0, 0, 0);
  private yaw = Math.PI; // facing −Z
  private pitch = 0;
  private stageTime = 0;
  private struggles = 0;
  private readonly seen = new Set<string>();
  private gaze: { id: string; time: number } | null = null;
  private adapt = 1;
  private readonly textEl: HTMLDivElement;
  private readonly promptEl: HTMLDivElement;
  private carriers: { npc: Npc; obj: THREE.Object3D; x0: number; speed: number; id: string }[] = [];
  private prisoners: Npc[] = [];
  private fireLight!: THREE.PointLight;
  private flames!: THREE.Mesh[];
  private sunLight!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private outside!: THREE.Group;
  private targets: { id: string; pos: THREE.Vector3; radius: number }[] = [];
  private textQueue: string[] = [];
  private textTimer = 0;
  private fade = 0;
  private onDone: (() => void) | null = null;

  constructor(private readonly d: CaveDeps) {
    this.textEl = document.createElement('div');
    this.textEl.className = 'cave-text';
    this.textEl.hidden = true;
    this.promptEl = document.createElement('div');
    this.promptEl.className = 'cave-prompt';
    this.promptEl.hidden = true;
    d.app.append(this.textEl, this.promptEl);
    d.state.bus.on('state:cave', (e) => {
      if (e.action === 'enter') this.pendingEnter = true;
    });
  }

  /** Set by the `cave enter` command; the game starts the cave when the dialogue has closed. */
  pendingEnter = false;

  enter(onDone: () => void): void {
    if (!this.built) this.build();
    this.pendingEnter = false;
    this.active = true;
    this.onDone = onDone;
    this.stage = 'chained';
    this.stageTime = 0;
    this.struggles = 0;
    this.seen.clear();
    this.pos.set(0, 0, 0);
    this.yaw = Math.PI;
    this.pitch = 0.14;
    this.adapt = 1;
    this.exposure = 0.9;
    document.body.classList.add('in-cave');
    this.fade = 1;
    this.outside.visible = false;
    this.say(...T.chained);
  }

  // ---------------------------------------------------------------- building

  private build(): void {
    this.built = true;
    const s = this.scene;
    s.background = new THREE.Color(0x020101);
    const rng = mulberry32(51);
    const rock = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.95, side: THREE.BackSide });
    // The chamber: a box seen from inside, its walls roughened.
    const chamber = new THREE.BoxGeometry(24, 10, 30, 48, 20, 60);
    const p = chamber.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const n = Math.sin(x * 0.7 + z * 0.3) * 0.35 + Math.sin(y * 1.3 + x * 0.2) * 0.25 + (rng() - 0.5) * 0.25;
      const k = 1 + n * 0.06;
      // Keep the back wall flatter so the shadows read clearly.
      const flat = z < -14.5 ? 0.25 : 1;
      p.setXYZ(i, x * (1 + (k - 1) * flat), y > 0 ? y * k : y, z);
    }
    chamber.computeVertexNormals();
    const cave = new THREE.Mesh(chamber, rock);
    cave.position.set(0, 4.95, 3);
    cave.receiveShadow = true;
    s.add(cave);
    // The back wall: a smoother, paler surface for the shadows.
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(22, 9), new THREE.MeshStandardMaterial({ color: 0x9a8a72, roughness: 1 }));
    wall.position.set(0, 4.4, WALL_Z - 1.9);
    wall.receiveShadow = true;
    s.add(wall);
    // The low wall the carriers walk behind ("like the screen of puppeteers").
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(18, 1.15, 0.6), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 }));
    parapet.position.set(-2, 0.575, PARAPET_Z);
    parapet.castShadow = true;
    s.add(parapet);
    // Fire.
    this.fireLight = new THREE.PointLight(0xff9a48, 90, 60, 1.6);
    this.fireLight.position.copy(FIRE).add(new THREE.Vector3(0, 0.6, 0));
    this.fireLight.castShadow = true;
    this.fireLight.shadow.mapSize.set(1024, 1024);
    this.fireLight.shadow.bias = -0.002;
    s.add(this.fireLight);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flames = [];
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.35 + rng() * 0.3, 1.4 + rng() * 0.8, 7, 1, true), flameMat);
      f.position.copy(FIRE).add(new THREE.Vector3((rng() - 0.5) * 0.8, 0.6, (rng() - 0.5) * 0.8));
      s.add(f);
      this.flames.push(f);
    }
    const logs = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0x2a1a10, emissive: 0x401000, roughness: 1 }));
    logs.position.copy(FIRE).setY(0.15);
    s.add(logs);
    s.add(new THREE.AmbientLight(0x30201a, 0.6));
    // Prisoners (seated, chained) to either side of the player.
    const pApp = (seed: number): AppearanceInput => ({
      height: 1.68,
      age: 'adult',
      skin: ['#c99068', '#b07850', '#d8a882'][seed % 3]!,
      hair: { style: 'short', color: '#2a1a10' },
      chiton: { color: '#6a5a48', length: 'short' },
    } as AppearanceInput);
    [-3.2, -1.6, 1.6, 3.2].forEach((x, i) => {
      const n = new Npc(`prisoner${i}`, pApp(i), () => 0, 90 + i);
      n.place(x, 0, Math.PI, 'sitGround');
      n.object.traverse((o) => (o.castShadow = true));
      s.add(n.object);
      this.prisoners.push(n);
    });
    const chain = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.8, roughness: 0.4 }));
    chain.position.set(0, 0.25, 0.3);
    s.add(chain);
    // Carriers walking behind the parapet with raised objects.
    const objects: [string, () => THREE.Object3D][] = [
      ['horse', () => this.horse()],
      ['vase', () => this.vase()],
      ['man', () => this.statue()],
      ['tree', () => this.treeCutout()],
    ];
    objects.forEach(([id, make], i) => {
      const app = { height: 1.75, age: 'adult', skin: '#b98560', hair: { style: 'short', color: '#2a1a10' }, chiton: { color: '#4a3a2a', length: 'knee' } } as AppearanceInput;
      const npc = new Npc(`carrier${i}`, app, () => 0, 120 + i);
      npc.object.traverse((o) => (o.castShadow = false));
      s.add(npc.object);
      const obj = make();
      obj.traverse((o) => (o.castShadow = true));
      s.add(obj);
      this.carriers.push({ npc, obj, x0: -10 + i * 5.2, speed: 0.55 + (i % 2) * 0.2, id });
    });
    // The ascent: a narrow rising tunnel.
    const tunnel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4, TUNNEL_END - TUNNEL_START + 2, 4, 4, 40), rock);
    const tp = tunnel.geometry.getAttribute('position');
    for (let i = 0; i < tp.count; i++) {
      const z = tp.getZ(i) + (TUNNEL_START + TUNNEL_END) / 2;
      const u = THREE.MathUtils.clamp((z - TUNNEL_START) / (TUNNEL_END - TUNNEL_START), 0, 1);
      tp.setY(i, tp.getY(i) + u * TUNNEL_RISE + (rng() - 0.5) * 0.2);
      tp.setX(i, tp.getX(i) * (1 + (rng() - 0.5) * 0.15));
    }
    tunnel.geometry.computeVertexNormals();
    tunnel.position.set(0, 2, (TUNNEL_START + TUNNEL_END) / 2);
    s.add(tunnel);
    // Outside: meadow, a tree, a pool, the sun.
    this.outside = new THREE.Group();
    const top = TUNNEL_RISE;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshStandardMaterial({ color: 0x7d8f4a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, top, TUNNEL_END + 60);
    ground.receiveShadow = true;
    this.outside.add(ground);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { sun: { value: SUN_DIR } },
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 sun; varying vec3 vDir; void main(){ float h = clamp(vDir.y, 0.0, 1.0); vec3 c = mix(vec3(0.85, 0.9, 0.95), vec3(0.32, 0.55, 0.9), pow(h, 0.6)); float s = max(dot(normalize(vDir), sun), 0.0); c += vec3(1.0, 0.9, 0.7) * (pow(s, 900.0) * 40.0 + pow(s, 12.0) * 0.6); gl_FragColor = vec4(c, 1.0); }',
      }),
    );
    sky.position.set(0, top, TUNNEL_END + 40);
    this.outside.add(sky);
    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 3.2);
    this.sunLight.position.copy(SUN_DIR).multiplyScalar(60).add(new THREE.Vector3(0, top, TUNNEL_END + 30));
    this.sunLight.target.position.set(0, top, TUNNEL_END + 30);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.camera.left = -30;
    this.sunLight.shadow.camera.right = 30;
    this.sunLight.shadow.camera.top = 30;
    this.sunLight.shadow.camera.bottom = -30;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.outside.add(this.sunLight, this.sunLight.target);
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6a7040, 1.2);
    this.outside.add(this.hemi);
    const tree = this.realTree();
    tree.position.set(-6, top, TUNNEL_END + 22);
    this.outside.add(tree);
    const pool = new Reflector(new THREE.CircleGeometry(3.5, 32), { textureWidth: 512, textureHeight: 512, color: 0x7f8a90 });
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(5, top + 0.03, TUNNEL_END + 16);
    this.outside.add(pool);
    const rim = new THREE.Mesh(new THREE.RingGeometry(3.5, 4.1, 32), new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 1 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(5, top + 0.02, TUNNEL_END + 16);
    this.outside.add(rim);
    this.outside.visible = false;
    s.add(this.outside);
    this.targets = [
      { id: 'shadow', pos: new THREE.Vector3(-6 - SUN_DIR.x * 6, top, TUNNEL_END + 22 - SUN_DIR.z * 6), radius: 3 },
      { id: 'reflection', pos: new THREE.Vector3(5, top, TUNNEL_END + 16), radius: 3 },
      { id: 'things', pos: new THREE.Vector3(-6, top + 3.5, TUNNEL_END + 22), radius: 3 },
      { id: 'sun', pos: SUN_DIR.clone().multiplyScalar(300).add(new THREE.Vector3(0, top, TUNNEL_END)), radius: 30 },
    ];
  }

  private horse(): THREE.Object3D {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 0.25), m);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.55, 0.2), m);
    neck.position.set(0.55, 0.3, 0);
    neck.rotation.z = -0.5;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.18), m);
    head.position.set(0.8, 0.55, 0);
    g.add(body, neck, head);
    for (const [x, z] of [[-0.4, 0.08], [0.4, 0.08], [-0.4, -0.08], [0.4, -0.08]] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), m);
      leg.position.set(x, -0.42, z);
      g.add(leg);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.06), m);
    tail.position.set(-0.6, -0.05, 0);
    tail.rotation.z = 0.5;
    g.add(tail);
    return g;
  }

  private vase(): THREE.Object3D {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const v = i / 16;
      pts.push(new THREE.Vector2(0.1 + Math.sin(v * Math.PI) * 0.28 + (v > 0.85 ? 0.08 : 0), v * 0.9));
    }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 16), new THREE.MeshStandardMaterial({ color: 0xb4582f, roughness: 0.6 })));
    return g;
  }

  private statue(): THREE.Object3D {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.9, 8), m);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), m);
    head.position.y = 0.6;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.07), m);
    arm.position.set(0.25, 0.25, 0);
    arm.rotation.z = 0.5;
    g.add(body, head, arm);
    return g;
  }

  private treeCutout(): THREE.Object3D {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x5a6a3a, roughness: 0.9 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.8, 6), m);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), m);
    crown.position.y = 0.55;
    crown.scale.set(1.2, 0.9, 0.3);
    g.add(trunk, crown);
    return g;
  }

  private realTree(): THREE.Object3D {
    const g = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.95 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.85 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4.5, 10), bark);
    trunk.position.y = 2.25;
    trunk.castShadow = true;
    g.add(trunk);
    const rng = mulberry32(7);
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + rng() * 0.8, 1), leaf);
      c.position.set((rng() - 0.5) * 3.5, 4.6 + rng() * 2, (rng() - 0.5) * 3.5);
      c.castShadow = true;
      g.add(c);
    }
    return g;
  }

  // ---------------------------------------------------------------- update

  private say(...lines: string[]): void {
    this.textQueue.push(...lines);
    if (this.textTimer <= 0) this.textTimer = 0.01;
  }

  private prompt(textValue: string | null): void {
    this.promptEl.hidden = !textValue;
    if (textValue && this.promptEl.textContent !== textValue) this.promptEl.textContent = textValue;
  }

  private groundY(x: number, z: number): number {
    if (z <= TUNNEL_START) return 0;
    if (z >= TUNNEL_END) return TUNNEL_RISE;
    void x;
    return ((z - TUNNEL_START) / (TUNNEL_END - TUNNEL_START)) * TUNNEL_RISE;
  }

  /** Keep the dreamer inside the walkable space: chamber, tunnel, meadow; not through the parapet or fire. */
  private clamp(next: THREE.Vector3): THREE.Vector3 {
    const p = next.clone();
    const inChamber = p.z < TUNNEL_START;
    if (inChamber) {
      p.x = THREE.MathUtils.clamp(p.x, -11, 11);
      p.z = THREE.MathUtils.clamp(p.z, WALL_Z + 0.6, TUNNEL_START + 0.5);
      // The parapet spans x in [-11, 7]: pass round its east end.
      if (p.x < 7.3 && Math.abs(p.z - PARAPET_Z) < 0.65) p.z = this.pos.z < PARAPET_Z ? PARAPET_Z - 0.65 : PARAPET_Z + 0.65;
      const df = Math.hypot(p.x - FIRE.x, p.z - FIRE.z);
      if (df < 1.6) {
        p.x = FIRE.x + ((p.x - FIRE.x) / df) * 1.6;
        p.z = FIRE.z + ((p.z - FIRE.z) / df) * 1.6;
      }
      // Into the tunnel only near its mouth.
      if (p.z > TUNNEL_START - 0.5 && Math.abs(p.x) > 1.3) p.z = TUNNEL_START - 0.5;
    } else if (p.z < TUNNEL_END) {
      p.x = THREE.MathUtils.clamp(p.x, -1.2, 1.2);
    } else {
      p.x = THREE.MathUtils.clamp(p.x, -40, 40);
      p.z = THREE.MathUtils.clamp(p.z, TUNNEL_END, TUNNEL_END + 70);
    }
    if (this.stage === 'turned' && p.z > TUNNEL_START - 1 && this.seen.size < 2) p.z = TUNNEL_START - 1;
    p.y = this.groundY(p.x, p.z);
    return p;
  }

  private forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  private looking(at: THREE.Vector3, maxAngle: number, maxDist = Infinity): boolean {
    const eye = this.pos.clone().setY(this.pos.y + EYE);
    const to = at.clone().sub(eye);
    if (to.length() > maxDist) return false;
    return to.normalize().dot(this.forward()) > Math.cos(maxAngle);
  }

  update(dt: number, input: InputState): void {
    if (!this.active) return;
    this.stageTime += dt;
    // Look.
    const look = 0.0022;
    this.yaw -= input.mouseDX * look + input.padLookX * dt * 2.2 + input.axis('moveLeft', 'moveRight') * (this.stage === 'chained' ? dt * 0.8 : 0);
    this.pitch = THREE.MathUtils.clamp(this.pitch - input.mouseDY * look - input.padLookY * dt * 1.8, -1.2, 1.35);
    if (this.stage === 'chained') {
      this.yaw = THREE.MathUtils.clamp(this.yaw, Math.PI - 0.3, Math.PI + 0.3);
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.15, 0.3);
    } else {
      const m = input.move();
      const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const speed = this.stage === 'ascent' ? 1.6 : 2.4;
      const next = this.pos.clone().addScaledVector(fwd, m.y * speed * dt).addScaledVector(right, m.x * speed * dt);
      this.pos.copy(this.clamp(next));
    }
    // Animate fire and carriers.
    const time = performance.now() / 1000;
    this.fireLight.intensity = 80 + Math.sin(time * 13) * 8 + Math.sin(time * 7.3) * 6;
    this.flames.forEach((f, i) => {
      f.scale.y = 0.8 + Math.sin(time * (9 + i) + i) * 0.25;
      f.rotation.y = time * (0.5 + i * 0.1);
    });
    for (const c of this.carriers) {
      const x = ((c.x0 + time * c.speed + 11) % 20) - 11;
      c.npc.place(x, PARAPET_Z + 1.1, Math.PI / 2, 'walk');
      c.npc.update(dt, this.pos, 0, 0, this.d.camera.position);
      c.obj.position.set(x + 0.2, 1.8, PARAPET_Z + 0.9);
    }
    for (const n of this.prisoners) n.update(dt, this.pos, 0, 0, this.d.camera.position);
    this.stageLogic(dt, input);
    // Exposure: in the cave a little dim; outside the eyes adapt from blinding white.
    let target = 0.9;
    if (this.stage === 'turned' || this.stage === 'chained') {
      const toFire = this.looking(FIRE, 0.45) && this.stage === 'turned' ? 1 : 0;
      target = 0.9 + toFire * 3.5 * Math.max(0, 1 - this.stageTime / 25);
    }
    if (this.stage === 'outside' || this.stage === 'choice') {
      this.adapt = Math.max(0, this.adapt - dt / 28);
      target = 1 + this.adapt * 14;
      if (this.looking(this.targets[3]!.pos, 0.12) && this.adapt > 0.15) target += 40;
    }
    if (this.stage === 'descend') target = 0.12 + Math.min(0.6, this.stageTime / 20);
    this.exposure += (target - this.exposure) * Math.min(1, dt * 2.5);
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * 0.4);
    // Camera.
    const cam = this.d.camera;
    cam.position.copy(this.pos).setY(this.pos.y + (this.stage === 'chained' ? 1.0 : EYE));
    cam.lookAt(cam.position.clone().add(this.forward()));
    // Text.
    if (this.textTimer > 0) {
      this.textTimer -= dt;
      if (this.textTimer <= 0) {
        const next = this.textQueue.shift();
        if (next) {
          this.textEl.textContent = next;
          this.textEl.hidden = false;
          this.textEl.classList.remove('show');
          void this.textEl.offsetWidth;
          this.textEl.classList.add('show');
          this.textTimer = Math.max(4, next.length * 0.07);
        } else this.textEl.hidden = true;
      }
    }
  }

  private stageLogic(dt: number, input: InputState): void {
    const press = input.wasPressed('interact');
    switch (this.stage) {
      case 'chained':
        if (this.stageTime > 10) this.prompt(t('cave.struggle'));
        if (press && this.stageTime > 10) {
          this.struggles++;
          if (this.struggles >= 3) {
            this.stage = 'turned';
            this.stageTime = 0;
            this.prompt(null);
            this.say(...T.turned);
          }
        }
        break;
      case 'turned': {
        // Examine the carried objects.
        let near: string | null = null;
        for (const c of this.carriers) if (c.obj.position.distanceTo(this.pos.clone().setY(1.6)) < 3.2 && this.looking(c.obj.position, 0.5)) near = c.id;
        this.prompt(near && !this.seen.has(near) ? t('cave.examine') : this.seen.size >= 2 ? t('cave.ascend') : null);
        if (near && press && !this.seen.has(near)) {
          this.seen.add(near);
          this.say(T.objects[near as keyof typeof T.objects]);
          if (this.seen.size === 2) this.say(...T.dragged);
        }
        if (this.pos.z > TUNNEL_START + 1) {
          this.stage = 'ascent';
          this.stageTime = 0;
          this.prompt(null);
          this.say(...T.ascent);
        }
        break;
      }
      case 'ascent':
        if (this.pos.z > TUNNEL_END - 6) this.outside.visible = true;
        if (this.pos.z >= TUNNEL_END - 0.2) {
          this.stage = 'outside';
          this.stageTime = 0;
          this.adapt = 1;
          this.seen.clear();
          this.say(...T.outside);
        }
        break;
      case 'outside': {
        const order = ['shadow', 'reflection', 'things', 'sun'];
        const next = order.find((id) => !this.seen.has(id))!;
        const tg = this.targets.find((x) => x.id === next)!;
        const ready = next !== 'sun' || this.adapt < 0.15;
        const onIt = this.looking(tg.pos, next === 'sun' ? 0.1 : 0.3);
        if (onIt && ready) {
          this.gaze = this.gaze?.id === next ? { id: next, time: this.gaze.time + dt } : { id: next, time: 0 };
          if (this.gaze.time > 1.5) {
            this.seen.add(next);
            this.say(T.seen[next as keyof typeof T.seen]);
            this.gaze = null;
            if (next === 'sun') {
              this.stage = 'choice';
              this.stageTime = 0;
              this.say(...T.choice);
            }
          }
        } else if (onIt && next === 'sun' && !ready && !this.seen.has('too_bright')) {
          this.seen.add('too_bright');
          this.say(T.tooBright);
        }
        this.prompt(t(`cave.look.${next}`));
        break;
      }
      case 'choice':
        if (this.stageTime > 6) this.prompt(t('cave.choose'));
        if (this.stageTime > 6 && press) {
          this.d.state.runCommand('flag cave_returned true');
          this.stage = 'descend';
          this.stageTime = 0;
          this.pos.set(0, 0, 3);
          this.yaw = Math.PI;
          this.outside.visible = false;
          this.prompt(null);
          this.say(...T.descend);
        } else if (this.stageTime > 6 && input.wasPressed('jump')) {
          this.d.state.runCommand('flag cave_returned false');
          this.prompt(null);
          this.say(...T.stay);
          this.stage = 'done';
          this.stageTime = 0;
        }
        break;
      case 'descend':
        if (this.stageTime > 16) {
          this.stage = 'done';
          this.stageTime = 0;
        }
        break;
      case 'done':
        if (this.stageTime > 7) this.finish();
        break;
    }
  }

  private finish(): void {
    this.active = false;
    document.body.classList.remove('in-cave');
    this.textEl.hidden = true;
    this.prompt(null);
    this.textQueue = [];
    this.exposure = 1;
    this.d.state.runCommand('xp logos 60');
    this.d.state.runCommand('flag cave_done');
    this.onDone?.();
  }

  /** For tests and screenshots: jump to a stage. */
  debugStage(stage: Stage, adapt = 1): void {
    this.stage = stage;
    this.stageTime = 20;
    this.adapt = adapt;
    if (stage === 'turned') {
      this.pos.set(4, 0, 3);
      this.yaw = 0;
    } else if (stage === 'outside') {
      this.outside.visible = true;
      this.pos.set(0, TUNNEL_RISE, TUNNEL_END + 2);
      this.yaw = 0;
    }
  }
}
