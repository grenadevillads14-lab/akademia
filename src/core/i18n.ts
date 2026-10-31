/**
 * Localization. Every player-facing string goes through `t(key)`.
 * String tables live in content/i18n/<locale>.json. English is the only locale for now;
 * adding one = adding a JSON file and registering it here.
 */
import en from '../../content/i18n/en.json';

export type StringTable = Record<string, string>;
export type Vars = Record<string, string | number>;

const tables: Record<string, StringTable> = { en };
let locale = 'en';
const warned = new Set<string>();

export function createTranslator(table: StringTable, fallback: StringTable = {}) {
  return (key: string, vars?: Vars): string => {
    const raw = table[key] ?? fallback[key];
    if (raw === undefined) {
      if (!warned.has(key)) {
        warned.add(key);
        console.warn(`[i18n] missing string "${key}"`);
      }
      return key;
    }
    return vars ? raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : raw;
  };
}

let translate = createTranslator(en);

export function setLocale(next: string): void {
  const table = tables[next];
  if (!table) {
    console.warn(`[i18n] unknown locale "${next}", keeping "${locale}"`);
    return;
  }
  locale = next;
  translate = createTranslator(table, en);
}

export function getLocale(): string {
  return locale;
}

export function t(key: string, vars?: Vars): string {
  return translate(key, vars);
}
