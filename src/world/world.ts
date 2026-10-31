import * as THREE from 'three';
import type { Settings } from '../core/settings';
import type { Physics } from '../physics/physics';
import { buildForest, type Forest } from '../vegetation/forest';
import { createGrass, type Grass } from '../vegetation/grass';
import { createHeightfield, type Heightfield } from './heightfield';
import { parseLayout, type Layout } from './layout';
import { createSky, type SkySystem } from './sky';
import { buildTerrain, type Terrain } from './terrain';
import type { WorldUniforms } from './uniforms';
import { parseVegetationPlan, planVegetation } from './vegetationPlan';
import { createWater, type WaterSystem } from './water';

/**
 * A loaded world map (the Academy, later the Lyceum, the Cave, Lesbos): terrain, water, vegetation,
 * sky and lights, all built from content/world/<id>.json files.
 */
export interface World {
  readonly id: string;
  readonly layout: Layout;
  readonly hf: Heightfield;
  readonly terrain: Terrain;
  readonly water: WaterSystem;
  readonly forest: Forest;
  readonly grass: Grass;
  readonly sky: SkySystem;
  readonly root: THREE.Group;
  /** Zone the given point is in (closest centre within radius), or null. */
  zoneAt(x: number, z: number): Layout['zones'][number] | null;
  dispose(): void;
}

const layouts = import.meta.glob('../../content/world/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export function loadLayoutData(id: string): { layout: Layout; vegetation: unknown } {
  const layoutData = layouts[`../../content/world/${id}.json`];
  if (!layoutData) throw new Error(`Unknown world "${id}"`);
  return { layout: parseLayout(layoutData), vegetation: layouts[`../../content/world/${id}.vegetation.json`] ?? { rules: [] } };
}

export async function buildWorld(
  id: string,
  ctx: {
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    physics: Physics;
    uniforms: WorldUniforms;
    settings: Settings;
    progress?: (step: string) => Promise<void>;
  },
): Promise<World> {
  const step = ctx.progress ?? (async () => {});
  const { layout, vegetation } = loadLayoutData(id);
  const hf = createHeightfield(layout);
  const g = ctx.settings.graphics;

  await step('loading.terrain');
  const terrain = buildTerrain(hf, ctx.physics, ctx.uniforms);
  const root = new THREE.Group();
  root.name = `world-${id}`;
  root.add(terrain.group);

  await step('loading.water');
  const water = createWater(hf, ctx.uniforms);
  root.add(water.group);

  await step('loading.sky');
  const sky = createSky(ctx.scene, ctx.renderer, ctx.uniforms, { shadowMapSize: g.shadowMapSize, shadows: g.shadows });

  await step('loading.trees');
  const plants = planVegetation(parseVegetationPlan(vegetation), hf);
  const forest = buildForest(plants, {
    renderer: ctx.renderer,
    uniforms: ctx.uniforms,
    sunDir: sky.sunDir,
    heightAt: hf.height,
    drawDistance: g.drawDistance,
    shadows: g.shadows,
  });
  root.add(forest.group);

  await step('loading.grass');
  const grass = createGrass(terrain, ctx.uniforms, { density: g.vegetationDensity, radius: g.preset === 'low' ? 22 : g.preset === 'medium' ? 30 : 40 });
  root.add(grass.mesh);

  ctx.scene.add(root);

  return {
    id,
    layout,
    hf,
    terrain,
    water,
    forest,
    grass,
    sky,
    root,
    zoneAt(x, z) {
      let best: Layout['zones'][number] | null = null;
      let bestD = Infinity;
      for (const zn of layout.zones) {
        const d = Math.hypot(x - zn.center[0], z - zn.center[1]);
        if (d < zn.radius && d / zn.radius < bestD) {
          best = zn;
          bestD = d / zn.radius;
        }
      }
      return best;
    },
    dispose() {
      ctx.scene.remove(root);
      terrain.dispose();
      water.dispose();
      forest.dispose();
      grass.dispose();
      sky.dispose();
    },
  };
}
