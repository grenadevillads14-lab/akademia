import { describe, expect, it } from 'vitest';
import { FixedStep } from '../../src/core/loop';

describe('FixedStep', () => {
  it('runs one step per 1/60 s frame', () => {
    const loop = new FixedStep(1 / 60);
    let steps = 0;
    for (let i = 0; i < 60; i++) loop.advance(1 / 60, () => steps++);
    expect(steps).toBe(60);
  });

  it('accumulates short frames (120 Hz display)', () => {
    const loop = new FixedStep(1 / 60);
    let steps = 0;
    for (let i = 0; i < 120; i++) loop.advance(1 / 120, () => steps++);
    expect(steps).toBe(60);
  });

  it('runs several steps for a long frame and reports alpha', () => {
    const loop = new FixedStep(1 / 60);
    const r = loop.advance(3.5 / 60, () => {});
    expect(r.steps).toBe(3);
    expect(r.alpha).toBeCloseTo(0.5, 5);
  });

  it('caps steps per frame and drops backlog instead of spiralling', () => {
    const loop = new FixedStep(1 / 60, 5, 1);
    const r = loop.advance(0.5, () => {});
    expect(r.steps).toBe(5);
    expect(r.dropped).toBe(true);
    expect(r.alpha).toBeLessThan(1);
  });

  it('clamps huge deltas (tab switch) and ignores negative ones', () => {
    const loop = new FixedStep(1 / 60, 100, 0.25);
    expect(loop.advance(10, () => {}).steps).toBe(15);
    expect(loop.advance(-1, () => {}).steps).toBe(0);
  });
});
