import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import layoutData from '../../content/world/academy.json';
import vegData from '../../content/world/academy.vegetation.json';
import { Frame, worldUvs } from '../../src/architecture/kit';
import { closestOnPolyline } from '../../src/procgen/geometry2d';
import { fbm, noise2, noise2Periodic } from '../../src/procgen/noise';
import { sunDirection, elevationDeg, WorldClock } from '../../src/world/clock';
import { createHeightfield } from '../../src/world/heightfield';
import { parseLayout } from '../../src/world/layout';
import { parseVegetationPlan, planVegetation } from '../../src/world/vegetationPlan';

const layout = parseLayout(layoutData);
const hf = createHeightfield(layout);

describe('world layout', () => {
  it('validates against the schema', () => {
    expect(layout.id).toBe('academy');
    expect(layout.paths.find((p) => p.id === 'road_academy')).toBeTruthy();
  });

  it('flattens the gymnasium and carves the Cephissus', () => {
    const centre = hf.height(0, 0);
    expect(Math.abs(hf.height(10, 10) - centre)).toBeLessThan(0.05);
    const river = layout.rivers.find((r) => r.id === 'cephissus')!;
    const [x, z] = river.points[3]!;
    const bank = hf.height(x + river.width / 2 + river.bank + 6, z);
    expect(hf.height(x, z)).toBeLessThan(bank - 1.5);
    expect(hf.water(x, z).level).toBeGreaterThan(hf.height(x, z));
  });

  it('has no grass on roads', () => {
    const road = layout.paths.find((p) => p.id === 'road_academy')!;
    const [x, z] = road.points[2]!;
    expect(hf.grassDensity(x, z)).toBe(0);
  });
});

describe('planting plan', () => {
  const plants = planVegetation(parseVegetationPlan(vegData), hf);

  it('places all twelve moriai at their fixed spots', () => {
    const moriai = plants.filter((p) => p.species === 'moria');
    expect(moriai).toHaveLength(12);
    expect(moriai.map((p) => p.id)).toContain('moria-1');
  });

  it('keeps scattered trees off paths', () => {
    const olives = plants.filter((p) => p.species === 'olive');
    expect(olives.length).toBeGreaterThan(200);
    for (const o of olives) {
      for (const path of layout.paths) expect(closestOnPolyline(o.x, o.z, path.points).dist).toBeGreaterThan(path.width / 2);
    }
  });

  it('is deterministic', () => {
    const again = planVegetation(parseVegetationPlan(vegData), hf);
    expect(again.length).toBe(plants.length);
    expect(again[50]).toEqual(plants[50]);
  });
});

describe('architecture kit', () => {
  it('Frame maps local axes like three.js rotation.y', () => {
    const f = new Frame(10, 20, Math.PI / 2, 0);
    const [x, z] = f.toWorld(0, 1); // local +Z
    const v = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, Math.PI / 2, 0));
    expect(x - 10).toBeCloseTo(v.x, 6);
    expect(z - 20).toBeCloseTo(v.z, 6);
  });

  it('gives metre-scale UVs on every face', () => {
    const g = new THREE.BoxGeometry(4, 2, 6).toNonIndexed();
    worldUvs(g);
    const uv = g.attributes.uv!;
    let maxU = 0;
    for (let i = 0; i < uv.count; i++) maxU = Math.max(maxU, Math.abs(uv.getX(i)));
    expect(maxU).toBeCloseTo(3, 5); // half of the 6 m side
  });
});

describe('noise and sun', () => {
  it('periodic noise tiles', () => {
    expect(noise2Periodic(0.3, 0.7, 4, 4, 1)).toBeCloseTo(noise2Periodic(4.3, 4.7, 4, 4, 1), 6);
  });
  it('noise is bounded and deterministic', () => {
    for (let i = 0; i < 200; i++) expect(Math.abs(noise2(i * 0.37, i * 0.91, 3))).toBeLessThanOrEqual(1.01);
    expect(fbm(1.1, 2.2, 4, 9)).toBe(fbm(1.1, 2.2, 4, 9));
  });
  it('puts the summer noon sun high over Athens and the winter noon sun low', () => {
    const summer = elevationDeg(sunDirection(12, 172));
    const winter = elevationDeg(sunDirection(12, 355));
    expect(summer).toBeGreaterThan(70);
    expect(summer).toBeLessThan(80);
    expect(winter).toBeGreaterThan(24);
    expect(winter).toBeLessThan(33);
  });
  it('sets in the west', () => {
    const [x] = sunDirection(18.5, 172);
    expect(x).toBeLessThan(0);
  });
  it('clock wraps days', () => {
    const c = new WorldClock({ hours: 23.9, dayLengthSec: 24 });
    c.update(0.2);
    expect(c.day).toBe(1);
    expect(c.hours).toBeLessThan(1);
  });
});
