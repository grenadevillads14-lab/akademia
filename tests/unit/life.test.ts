import { describe, expect, it } from 'vitest';
import layoutData from '../../content/world/academy.json';
import vegData from '../../content/world/academy.vegetation.json';
import lifeData from '../../content/world/academy.life.json';
import { parseAppearance } from '../../src/characters/appearance';
import { lifeAppearance, LifeRole, LifeSchema, sceneFigures } from '../../src/npc/life';
import { mulberry32 } from '../../src/procgen/rng';
import { createHeightfield } from '../../src/world/heightfield';
import { parseLayout } from '../../src/world/layout';
import { parseVegetationPlan, planVegetation } from '../../src/world/vegetationPlan';
import { loadStory } from '../../src/game/story';

const layout = parseLayout(layoutData);
const hf = createHeightfield(layout);
const life = LifeSchema.parse(lifeData);

describe('Academy life', () => {
  it('walks only on paths that exist', () => {
    for (const w of life.walkers) expect(layout.paths.find((p) => p.id === w.path), w.path).toBeTruthy();
  });

  it('makes valid appearances for every role', () => {
    const rng = mulberry32(1);
    for (const role of LifeRole.options) for (let i = 0; i < 20; i++) expect(() => parseAppearance(lifeAppearance(rng, role)), role).not.toThrow();
  });

  const rng = mulberry32(7);
  const figures = life.scenes.flatMap((s) => sceneFigures(s, rng).map((f) => ({ ...f, scene: s.id })));

  it('expands every scene into people', () => {
    expect(figures.length).toBeGreaterThan(40);
    expect(new Set(life.scenes.map((s) => s.id)).size).toBe(life.scenes.length);
  });

  it('keeps everyone on dry, gentle ground', () => {
    for (const f of figures) {
      expect(hf.water(f.x, f.z).level, f.scene).toBeLessThan(hf.height(f.x, f.z));
      const slope = Math.abs(hf.height(f.x + 0.5, f.z) - hf.height(f.x - 0.5, f.z)) + Math.abs(hf.height(f.x, f.z + 0.5) - hf.height(f.x, f.z - 0.5));
      expect(slope, f.scene).toBeLessThan(0.35);
    }
  });

  it('puts nobody inside a tree trunk', () => {
    const trees = planVegetation(parseVegetationPlan(vegData), hf).filter((p) => p.species !== 'reed' && p.species !== 'myrtle');
    for (const f of figures) {
      const hit = trees.find((t) => Math.hypot(t.x - f.x, t.z - f.z) < 0.9 + (t.scale ?? 1) * 0.3);
      expect(hit, `${f.scene} at ${f.x.toFixed(1)},${f.z.toFixed(1)}: ${hit?.species}`).toBeUndefined();
    }
  });

  it('has statues with valid appearances, clear of trees and people', () => {
    expect(life.statues.length).toBeGreaterThanOrEqual(4);
    const trees = planVegetation(parseVegetationPlan(vegData), hf).filter((p) => p.species !== 'reed' && p.species !== 'myrtle');
    for (const st of life.statues) {
      expect(() => parseAppearance(st.appearance), st.id).not.toThrow();
      expect(trees.find((t) => Math.hypot(t.x - st.x, t.z - st.z) < 1.8), st.id).toBeUndefined();
      for (const f of figures) expect(Math.hypot(f.x - st.x, f.z - st.z), `${st.id} vs ${f.scene}`).toBeGreaterThan(1.6);
    }
  });

  it('stays clear of where story characters stand', () => {
    const story = loadStory();
    const spots: [number, number][] = [];
    for (const n of story.npcs) if ('x' in n && typeof n.x === 'number' && typeof n.z === 'number') spots.push([n.x, n.z]);
    for (const f of figures) for (const [x, z] of spots) expect(Math.hypot(x - f.x, z - f.z), f.scene).toBeGreaterThan(2.5);
  });
});
