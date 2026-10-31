/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface AkademeiaDebugHandle {
  ready: boolean;
  /** Latest benchmark result, if one ran (`?bench`). */
  bench: import('./debug/benchmark').BenchmarkResult | null;
  stats(): {
    fps: number;
    drawCalls: number;
    triangles: number;
    bodies: number;
    gpu: string;
    preset: string;
  };
  /** Place the camera; used by Playwright to take repeatable screenshots. */
  setCamera(pos: [number, number, number], target: [number, number, number]): void;
  game?: import('./game/game').Game;
}

interface Window {
  __akademeia?: AkademeiaDebugHandle;
}

declare module '*.ink' {
  const story: Record<string, unknown>;
  export default story;
}
