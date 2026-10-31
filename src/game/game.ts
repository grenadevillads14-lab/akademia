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
import { writeSave } from '../systems/save';
import { Compass } from '../ui/compass';
import { drawMap } from '../ui/map';
import { PauseMenu } from '../ui/menu';
import type { NewGameChoices } from '../ui/title';
import { saveSettings } from '../core/settings';
import { CaveInterlude } from '../cave/cave';
import { loadHumanKit } from '../characters/mhuman';
import { AthleticsHost } from './athletics';
import { PuzzleHost } from './puzzleHost';
import { StoryDirector } from './story';
import { onResize } from '../render/renderer';
import { DynamicResolution } from '../render/dynres';
import { WorldClock, formatTime, type Season } from '../world/clock';
import { createWorldUniforms, type WorldUniforms } from '../world/uniforms';
import { Wind } from '../world/wind';
import { buildSpecimens, type SpecimenField } from '../world/specimens';
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
  puzzles!: PuzzleHost;
  athletics!: AthleticsHost;
  cave!: CaveInterlude;
  private specimens: SpecimenField | null = null;
  menu!: PauseMenu;
  compass!: Compass;
  /** True while the title screen or a menu covers the game. */
  paused = false;
  private fogTimer = 0;
  private autosaveTimer = 180;
  private travelEl: HTMLDivElement | null = null;
  private env: SkyEnvironment | null = null;
  private elapsed = 0;
  private dynres: DynamicResolution | null = null;
  ready = false;
  titleOpen = false;
  /** Rendered frame counter (tests wait on frames, not wall time: software GL is very slow). */
  frames = 0;
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
    // Realistic people (MakeHuman CC0 data); without it the stylised figures are used.
    if (o.params.get('humans') !== 'stylized') {
      await o.setLoading(t('loading.people'));
      await loadHumanKit();
    }
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
    // Sunlight should dominate: strong sky ambient flattens everything and turns the ground blue-grey.
    this.scene.environmentIntensity = 0.3;
    this.world.sky.ambientScale = 0.3;
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
    this.specimens = buildSpecimens(this.world.hf, this.world.pois);
    this.scene.add(this.specimens.group);
    this.story = new StoryDirector(o.app, this.state, this.player, this.tpCamera, this.world.pois, this.world.hf.height);
    this.scene.add(this.story.group);
    this.athletics = new AthleticsHost({
      app: o.app,
      scene: this.scene,
      state: this.state,
      player: this.player,
      camera: this.tpCamera,
      uniforms: this.uniforms,
      ground: this.world.hf.height,
      appearance: (id) => this.story.appearances.get(id),
      nameOf: (id) => this.story.nameOf(id),
      waiting: () => this.story.inDialogue || this.puzzles.open || this.titleOpen,
    });
    this.cave = new CaveInterlude({ app: o.app, camera: this.camera, state: this.state, appearance: (id) => this.story.appearances.get(id) });
    this.puzzles = new PuzzleHost(this.state, this.world.water, (id) => this.story.nameOf(id), () => this.story.inDialogue || this.titleOpen);
    if (o.params.get('story') === '0') this.state.runCommand('flag seen_arrival');
    this.compass = new Compass(o.app);
    this.menu = new PauseMenu(o.app, {
      state: () => this.state,
      settings: o.settings,
      quests: () => this.story.questList(),
      drawMap: (c) =>
        drawMap(c, this.world.layout, this.world.pois, this.state, { x: this.player.position.x, z: this.player.position.z, heading: this.player.heading }, this.story.objectiveMarker(), (k) => t(k)),
      beforeSave: () => this.captureState(),
      loadState: (s) => this.loadState(s),
      applySettings: (st) => {
        document.documentElement.style.setProperty('--text-scale', String(st.accessibility.textScale));
        saveSettings(st);
      },
    });
    document.documentElement.style.setProperty('--text-scale', String(o.settings.accessibility.textScale));
    // Autosave whenever a quest moves on.
    this.state.bus.on('state:quest', () => {
      this.captureState();
      writeSave('auto', this.state);
    });
    this.state.bus.on('state:time', (e) => {
      if (e.nextDay || e.hours < this.clock.hours) this.clock.day += 1;
      this.clock.hours = e.hours;
    });
    // Until the Lesbos interlude is built, sailing to Lesbos skips ahead.
    this.state.bus.on('state:lesbos', () => queueMicrotask(() => this.state.runCommand('flag lesbos_done')));
    this.state.bus.on('state:season', (e) => {
      this.clock.season = e.season;
      this.state.data.clock.season = e.season;
      this.applySeason();
    });
    this.state.bus.on('state:herm', () => this.story.hud.toast(t('herm.discovered'), 'info'));

    o.renderer.domElement.addEventListener('click', () => {
      if (!this.bench || this.bench.finished) this.input.requestPointerLock();
    });
    window.addEventListener('resize', () => {
      if (this.benchRunning) return;
      onResize(o.renderer, this.camera, o.settings.graphics);
      this.dynres?.apply();
    });
    {
      // Dynamic resolution between 75% of CSS pixels and the display's full pixel ratio (preset cap).
      const g = o.settings.graphics;
      const cap = Math.min(window.devicePixelRatio || 1, g.maxPixelRatio) * g.renderScale;
      if (cap > 0.8 && o.params.get('dynres') !== '0' && !o.params.has('bench')) this.dynres = new DynamicResolution(o.renderer, Math.min(0.75, cap), cap, Math.max(1, cap * 0.8));
    }
    if (o.params.has('bench') || location.hash === '#bench') this.startBenchmark(Number(o.params.get('bench')) || 20);

    this.timer.connect(document);
    o.renderer.setAnimationLoop((time) => this.frame(time));
  }

  /** Copy live clock and position into the save data. */
  captureState(): void {
    const d = this.state.data;
    d.clock.hours = this.clock.hours;
    d.clock.day = this.clock.day;
    d.clock.season = this.clock.season;
    d.position = { world: this.world.id, x: this.player.position.x, z: this.player.position.z, heading: this.player.heading };
  }

  /** Start a new game with the character-creation choices. */
  newGame(c: NewGameChoices): void {
    const d = this.state.data;
    d.player.name = c.name;
    d.player.homeCity = c.homeCity;
    const a = c.appearance;
    const appearance = {
      ...PLAYER_DEFAULT,
      sex: a.sex,
      skin: a.skin,
      hair: { style: a.hairStyle, color: a.hair },
      chiton: { color: a.chiton, length: 'knee', border: '#8c3b2a' },
      chlamys: a.cloak,
    };
    d.player.appearance = appearance;
    this.player.setAppearance(parseAppearance(appearance));
  }

  /** Replace the running state with a loaded save. */
  loadState(s: GameState): void {
    this.state.data = s.data;
    const d = s.data;
    if (d.player.appearance) this.player.setAppearance(parseAppearance(d.player.appearance));
    this.clock.hours = d.clock.hours;
    this.clock.day = d.clock.day;
    this.clock.season = d.clock.season;
    this.applySeason();
    if (d.position) {
      this.player.teleport(d.position.x, d.position.z, d.position.heading);
      this.tpCamera.snapBehind(d.position.heading);
    }
    this.story.refresh();
    this.puzzles.applyWater();
  }

  /** Herm fast travel: list discovered herms. */
  openTravel(): void {
    if (this.travelEl) return;
    const herms = (this.world.structures?.herms ?? []).filter((h) => this.state.data.discovered.herms.includes(h.id));
    const root = document.createElement('div');
    root.className = 'travel';
    const box = document.createElement('div');
    box.className = 'travel-box papyrus';
    const h = document.createElement('h3');
    h.textContent = t('travel.title');
    box.appendChild(h);
    const close = () => {
      root.remove();
      this.travelEl = null;
      this.paused = false;
    };
    for (const hm of herms) {
      const b = document.createElement('button');
      b.className = 'menu-button';
      b.textContent = t(`herm.${hm.id}`);
      b.addEventListener('click', () => {
        const back = new THREE.Vector3(Math.sin(this.player.heading), 0, Math.cos(this.player.heading));
        this.player.teleport(hm.position.x - back.x * 2.5, hm.position.z - back.z * 2.5);
        this.tpCamera.snapBehind(this.player.heading);
        close();
      });
      box.appendChild(b);
    }
    const c = document.createElement('button');
    c.className = 'menu-button';
    c.textContent = t('travel.cancel');
    c.addEventListener('click', close);
    box.appendChild(c);
    root.appendChild(box);
    this.o.app.appendChild(root);
    this.travelEl = root;
    this.paused = true;
    document.exitPointerLock?.();
  }

  /** One frame of the Cave interlude: its own scene, first-person camera and exposure. */
  private cavePlay(dt: number, rawDt: number, input: Input): void {
    const cave = this.cave;
    const r = this.o.renderer;
    if (!cave.active) {
      this.player.controlEnabled = false;
      this.hint.hidden = true;
      this.compass.visible = false;
      this.story.hud.setPrompt(null);
      this.story.hud.setObjective(null, null);
      cave.enter(() => {
        r.toneMappingExposure = 1;
        this.player.controlEnabled = true;
        this.hint.hidden = false;
        this.tpCamera.snapBehind(this.player.heading);
        this.clock.hours = 20.2;
      });
    }
    cave.update(dt, input);
    r.toneMappingExposure = cave.exposure;
    r.info.reset();
    this.elapsed += dt;
    if (this.post) {
      const p = this.post.params;
      p.sunDir.set(0.25, 0.55, 1).normalize();
      p.sunColor.setRGB(1, 0.92, 0.75);
      p.fogColor.copy(cave.fogColor);
      p.fogDensity = 0;
      p.shafts = 0;
      p.horizonHaze = 0;
      p.warmth = 0.35;
      this.post.render(cave.scene, this.camera, this.elapsed);
    } else {
      r.render(cave.scene, this.camera);
    }
    this.stats.push(rawDt * 1000);
    input.endFrame();
    this.frames++;
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
    this.puzzles?.update();
    if (this.cave && (this.cave.active || (this.cave.pendingEnter && !this.story.inDialogue && !this.puzzles.open))) {
      this.cavePlay(dt, rawDt, input);
      return;
    }
    if (this.menu && !this.story.inDialogue && !this.travelEl && !this.titleOpen && !this.puzzles.open && !this.athletics.busy) {
      if (input.wasPressed('pause')) {
        if (this.menu.open) this.menu.close();
        else this.menu.show('journal');
      }
      else if (input.wasPressed('journal')) this.menu.toggle('journal');
      else if (input.wasPressed('map')) this.menu.toggle('map');
    }
    const halted = this.paused || this.titleOpen || (this.menu?.open ?? false) || (this.puzzles?.open ?? false);
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
    const step = halted
      ? { alpha: 1 }
      : this.fixed.advance(dt, (h) => {
          this.player.fixedUpdate(h);
          physics.step(h);
        });
    this.player.render(step.alpha, halted ? 0 : dt);

    // World.
    if (!halted) this.clock.update(dt);
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
    this.world.clutter.update(focus);
    this.world.water.update(dt);
    this.specimens?.update(this.camera, this.elapsed);
    this.world.update(this.camera, dt);
    if (!this.benchRunning && !halted) {
      this.athletics.update(dt, input);
      this.story.suspended = this.athletics.busy;
      this.story.update(dt, input, this.camera.position, zone ? t(zone.nameKey) : null);
      this.state.data.playSeconds += dt;
      // Fog of war, herm discovery, autosave.
      this.fogTimer -= dt;
      if (this.fogTimer <= 0) {
        this.fogTimer = 0.5;
        const b = this.world.layout.bounds;
        this.state.revealAround(this.player.position.x, this.player.position.z, 70, b);
        for (const h of this.world.structures?.herms ?? []) {
          if (h.position.distanceTo(this.player.position) < 5) this.state.runCommand(`herm ${h.id}`);
        }
      }
      this.autosaveTimer -= dt;
      if (this.autosaveTimer <= 0) {
        this.autosaveTimer = 180;
        this.captureState();
        writeSave('auto', this.state);
      }
      const nearHerm = (this.world.structures?.herms ?? []).find((h) => h.position.distanceTo(this.player.position) < 2.6);
      if (nearHerm && !this.story.inDialogue && !this.story.hasTarget && this.state.data.discovered.herms.length > 1) {
        this.story.hud.setPrompt(input.lastDevice === 'gamepad' ? 'X' : 'F', t('herm.prompt'));
        if (input.wasPressed('interact')) this.openTravel();
      }
    }
    if (this.compass) {
      this.compass.visible = !halted && !this.story.inDialogue && !this.benchRunning;
      const obj = this.story.objectiveMarker();
      const marks: { x: number; z: number; label: string; kind: 'objective' | 'herm' }[] = obj ? [{ x: obj[0], z: obj[1], label: '', kind: 'objective' }] : [];
      for (const h of this.world.structures?.herms ?? []) {
        if (this.state.data.discovered.herms.includes(h.id) && h.position.distanceTo(this.player.position) < 300) marks.push({ x: h.position.x, z: h.position.z, label: h.id, kind: 'herm' });
      }
      this.compass.update(this.freeFly.enabled ? 0 : this.tpCamera.yaw, this.player.position, marks);
    }
    const sky = this.world.sky;
    // The lower half of the reflected environment is the land: warm earth and grass, not blue haze.
    // Sunlit ground bounces a lot of light onto walls and the undersides of eaves: scale it with the sun.
    const sunUp = THREE.MathUtils.clamp(sky.sunDir.y * 1.6, 0, 1);
    this.env?.update(dt, sky.sunDir, new THREE.Color(0.5, 0.36, 0.24).lerp(sky.fogColor, 0.12).multiplyScalar(0.4 + 2.6 * sunUp));

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
    if (!this.benchRunning && !halted) this.dynres?.update(rawDt * 1000);
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
    this.frames++;
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
