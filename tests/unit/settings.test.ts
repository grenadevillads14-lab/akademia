import { describe, expect, it } from 'vitest';
import { defaultSettings, loadSettings, pickDefaultPreset, saveSettings } from '../../src/core/settings';

describe('pickDefaultPreset', () => {
  it.each([
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'low'],
    ['llvmpipe (LLVM 15.0.7, 256 bits)', 'low'],
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)', 'medium'],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['Apple M1', 'medium'],
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11)', 'high'],
    ['Apple M3 Pro', 'high'],
    ['something unknown', 'medium'],
  ])('%s → %s', (gpu, preset) => {
    expect(pickDefaultPreset(gpu)).toBe(preset);
  });
});

describe('settings persistence', () => {
  it('round-trips through storage', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const s = defaultSettings('Intel UHD');
    s.graphics.renderScale = 0.6;
    s.accessibility.reducedMotion = true;
    saveSettings(s, storage);
    const loaded = loadSettings('Intel UHD', storage);
    expect(loaded.graphics.renderScale).toBe(0.6);
    expect(loaded.accessibility.reducedMotion).toBe(true);
  });

  it('falls back to defaults on corrupt data', () => {
    const storage = { getItem: () => '{not json' };
    const warn = console.warn;
    console.warn = () => {};
    expect(loadSettings('Intel UHD', storage).graphics.preset).toBe('medium');
    console.warn = warn;
  });

  it('defaults do not share mutable preset objects', () => {
    const a = defaultSettings('Intel');
    const b = defaultSettings('Intel');
    a.graphics.post.ao = false;
    expect(b.graphics.post.ao).toBe(true);
  });
});
