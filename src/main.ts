import * as THREE from 'three';
import './ui/styles.css';
import { EventBus, type GameEvents } from './core/events';
import { t } from './core/i18n';
import { Input } from './core/input';
import { FixedStep } from './core/loop';
import { loadSettings, PRESETS, type QualityPreset } from './core/settings';
import { Benchmark, type CameraPath } from './debug/benchmark';
import { FrameStats } from './debug/frameStats';
import { FreeFlyCamera } from './debug/freeFlyCamera';
import { DebugOverlay } from './debug/overlay';
import { initPhysics } from './physics/physics';
import { createRenderer, detectGpu, onResize } from './render/renderer';
import { buildSandbox } from './scenes/sandbox';

/**
 * Boot sequence. URL parameters (all optional):
 *   ?bench[=seconds]   run the benchmark camera path and show a report
 *   ?preset=low|medium|high|ultra   override graphics preset for this session
 *   ?stress=N          add N instanced stones (instancing / draw-call check)
 *   ?overlay=0         start with the stats overlay hidden
 *   ?settle            pre-simulate physics before the first frame (used for screenshots)
 */
async function boot(): Promise<void> {
  const app = document.getElementById('app')!;
  const loading = document.getElementById('loading')!;
  const loadingText = loading.querySelector<HTMLElement>('.loading-status')!;
  loadingText.textContent = t('loading.physics');

  const params = new URLSearchParams(location.search);
  const gpu = detectGpu();
  if (gpu === 'no-webgl2') {
    loadingText.textContent = t('error.webgl');
    return;
  }

  const settings = loadSettings(gpu);
  const presetParam = params.get('preset') as QualityPreset | null;
  if (presetParam && presetParam in PRESETS) {
    settings.graphics = { ...PRESETS[presetParam], post: { ...PRESETS[presetParam].post } };
  }
  const gfx = settings.graphics;

  const bus = new EventBus<GameEvents>();
  const renderer = createRenderer(app, gfx);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);
  camera.position.set(22, 9, 24);
  camera.lookAt(0, 3, -8);

  const physics = await initPhysics();
  const sandbox = buildSandbox(scene, physics, {
    stress: Math.max(0, Math.min(200_000, Number(params.get('stress') ?? 0) || 0)),
    shadowMapSize: gfx.shadowMapSize,
  });
  // ?settle: pre-simulate physics so props are at rest on the first frame (repeatable screenshots).
  if (params.has('settle')) {
    for (let i = 0; i < 60 * 8; i++) physics.step(1 / 60);
    sandbox.update();
  }

  const input = new Input(renderer.domElement);
  const freeFly = new FreeFlyCamera(camera);
  const overlay = new DebugOverlay(app, params.get('overlay') !== '0');
  const stats = new FrameStats(240);
  const fixed = new FixedStep(1 / 60);

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = t('hint.debug');
  app.appendChild(hint);

  // Showcase camera: slow orbit until the player character exists (M1).
  let orbit = 0.6;
  const orbitTarget = new THREE.Vector3(0, 3, -10);
  const showcase = (dt: number) => {
    orbit += dt * 0.05;
    camera.position.set(Math.sin(orbit) * 32, 10 + Math.sin(orbit * 0.7) * 2, Math.cos(orbit) * 32 - 10);
    camera.lookAt(orbitTarget);
  };

  const benchPath: CameraPath = (u, cam) => {
    const a = u * Math.PI * 2;
    const r = 45 - 25 * Math.sin(u * Math.PI);
    cam.position.set(Math.sin(a) * r, 4 + 10 * (1 - Math.sin(u * Math.PI)), Math.cos(a) * r - 10);
    cam.lookAt(0, 2.5, -10);
  };
  let bench: Benchmark | null = null;
  const benchRunning = () => bench !== null && !bench.finished;
  // The benchmark always renders at a fixed 1920×1080 internal resolution, whatever the window size,
  // so results from a small panel and a full screen are comparable. The canvas is letterboxed meanwhile.
  const BENCH_W = 1920;
  const BENCH_H = 1080;
  const setBenchResolution = (on: boolean) => {
    renderer.domElement.classList.toggle('bench-fixed', on);
    if (on) {
      renderer.setPixelRatio(1);
      renderer.setSize(BENCH_W, BENCH_H, false);
      camera.aspect = BENCH_W / BENCH_H;
      camera.updateProjectionMatrix();
    } else {
      onResize(renderer, camera, gfx);
    }
  };
  const startBenchmark = (secs: number) => {
    if (benchRunning()) return;
    if (freeFly.enabled) setCameraMode('showcase');
    document.querySelector('.bench-report')?.remove();
    setBenchResolution(true);
    bench = new Benchmark(app, benchPath, { scene: 'm0-sandbox', gpu, preset: gfx.preset }, secs);
    benchButton.hidden = true;
    bus.emit('bench:started', { durationSec: secs });
  };

  // Visible button so players can benchmark without typing URL parameters (and in hosts,
  // like the claude.ai preview, where query strings can't be passed).
  const benchButton = document.createElement('button');
  benchButton.className = 'bench-button';
  benchButton.type = 'button';
  benchButton.textContent = t('bench.start');
  benchButton.addEventListener('click', () => startBenchmark(20));
  app.appendChild(benchButton);

  if (params.has('bench') || location.hash === '#bench') {
    startBenchmark(Number(params.get('bench')) || 20);
  }

  renderer.domElement.addEventListener('click', () => {
    if (freeFly.enabled) input.requestPointerLock();
  });

  const setCameraMode = (mode: 'showcase' | 'freefly') => {
    if (mode === 'freefly') freeFly.enable();
    else {
      freeFly.disable();
      input.exitPointerLock();
    }
    hint.textContent = mode === 'freefly' ? t('hint.freefly') : t('hint.debug');
    bus.emit('debug:cameraMode', { mode });
  };

  window.addEventListener('resize', () => {
    if (!benchRunning()) onResize(renderer, camera, gfx);
  });

  const handle: AkademeiaDebugHandle = {
    ready: false,
    bench: null,
    stats: () => ({
      fps: Math.round(stats.avgFps()),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      bodies: physics.bodyCount,
      gpu,
      preset: gfx.preset,
    }),
    setCamera: (pos, target) => {
      if (!freeFly.enabled) setCameraMode('freefly');
      camera.position.set(...pos);
      camera.lookAt(...target);
      freeFly.enable(); // re-read yaw/pitch from the new orientation
    },
  };
  window.__akademeia = handle;

  const timer = new THREE.Timer();
  timer.connect(document); // pauses delta accumulation while the tab is hidden
  let framesRendered = 0;
  const gl = renderer.getContext();
  renderer.setAnimationLoop((time) => {
    const frameStart = performance.now();
    timer.update(time);
    const dt = timer.getDelta();

    if (input.wasPressed('toggleDebugCamera') && !benchRunning()) setCameraMode(freeFly.enabled ? 'showcase' : 'freefly');
    if (input.wasPressed('toggleOverlay')) bus.emit('debug:overlay', { visible: overlay.toggle() });
    if (input.wasPressed('debugRespawn')) sandbox.dropObjects();

    fixed.advance(dt, (h) => physics.step(h));
    sandbox.update();

    if (benchRunning()) {
      /* the benchmark drives the camera */
    } else if (freeFly.enabled) freeFly.update(dt, input, input.pointerLocked);
    else showcase(dt);

    renderer.info.reset();
    renderer.render(scene, camera);
    // During a benchmark, wait for the GPU to finish so we measure the real cost of a frame
    // (CPU + GPU). That shows spare capacity even when fps is capped by the display's refresh rate.
    let workMs = 0;
    if (benchRunning()) {
      gl.finish();
      workMs = performance.now() - frameStart;
    }
    stats.push(dt * 1000);
    overlay.update(dt, stats, renderer.info, {
      bodies: physics.bodyCount,
      preset: gfx.preset,
      gpu,
      camera: freeFly.enabled ? 'free-fly' : benchRunning() ? 'benchmark' : 'showcase',
    });

    if (bench && benchRunning()) {
      const result = bench.update(dt, camera, renderer.info, workMs);
      if (result) {
        setBenchResolution(false);
        benchButton.hidden = false;
        handle.bench = result;
        bus.emit('bench:finished', { result });
        console.info('[bench]', JSON.stringify(result));
      }
    }

    input.endFrame();
    if (++framesRendered === 2) {
      loading.classList.add('done');
      handle.ready = true;
    }
  });
}

boot().catch((err: unknown) => {
  console.error(err);
  const status = document.querySelector('#loading .loading-status');
  if (status) status.textContent = String(err);
});
