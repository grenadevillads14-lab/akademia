import * as THREE from 'three';
import type { Settings } from '../core/settings';
import type { Physics } from '../physics/physics';
import { Crowd } from '../npc/crowd';
import { loadTextureArray, phTextureUrl, type MaterialLib, type TexId } from '../render/materialLib';
import type { ModelLib } from '../render/modelLib';
import { buildForest, type Forest } from '../vegetation/forest';
import { createGrass, type Grass } from '../vegetation/grass';
import { buildBackdrop } from './backdrop';
import { createHeightfield, type Heightfield } from './heightfield';
import { parseLayout, type Layout } from './layout';
import { createSky, type SkySystem } from './sky';
import { buildStructures, type Poi, type Structures } from './structures';
import { buildTerrain, type GroundLayers, type Terrain } from './terrain';
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
  readonly structures: Structures | null;
  readonly crowd: Crowd;
  /** All points of interest: structures + named trees (moriai, the teaching plane). */
  readonly pois: Poi[];
  readonly root: THREE.Group;
  /** Per-frame updates of LODs and ambient life. */
  update(camera: THREE.Camera, dt: number): void;
  /** Zone the given point is in (closest centre within radius), or null. */
  zoneAt(x: number, z: number): Layout['zones'][number] | null;
  dispose(): void;
}

const layouts = import.meta.glob('../../content/world/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export function loadLayoutData(id: string): { layout: Layout; vegetation: unknown; structures: unknown } {
  const layoutData = layouts[`../../content/world/${id}.json`];
  if (!layoutData) throw new Error(`Unknown world "${id}"`);
  return {
    layout: parseLayout(layoutData),
    vegetation: layouts[`../../content/world/${id}.vegetation.json`] ?? { rules: [] },
    structures: layouts[`../../content/world/${id}.structures.json`] ?? null,
  };
}

/** Photographic ground layers, in SURFACE_LAYERS order (grass, dry, dirt, rock, sand, mud, paving, road). */
const GROUND: { id: TexId; metres: number }[] = [
  { id: 'sparse_grass', metres: 4 },
  { id: 'dry_ground_01', metres: 4 },
  { id: 'gravelly_sand', metres: 3.5 },
  { id: 'rock_face', metres: 6 },
  { id: 'sand_01', metres: 3 },
  { id: 'brown_mud', metres: 4 },
  { id: 'rock_tile_floor', metres: 3.5 },
  { id: 'rocky_trail', metres: 4.5 },
];

async function loadGroundLayers(): Promise<GroundLayers> {
  const [diff, nor] = await Promise.all([
    loadTextureArray(GROUND.map((g) => phTextureUrl(g.id, 'diff')), 1024, true),
    loadTextureArray(GROUND.map((g) => phTextureUrl(g.id, 'nor')), 512, false),
  ]);
  return { diff, nor, metres: GROUND.map((g) => g.metres) };
}

export async function buildWorld(
  id: string,
  ctx: {
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    physics: Physics;
    uniforms: WorldUniforms;
    settings: Settings;
    lib: MaterialLib;
    models: ModelLib;
    progress?: (step: string) => Promise<void>;
  },
): Promise<World> {
  const step = ctx.progress ?? (async () => {});
  const { layout, vegetation, structures: structuresData } = loadLayoutData(id);
  const hf = createHeightfield(layout);
  const g = ctx.settings.graphics;

  await step('loading.terrain');
  const ground = await loadGroundLayers();
  const terrain = buildTerrain(hf, ctx.physics, ctx.uniforms, ground);
  const root = new THREE.Group();
  root.name = `world-${id}`;
  root.add(terrain.group);

  root.add(await buildBackdrop(layout, ctx.lib, hf.height));

  await step('loading.water');
  const water = createWater(hf, ctx.uniforms);
  root.add(water.group);

  await step('loading.sky');
  const sky = createSky(ctx.scene, ctx.renderer, ctx.uniforms, { shadowMapSize: g.shadowMapSize, shadows: g.shadows });

  await step('loading.trees');
  const plants = planVegetation(parseVegetationPlan(vegetation), hf);
  const bark = await loadTextureArray([phTextureUrl('bark_brown_02', 'diff'), phTextureUrl('bark_platanus', 'diff')], 512, true);
  const forest = buildForest(plants, {
    renderer: ctx.renderer,
    uniforms: ctx.uniforms,
    sunDir: sky.sunDir,
    heightAt: hf.height,
    drawDistance: g.drawDistance,
    shadows: g.shadows,
    bark,
  });
  root.add(forest.group);

  await step('loading.grass');
  const grass = createGrass(terrain, ctx.uniforms, { density: g.vegetationDensity, radius: g.preset === 'low' ? 24 : g.preset === 'medium' ? 34 : 48 });
  root.add(grass.mesh);

  await step('loading.city');
  const detail = g.preset === 'low' ? 0.5 : g.preset === 'medium' ? 0.8 : 1;
  const structures = structuresData
    ? await buildStructures(structuresData, { hf, lib: ctx.lib, models: ctx.models, physics: ctx.physics, shadows: g.shadows, detail })
    : null;
  if (structures) root.add(structures.group);

  await step('loading.people');
  const crowd = new Crowd(hf.height, layout.seed);
  const road = layout.paths.find((p) => p.id === 'road_academy');
  const crowdScale = g.preset === 'low' ? 0.5 : g.preset === 'medium' ? 0.8 : 1;
  if (road) crowd.addWalkers(road.points, Math.round(24 * crowdScale), 5);
  const lane = layout.paths.find((p) => p.id === 'kerameikos_lane');
  if (lane) crowd.addWalkers(lane.points, Math.round(6 * crowdScale), 1.5);
  const sacred = layout.paths.find((p) => p.id === 'sacred_way');
  if (sacred) crowd.addWalkers(sacred.points.slice(0, 3), Math.round(6 * crowdScale), 2);
  for (const [x, z, n, r] of [[441, 497, 5, 1.6], [449, 514, 4, 1.3], [418, 476, 3, 1.2]] as const) crowd.addGroup(x, z, n, r);
  root.add(crowd.group);

  const pois: Poi[] = [...(structures?.pois ?? [])];
  for (const p of plants) if (p.id) pois.push({ id: p.id, kind: p.species === 'moria' ? 'moria' : 'tree', position: new THREE.Vector3(p.x, hf.height(p.x, p.z), p.z) });

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
    structures,
    crowd,
    pois,
    root,
    update(camera, dt) {
      structures?.update(camera, dt);
      crowd.update(dt, camera);
    },
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
      structures?.dispose();
      crowd.dispose();
      ground.diff.dispose();
      ground.nor.dispose();
    },
  };
}
