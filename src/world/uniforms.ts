import * as THREE from 'three';

/**
 * Global shader uniforms shared by every world material (terrain, vegetation, water, grass).
 * Updated once per frame by the world systems; materials hold references, never copies.
 */
export interface WorldUniforms {
  time: { value: number };
  /** Wind direction (unit, xz) and base strength 0..1. */
  windDir: { value: THREE.Vector2 };
  windStrength: { value: number };
  /** Current gust 0..1: drives the olive leaves' silver flip. */
  gust: { value: number };
  /** Player position, for grass bending. */
  playerPos: { value: THREE.Vector3 };
  /** Multiplier on grass colour per season. */
  seasonTint: { value: THREE.Color };
  /** 0 dry .. 1 rain-soaked. */
  wetness: { value: number };
  /** 0 day .. 1 night (for emissive/glow and grass darkening). */
  night: { value: number };
}

export function createWorldUniforms(): WorldUniforms {
  return {
    time: { value: 0 },
    windDir: { value: new THREE.Vector2(0.8, -0.6).normalize() },
    windStrength: { value: 0.5 },
    gust: { value: 0 },
    playerPos: { value: new THREE.Vector3() },
    seasonTint: { value: new THREE.Color(1, 1, 1) },
    wetness: { value: 0 },
    night: { value: 0 },
  };
}
