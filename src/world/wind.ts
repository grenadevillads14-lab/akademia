import { fbm } from '../procgen/noise';
import type { WorldUniforms } from './uniforms';

/**
 * Global wind: one direction for the whole world (so every tree agrees), a slowly wandering
 * base strength, and gusts that roll through. Gusts drive the olive grove's silver shimmer.
 * The "Attic wind" weather raises the base strength.
 */
export class Wind {
  /** Base strength set by weather, 0..1. */
  baseStrength = 0.45;
  private t = 0;

  constructor(private readonly u: WorldUniforms) {}

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    // Direction wanders ±25° around north-west → south-east (the prevailing summer meltemi blows from the north).
    const ang = -0.65 + fbm(t * 0.01, 3.1, 2, 5) * 0.45;
    this.u.windDir.value.set(Math.cos(ang), Math.sin(ang)).normalize();
    const gustNoise = fbm(t * 0.12, 7.7, 3, 9) * 0.5 + 0.5; // 0..1, slow rolling gusts
    const gust = Math.max(0, Math.min(1, (gustNoise - 0.45) * 2.4)) * (0.4 + this.baseStrength);
    this.u.gust.value = gust;
    this.u.windStrength.value = this.baseStrength * (0.8 + 0.4 * gustNoise);
    this.u.time.value = t;
  }
}

/**
 * GLSL snippet shared by vegetation shaders. Expects uniforms uTime, uWindDir, uWindStrength, uGust.
 * windSway(worldPos, heightFactor, stiffness) returns a world-space xz offset.
 */
export const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uGust;
vec2 windSway(vec3 wp, float h, float stiffness) {
  float phase = dot(wp.xz, uWindDir) * 0.06 - uTime * 1.3;
  float wave = sin(phase) * 0.6 + sin(phase * 2.3 + wp.x * 0.1) * 0.25;
  float gustWave = sin(dot(wp.xz, uWindDir) * 0.02 - uTime * 0.7) * 0.5 + 0.5;
  float amp = (uWindStrength * 0.6 + uGust * gustWave * 0.9) * h * h / stiffness;
  return uWindDir * (amp * (0.6 + 0.4 * wave)) + vec2(-uWindDir.y, uWindDir.x) * amp * 0.25 * sin(phase * 1.7);
}
`;
