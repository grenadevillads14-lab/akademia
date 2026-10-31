import type RAPIER from '@dimforge/rapier3d-compat';

export type Rapier = typeof RAPIER;

/**
 * Thin wrapper around a Rapier world. The `-compat` build inlines the WASM as base64,
 * so there is no separate .wasm file to serve. It is loaded with a dynamic import so it
 * lands in its own chunk and the loading screen can paint before the ~2 MB module arrives.
 */
export class Physics {
  readonly world: RAPIER.World;

  constructor(
    readonly R: Rapier,
    gravity = { x: 0, y: -9.81, z: 0 },
  ) {
    this.world = new R.World(gravity);
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  get bodyCount(): number {
    return this.world.bodies.len();
  }
}

let rapierPromise: Promise<Rapier> | null = null;

export async function initPhysics(): Promise<Physics> {
  rapierPromise ??= import('@dimforge/rapier3d-compat').then(async (mod) => {
    const R = mod.default;
    await R.init();
    return R;
  });
  return new Physics(await rapierPromise);
}
