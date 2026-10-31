/**
 * Small typed event bus. Every cross-system message in the game goes through one of these,
 * so systems never import each other directly.
 *
 * Add new events to `GameEvents` (payload type per event name).
 */
type Handler<P> = (payload: P) => void;

export class EventBus<E extends object> {
  private readonly handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(type, handler);
  }

  once<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof E>(type: K, handler: Handler<E[K]>): void {
    this.handlers.get(type)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    // Copy so handlers may unsubscribe (or subscribe) while we iterate.
    for (const handler of [...set]) {
      try {
        (handler as Handler<E[K]>)(payload);
      } catch (err) {
        console.error(`[events] handler for "${String(type)}" threw`, err);
      }
    }
  }

  listenerCount<K extends keyof E>(type: K): number {
    return this.handlers.get(type)?.size ?? 0;
  }

  clear(): void {
    this.handlers.clear();
  }
}

/** All game events and their payloads. Extend per milestone. */
export interface GameEvents {
  'debug:cameraMode': { mode: 'showcase' | 'freefly' };
  'debug:overlay': { visible: boolean };
  'bench:started': { durationSec: number };
  'bench:finished': { result: import('../debug/benchmark').BenchmarkResult };
  'settings:changed': { settings: import('./settings').Settings };
}
