import type { Appearance } from './appearance';
import { buildStylizedHumanoid, type Humanoid } from './humanoid';
import { buildRealHumanoid, realHumansReady } from './mhuman';

/** Build a character: realistic (MakeHuman) once that data has loaded, stylised otherwise (tests, fallback). */
export function buildHumanoid(a: Appearance, opts: { stylized?: boolean; lite?: boolean } = {}): Humanoid {
  if (!opts.stylized && realHumansReady()) return buildRealHumanoid(a, { lite: !!opts.lite });
  return buildStylizedHumanoid(a);
}
