/**
 * Player settings. Graphics presets are the main lever for hitting
 * 60 fps on integrated GPUs (medium) and 30+ fps on weak ones (low).
 */
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

export interface GraphicsSettings {
  preset: QualityPreset;
  /** Multiplier on the device pixel ratio (dynamic resolution later). */
  renderScale: number;
  /** Cap on devicePixelRatio, so 4K/retina laptops don't render 4× the pixels. */
  maxPixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: 512 | 1024 | 2048 | 4096;
  /** 0..1 multiplier on grass and ground-cover instance counts. */
  vegetationDensity: number;
  /** View distance in metres before far LOD/impostors take over. */
  drawDistance: number;
  post: { ao: boolean; bloom: boolean; godRays: boolean; dof: boolean };
}

export interface Settings {
  version: 1;
  graphics: GraphicsSettings;
  accessibility: { reducedMotion: boolean; textScale: number };
  locale: string;
}

export const PRESETS: Record<QualityPreset, GraphicsSettings> = {
  low: {
    preset: 'low',
    renderScale: 0.75,
    maxPixelRatio: 1,
    antialias: false,
    shadows: true,
    shadowMapSize: 1024,
    vegetationDensity: 0.35,
    drawDistance: 350,
    post: { ao: false, bloom: false, godRays: false, dof: false },
  },
  medium: {
    preset: 'medium',
    renderScale: 1,
    maxPixelRatio: 2,
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    vegetationDensity: 0.6,
    drawDistance: 600,
    post: { ao: true, bloom: true, godRays: false, dof: true },
  },
  high: {
    preset: 'high',
    renderScale: 1,
    maxPixelRatio: 2,
    antialias: true,
    shadows: true,
    shadowMapSize: 4096,
    vegetationDensity: 0.85,
    drawDistance: 900,
    post: { ao: true, bloom: true, godRays: true, dof: true },
  },
  ultra: {
    preset: 'ultra',
    renderScale: 1,
    maxPixelRatio: 2,
    antialias: true,
    shadows: true,
    shadowMapSize: 4096,
    vegetationDensity: 1,
    drawDistance: 1400,
    post: { ao: true, bloom: true, godRays: true, dof: true },
  },
};

/**
 * Pick a starting preset from the WebGL renderer string. The player can always override.
 * Heuristic only: integrated GPUs start at medium, software rasterizers at low.
 */
export function pickDefaultPreset(gpu: string): QualityPreset {
  const g = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software|microsoft basic render/.test(g)) return 'low';
  if (/apple m\d/.test(g)) return 'high'; // dynamic resolution keeps 60 fps on Apple silicon
  if (/(intel|uhd|iris|mali|adreno|powervr|radeon\(tm\) graphics|radeon graphics)/.test(g)) {
    return 'medium';
  }
  if (/(rtx|radeon rx|apple m[2-9]|apple m1 (pro|max|ultra)|geforce gtx 1[6-9]|arc a)/.test(g)) return 'high';
  return 'medium';
}

export function defaultSettings(gpu = ''): Settings {
  const preset = PRESETS[pickDefaultPreset(gpu)];
  return {
    version: 1,
    graphics: { ...preset, post: { ...preset.post } },
    accessibility: { reducedMotion: false, textScale: 1 },
    locale: 'en',
  };
}

const STORAGE_KEY = 'akademeia.settings';

export function loadSettings(gpu: string, storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Settings {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      if (parsed.version === 1 && parsed.graphics) {
        const base = defaultSettings(gpu);
        return {
          ...base,
          ...parsed,
          graphics: { ...base.graphics, ...parsed.graphics, post: { ...base.graphics.post, ...parsed.graphics.post } },
          accessibility: { ...base.accessibility, ...parsed.accessibility },
        };
      }
    }
  } catch (err) {
    console.warn('[settings] could not read saved settings, using defaults', err);
  }
  return defaultSettings(gpu);
}

export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch (err) {
    console.warn('[settings] could not save settings', err);
  }
}
