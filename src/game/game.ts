import * as THREE from 'three';
import { parseAppearance } from '../characters/appearance';
import { EventBus, type GameEvents } from '../core/events';
import { t } from '../core/i18n';
import { Input } from '../core/input';
import { FixedStep } from '../core/loop';
import type { Settings } from '../core/settings';
import { Benchmark, type CameraPath } from '../debug/benchmark';
import { FrameStats } from '../debug/frameStats';
import { FreeFlyCamera } from '../debug/freeFlyCamera';
import { DebugOverlay } from '../debug/overlay';
import type { Physics } from '../physics/physics';
import { ThirdPersonCamera } from '../player/camera';
import { Player } from '../player/player';
import { polylineLength, samplePolyline, type Vec2 } from '../procgen/geometry2d';
import { SkyEnvironment } from '../render/environment';
import { MaterialLib } from '../render/materialLib';
import { ModelLib } from '../render/modelLib';
import { PostPipeline } from '../render/post';
import { GameState } from '../systems/state';
import { StoryDirector } from './story';
import { onResize } from '../render/renderer';
import { WorldClock, formatTime, type Season } from '../world/clock';
import { createWorldUniforms, type WorldUniforms } from '../world/uniforms';
import { Wind } from '../world/wind';
import { buildWorld, type World } from '../world/world';

/**
 * Top-level game object: owns the renderer loop and every system. Systems communicate through
 * `bus`; this class only wires them together and decides the frame order:
 * input → fixed-step simulation (player, physics) → world (clock, wind, sky, LOD) → camera → render → UI.
 */
export interface GameOptions {
  app: HTMLElement;
  renderer: THREE.WebGLRenderer;
  physics: Physics;
  settings: Settings;
  gpu: string;
  params: URLSearchParams;
  setLoading: (text: string) => Promise<void>;
}

const SEASON_TINT: Record<Season, number> = { spring: 0xf4ffd8, summer: 0xf0e2b0, autumn: 0xe0cc98, winter: 0xc4d4b0 };

export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly uniforms: WorldUniforms = createWorldUniforms();
  readonly clock: WorldClock;
  readonly wind: Wind;
  readonly input: Input;
  world!: World;
  player!: Player;
  tpCamera!: ThirdPersonCamera;
  private readonly fixed = new FixedStep(1 / 60);
  private readonly stats = new FrameStats(240);
  private readonly overlay: DebugOverlay;
  private readonly freeFly: FreeFlyCamera;
  private bench: Benchmark | null = null;
  private readonly hint: HTMLDivElement;
  private readonly timer = new THREE.Timer();
  private framesRendered = 0;
  private post: PostPipeline | null = null;
  readonly state = new GameState();
  story!: StoryDirector;
  private env: SkyEnvironment | null = null;
  private elapsed = 0;
  ready = false;
  benchResult: import('../debug/benchmark').BenchmarkResult | null = null;

  constructor(private readonly o: GameOptions) {
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.25, 9000);
    this.input = new Input(o.renderer.domElement);
    this.freeFly = new FreeFlyCamera(this.camera);
    this.overlay = new DebugOverlay(o.app, o.params.get('overlay') === '1' || (import.meta.env.DEV && o.params.get('overlay') !== '0'));
    const p = o.params;
    this.clock = new WorldClock({
      hours: p.has('time') ? Number(p.get('time')) : 17.6,
      season: (p.get('season') as Season | null) ?? 'spring',
    });
    if (p.has('timescale')) this.clock.timeScale = Number(p.get('timescale'));
    this.wind = new Wind(this.uniforms);
    this.hint = document.createElement('div');
    this.hint.className = 'hint';
    o.app.appendChild(this.hint);
  }

  async start(): Promise<void> {
    const o = this.o;
    this.world = await buildWorld('academy', {
      scene: this.scene,
      renderer: o.renderer,
      physics: o.physics,
      uniforms: this.uniforms,
      settings: o.settings,
      lib: new MaterialLib(o.renderer),
      models: new ModelLib(this.uniforms),
      progress: (s) => o.setLoading(t(s)),
    });
    const gfx = o.settings.graphics;
    // Debug switches: ?post=0 disables the pipeline, ?ao=0 / ?bloom=0 / ?shafts=0 disable parts.
    const P = o.params;
    if (P.get('ao') === '0') gfx.post.ao = false;
    if (P.get('bloom') === '0') gfx.post.bloom = false;
    if (P.get('shafts') === '0') gfx.post.godRays = false;
    const wantPost = P.get('post') !== '0' && (gfx.post.ao || gfx.post.bloom || gfx.post.godRays);
    if (wantPost) {
      this.post = new PostPipeline(o.renderer, gfx);
      this.scene.fog = null; // the post pipeline's height fog replaces three's fog
    }
    this.env = new SkyEnvironment(o.renderer, this.world.sky.skyMesh, this.scene);
    this.scene.environmentIntensity = 0.38;
    this.world.sky.ambientScale = 0.4;
    await o.setLoading(t('loading.player'));
    const spawn = { ...this.world.layout.spawn };
    const at = o.params.get('at');
    if (at) {
      const [x, z] = at.split(',').map(Number);
      if (Number.isFinite(x) && Number.isFinite(z)) Object.assign(spawn, { x, z });
    }
    this.player = new Player(o.physics, this.world.hf, parseAppearance(PLAYER_DEFAULT), spawn);
    this.scene.add(this.player.object);
    this.tpCamera = new ThirdPersonCamera(this.camera, o.physics, this.world.hf);
    this.tpCamera.snapBehind(this.player.heading);
    this.applySeason();
    this.hint.textContent = t('hint.play');
    this.story = new StoryDirector(o.app, this.state, this.player, this.tpCamera, this.world.pois, this.world.hf.height);
    this.scene.add(this.story.group);
    if (o.params.get('story') === '0') this.state.runCommand('flag seen_arrival');

    o.renderer.domElement.addEventListener('click', () => {
      if (!this.bench || this.bench.finished) this.input.requestPointerLock();
    });
    window.addEventListener('resize', () => {
      if (!this.benchRunning) onResize(o.renderer, this.camera, o.settings.graphics);
    });
    if (o.params.has('bench') || location.hash === '#bench') this.startBenchmark(Number(o.params.get('bench')) || 20);

    this.timer.connect(document);
    o.renderer.setAnimationLoop((time) => this.frame(time));
  }

  /** Debug/screenshot helper: switch to the free camera at a fixed spot. */
  debugSetCamera(pos: [number, number, number], target: [number, number, number], groundRelative = false): void {
    const hf = this.world.hf;
    const py = groundRelative ? pos[1] + hf.height(pos[0], pos[2]) : pos[1];
    const ty = groundRelative ? target[1] + hf.height(target[0], target[2]) : target[1];
    this.camera.position.set(pos[0], py, pos[2]);
    this.camera.lookAt(target[0], ty, target[2]);
    this.freeFly.enable();
    this.player.controlEnabled = false;
  }

  /** Debug/screenshot helper: put the player somewhere and frame them from behind. */
  debugPlacePlayer(x: number, z: number, heading: number, cameraYaw?: number, pitch?: number): void {
    this.freeFly.disable();
    this.player.controlEnabled = true;
    this.player.teleport(x, z, heading);
    this.tpCamera.snapBehind(heading);
    if (cameraYaw !== undefined) this.tpCamera.yaw = cameraYaw;
    if (pitch !== undefined) this.tpCamera.pitch = pitch;
  }

  get benchRunning(): boolean {
    return this.bench !== null && !this.bench.finished;
  }

  applySeason(): void {
    this.uniforms.seasonTint.value.set(SEASON_TINT[this.clock.season]);
    this.uniforms.greenness.value = { spring: 1, summer: 0.15, autumn: 0.35, winter: 0.7 }[this.clock.season];
  }

  /** Benchmark: a fixed flight from the Dipylon down the road of the dead into the grove at golden hour. */
  startBenchmark(secs: number): void {
    if (this.benchRunning) return;
    if (this.freeFly.enabled) this.freeFly.disable();
    document.querySelector('.bench-report')?.remove();
    const r = this.o.renderer;
    r.domElement.classList.add('bench-fixed');
    r.setPixelRatio(1);
    r.setSize(1920, 1080, false);
    this.camera.aspect = 16 / 9;
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
    this.clock.hours = 18.2;
    this.clock.paused = true;
    const L = this.world.layout;
    const route: Vec2[] = [
      ...L.paths.find((p) => p.id === 'road_academy')!.points,
      ...L.paths.find((p) => p.id === 'gate_to_gym')!.points.slice(1),
      ...L.paths.find((p) => p.id === 'peripatos')!.points.slice(1, 5),
    ];
    const len = polylineLength(route);
    const hf = this.world.hf;
    const path: CameraPath = (u, cam) => {
      const s = u * len;
      const p = samplePolyline(route, s);
      const ahead = samplePolyline(route, Math.min(len, s + 12));
      cam.position.set(p.x, hf.height(p.x, p.z) + 2.4, p.z);
      cam.lookAt(ahead.x, hf.height(ahead.x, ahead.z) + 2.0, ahead.z);
    };
    this.bench = new Benchmark(this.o.app, path, { scene: 'm1-academy-golden-hour', gpu: this.o.gpu, preset: this.o.settings.graphics.preset }, secs);
    this.bus.emit('bench:started', { durationSec: secs });
  }

  private endBenchmark(): void {
    this.o.renderer.domElement.classList.remove('bench-fixed');
    this.clock.paused = false;
    onResize(this.o.renderer, this.camera, this.o.settings.graphics);
  }

  private frame(time: number): void {
    const frameStart = performance.now();
    this.timer.update(time);
    const rawDt = this.timer.getDelta();
    const dt = Math.min(rawDt, 0.1); // simulation clamp; stats and the benchmark use the real frame time
    const input = this.input;
    input.pollGamepads();

    if (input.wasPressed('toggleDebugCamera') && !this.benchRunning) {
      if (this.freeFly.enabled) this.freeFly.disable();
      else this.freeFly.enable();
      this.player.controlEnabled = !this.freeFly.enabled;
      this.hint.textContent = this.freeFly.enabled ? t('hint.freefly') : t('hint.play');
    }
    if (input.wasPressed('toggleOverlay')) this.overlay.toggle();
    if (input.wasPressed('debugTime')) this.clock.hours = (this.clock.hours + 2) % 24;
    if (input.wasPressed('debugRespawn')) {
      const s = this.world.layout.spawn;
      this.player.teleport(s.x, s.z, s.heading);
    }

    // Simulation.
    if (!this.freeFly.enabled && !this.benchRunning && !this.story.inDialogue) {
      this.tpCamera.handleInput(input, input.pointerLocked, dt);
      this.player.readInput(input, this.tpCamera.yaw);
    } else {
      this.player.readInput(input, 0);
    }
    const physics = this.o.physics;
    const step = this.fixed.advance(dt, (h) => {
      this.player.fixedUpdate(h);
      physics.step(h);
    });
    this.player.render(step.alpha, dt);

    // World.
    this.clock.update(dt);
    this.wind.update(dt);
    this.uniforms.playerPos.value.copy(this.player.position);
    const zone = this.world.zoneAt(this.player.position.x, this.player.position.z);
    // The plane-tree canopy is visibly darker and cooler: a touch more haze under it.
    const canopyTarget = zone?.canopy ? 1.8 : 1;
    this.world.sky.fogBoost += (canopyTarget - this.world.sky.fogBoost) * Math.min(1, dt * 0.8);

    // Camera.
    if (this.benchRunning) {
      /* driven by the benchmark */
    } else if (this.freeFly.enabled) this.freeFly.update(dt, input, input.pointerLocked);
    else this.tpCamera.update(this.player.position, dt, this.player.collider);

    const focus = this.freeFly.enabled || this.benchRunning ? this.camera.position : this.player.position;
    this.uniforms.focusPos.value.copy(focus);
    this.world.sky.update(this.clock, this.camera, focus, dt);
    this.world.forest.update(this.camera);
    this.world.grass.update(focus);
    this.world.water.update(dt);
    this.world.update(this.camera, dt);
    if (!this.benchRunning) this.story.update(dt, input, this.camera.position, zone ? t(zone.nameKey) : null);
    this.state.data.playSeconds += dt;
    const sky = this.world.sky;
    this.env?.update(dt, sky.sunDir, sky.fogColor.clone().multiplyScalar(0.45));

    // Render.
    const r = this.o.renderer;
    r.info.reset();
    this.elapsed += dt;
    if (this.post) {
      const p = this.post.params;
      p.sunDir.copy(sky.sunDir);
      p.sunColor.copy(sky.sunColor);
      p.fogColor.copy(sky.fogColor);
      p.fogDensity = sky.fogDensity * 0.42;
      p.fogBase = 0;
      p.heightFalloff = 0.006;
      const el = Math.asin(Math.max(-1, Math.min(1, sky.sunDir.y))) * 57.3;
      p.shafts = (1 - THREE.MathUtils.smoothstep(el, 12, 45)) * THREE.MathUtils.smoothstep(el, -2, 3) * 0.9;
      p.horizonHaze = 0.65;
      p.warmth = 0.2 + 0.3 * (1 - THREE.MathUtils.smoothstep(el, 5, 35));
      this.post.render(this.scene, this.camera, this.elapsed);
    } else {
      r.render(this.scene, this.camera);
    }
    let workMs = 0;
    if (this.benchRunning) {
      r.getContext().finish();
      workMs = performance.now() - frameStart;
    }
    this.stats.push(rawDt * 1000);
    this.overlay.update(dt, this.stats, r.info, {
      bodies: physics.bodyCount,
      preset: this.o.settings.graphics.preset,
      gpu: this.o.gpu,
      camera: `${this.freeFly.enabled ? 'free' : this.benchRunning ? 'bench' : 'follow'} · ${formatTime(this.clock.hours)} · ${zone?.id ?? '—'}`,
    });

    if (this.bench && this.benchRunning) {
      const result = this.bench.update(rawDt, this.camera, r.info, workMs);
      if (result) {
        this.benchResult = result;
        this.endBenchmark();
        this.bus.emit('bench:finished', { result });
        console.info('[bench]', JSON.stringify(result));
      }
    }

    input.endFrame();
    if (++this.framesRendered === 3) this.ready = true;
  }
}

/** Default player look until character creation (M4): a young newcomer in a travelling cloak. */
const PLAYER_DEFAULT = {
  height: 1.72,
  build: 0.45,
  sex: 'm',
  age: 'youth',
  skin: '#c69470',
  hair: { style: 'curly', color: '#3a2618' },
  beard: { style: 'none', color: '#3a2618' },
  chiton: { color: '#d9cbb0', length: 'knee', border: '#8c3b2a' },
  himation: null,
  chlamys: '#7a4a2e',
  petasos: false,
  props: [],
};
