import './ui/styles.css';
import { t } from './core/i18n';
import { loadSettings, PRESETS, type QualityPreset } from './core/settings';
import { Game } from './game/game';
import { initPhysics } from './physics/physics';
import { createRenderer, detectGpu } from './render/renderer';

/**
 * Boot. URL parameters (all optional):
 *   ?bench[=seconds]   run the benchmark flight and show a report (also #bench, or the button)
 *   ?preset=low|medium|high|ultra   override the graphics preset for this session
 *   ?time=18.5 ?season=summer ?timescale=60   world clock overrides
 *   ?at=x,z            spawn somewhere else (debug)
 *   ?overlay=1|0       show/hide the stats overlay (shown by default in dev builds)
 */
async function boot(): Promise<void> {
  const app = document.getElementById('app')!;
  const loading = document.getElementById('loading')!;
  const status = loading.querySelector<HTMLElement>('.loading-status')!;
  const setLoading = async (text: string) => {
    status.textContent = text;
    // Two frames so the text actually paints before the next blocking step.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };
  await setLoading(t('loading.physics'));

  const params = new URLSearchParams(location.search);
  const gpu = detectGpu();
  if (gpu === 'no-webgl2') {
    status.textContent = t('error.webgl');
    return;
  }
  const settings = loadSettings(gpu);
  const presetParam = params.get('preset') as QualityPreset | null;
  if (presetParam && presetParam in PRESETS) settings.graphics = { ...PRESETS[presetParam], post: { ...PRESETS[presetParam].post } };

  const renderer = createRenderer(app, settings.graphics);
  const physics = await initPhysics();
  const game = new Game({ app, renderer, physics, settings, gpu, params, setLoading });

  const benchButton = document.createElement('button');
  benchButton.className = 'bench-button';
  benchButton.type = 'button';
  benchButton.textContent = t('bench.start');
  benchButton.addEventListener('click', (e) => {
    e.stopPropagation();
    game.startBenchmark(20);
  });

  window.__akademeia = {
    ready: false,
    bench: null,
    stats: () => ({
      fps: 0,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      bodies: physics.bodyCount,
      gpu,
      preset: settings.graphics.preset,
    }),
    setCamera: () => {},
  };

  await game.start();
  app.appendChild(benchButton);
  game.bus.on('bench:started', () => (benchButton.hidden = true));
  game.bus.on('bench:finished', ({ result }) => {
    benchButton.hidden = false;
    window.__akademeia!.bench = result;
  });
  const handle = window.__akademeia;
  handle.setCamera = (pos, target) => game.debugSetCamera(pos, target);
  handle.game = game;
  const wait = () => {
    if (game.ready) {
      loading.classList.add('done');
      handle.ready = true;
    } else requestAnimationFrame(wait);
  };
  wait();
}

boot().catch((err: unknown) => {
  console.error(err);
  const status = document.querySelector('#loading .loading-status');
  if (status) status.textContent = String(err);
});
