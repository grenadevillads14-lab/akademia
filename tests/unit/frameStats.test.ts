import { describe, expect, it } from 'vitest';
import { FrameStats, lowFps, percentile } from '../../src/debug/frameStats';

describe('FrameStats', () => {
  it('averages frame times into fps', () => {
    const s = new FrameStats(10);
    for (let i = 0; i < 10; i++) s.push(1000 / 60);
    expect(s.avgFps()).toBeCloseTo(60, 5);
  });

  it('is a ring buffer of the most recent samples', () => {
    const s = new FrameStats(3);
    [100, 100, 10, 10, 10].forEach((v) => s.push(v));
    expect(s.size).toBe(3);
    expect(s.avgMs()).toBe(10);
  });

  it('reports 1% lows from the slowest frames', () => {
    const values = Array.from({ length: 100 }, (_, i) => (i === 0 ? 50 : 10));
    expect(lowFps(values, 0.01)).toBe(20);
    expect(percentile(values, 50)).toBe(10);
    expect(percentile(values, 100)).toBe(50);
  });

  it('handles empty input', () => {
    expect(new FrameStats().avgFps()).toBe(0);
    expect(percentile([], 99)).toBe(0);
  });
});
