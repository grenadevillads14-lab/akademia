import { GameState, type GameStateData } from './state';

/**
 * Save slots in localStorage, plus export/import of save files as JSON (design §1).
 * A save is the GameState data; the clock and player position are written into it just before saving.
 */
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'] as const;
export type SlotId = (typeof SLOTS)[number];
const KEY = (s: SlotId) => `akademeia.save.${s}`;

export interface SaveMeta {
  slot: SlotId;
  savedAt: string;
  chapter: string;
  playSeconds: number;
  name: string;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function writeSave(slot: SlotId, state: GameState, store: Store | undefined = globalThis.localStorage): SaveMeta {
  const meta: SaveMeta = { slot, savedAt: new Date().toISOString(), chapter: state.data.clock.chapter, playSeconds: Math.round(state.data.playSeconds), name: state.data.player.name };
  store?.setItem(KEY(slot), JSON.stringify({ meta, data: state.data }));
  return meta;
}

export function readSave(slot: SlotId, store: Store | undefined = globalThis.localStorage): { meta: SaveMeta; state: GameState } | null {
  try {
    const raw = store?.getItem(KEY(slot));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { meta: SaveMeta; data: GameStateData };
    return { meta: parsed.meta, state: GameState.deserialize(JSON.stringify(parsed.data)) };
  } catch (err) {
    console.warn('[save] could not read slot', slot, err);
    return null;
  }
}

export function listSaves(store: Store | undefined = globalThis.localStorage): SaveMeta[] {
  return SLOTS.map((s) => readSave(s, store)?.meta).filter((m): m is SaveMeta => !!m);
}

export function deleteSave(slot: SlotId, store: Store | undefined = globalThis.localStorage): void {
  store?.removeItem(KEY(slot));
}

/** A downloadable save file. */
export function exportSave(state: GameState): Blob {
  return new Blob([JSON.stringify({ format: 'akademeia-save', version: 1, data: state.data }, null, 1)], { type: 'application/json' });
}

export function importSave(text: string): GameState {
  const parsed = JSON.parse(text) as { format?: string; data?: GameStateData };
  if (parsed.format !== 'akademeia-save' || !parsed.data) throw new Error('This is not an Akademeia save file.');
  return GameState.deserialize(JSON.stringify(parsed.data));
}

export function formatPlayTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
