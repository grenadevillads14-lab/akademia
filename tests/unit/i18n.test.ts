import { describe, expect, it, vi } from 'vitest';
import { createTranslator, t } from '../../src/core/i18n';
import en from '../../content/i18n/en.json';

describe('i18n', () => {
  it('interpolates variables', () => {
    const tr = createTranslator({ hi: 'Chaire, {name}! {n} scrolls.' });
    expect(tr('hi', { name: 'Aristotle', n: 3 })).toBe('Chaire, Aristotle! 3 scrolls.');
  });

  it('returns the key and warns once for missing strings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tr = createTranslator({});
    expect(tr('nope.missing')).toBe('nope.missing');
    tr('nope.missing');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('uses the fallback table', () => {
    const tr = createTranslator({}, { a: 'A' });
    expect(tr('a')).toBe('A');
  });

  it('ships an English table with the game title', () => {
    expect(t('game.title')).toBe('Akademeia');
    for (const value of Object.values(en)) expect(value.trim().length).toBeGreaterThan(0);
  });
});
