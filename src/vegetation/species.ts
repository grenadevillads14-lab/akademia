import type { LeafCell } from './leafAtlas';

/**
 * Procedural tree species. Values come from the research in docs/RESEARCH.md §12:
 *  - olive: short, wide, gnarled; trunk splits into 2–4 twisting stems; narrow leaves silver beneath
 *  - oriental plane: tall broad crown, smooth trunk with camouflage bark, big palmate leaves
 *  - cypress: tall narrow dark flame
 *  - fig: low, spreading, multi-stemmed, huge lobed leaves
 *  - pomegranate: small bushy tree, glossy small leaves, red flowers
 */
export type SpeciesId = 'olive' | 'moria' | 'plane' | 'plane_ancient' | 'cypress' | 'fig' | 'pomegranate' | 'myrtle' | 'laurel' | 'reed';

/** Shader ids, shared with vegetation materials. */
export const BARK = { olive: 0, plane: 1, cypress: 2, fig: 3, pomegranate: 4, shrub: 5 } as const;
export const LEAF_KIND = { olive: 0, plane: 1, cypress: 2, fig: 3, pomegranate: 4, shrub: 5, reed: 6 } as const;

type Range = readonly [number, number];

export interface LevelSpec {
  count: Range;
  /** Angle away from the parent direction, radians. */
  angle: Range;
  lengthRatio: Range;
  radiusRatio: number;
  /** Fraction along the parent where children may start. */
  startAt: Range;
  gnarl: number;
  /** + grows upward, - droops. */
  tropism: number;
  segments: number;
}

export interface SpeciesSpec {
  id: SpeciesId;
  bark: number;
  leafKind: number;
  leafCell: LeafCell;
  trunk: { length: Range; radius: Range; lean: number; gnarl: number; segments: number; taper: number; flute: number; twist: number };
  levels: LevelSpec[];
  leaves: {
    clusterRadius: number;
    cardsPerCluster: number;
    cardSize: Range;
    clusterSpacing: number;
    outwardBias: number;
    /** Only the outer fraction of each terminal branch carries leaves. */
    fromT: number;
  };
  /** Special crown shapes that aren't branch-and-card. */
  crown?: 'cypress' | 'reed';
  /** LOD switch distances in metres (LOD0→1, 1→2, 2→impostor). Scaled by instance scale. */
  lod: [number, number, number];
}

export const SPECIES: Record<SpeciesId, SpeciesSpec> = {
  olive: {
    id: 'olive',
    bark: BARK.olive,
    leafKind: LEAF_KIND.olive,
    leafCell: 'olive',
    trunk: { length: [1.1, 1.8], radius: [0.22, 0.34], lean: 0.25, gnarl: 0.35, segments: 6, taper: 0.75, flute: 0.35, twist: 1.6 },
    levels: [
      { count: [2, 4], angle: [0.45, 0.85], lengthRatio: [1.5, 2.2], radiusRatio: 0.62, startAt: [0.8, 1], gnarl: 0.45, tropism: 0.05, segments: 6 },
      { count: [3, 5], angle: [0.6, 1.1], lengthRatio: [0.55, 0.8], radiusRatio: 0.55, startAt: [0.35, 1], gnarl: 0.35, tropism: -0.12, segments: 4 },
      { count: [2, 4], angle: [0.5, 1.0], lengthRatio: [0.45, 0.65], radiusRatio: 0.55, startAt: [0.3, 1], gnarl: 0.3, tropism: -0.2, segments: 3 },
    ],
    leaves: { clusterRadius: 0.75, cardsPerCluster: 7, cardSize: [0.75, 1.1], clusterSpacing: 0.55, outwardBias: 0.55, fromT: 0.25 },
    lod: [35, 80, 170],
  },
  // A sacred moria: the same tree, 2–3× the size, hollow-looking massive split trunk.
  moria: {
    id: 'moria',
    bark: BARK.olive,
    leafKind: LEAF_KIND.olive,
    leafCell: 'olive',
    trunk: { length: [1.4, 1.9], radius: [0.7, 0.9], lean: 0.2, gnarl: 0.4, segments: 7, taper: 0.7, flute: 0.55, twist: 2.4 },
    levels: [
      { count: [3, 4], angle: [0.55, 0.95], lengthRatio: [2.6, 3.4], radiusRatio: 0.5, startAt: [0.85, 1], gnarl: 0.5, tropism: 0.0, segments: 7 },
      { count: [3, 5], angle: [0.6, 1.2], lengthRatio: [0.5, 0.75], radiusRatio: 0.55, startAt: [0.3, 1], gnarl: 0.4, tropism: -0.18, segments: 5 },
      { count: [2, 4], angle: [0.5, 1.0], lengthRatio: [0.45, 0.65], radiusRatio: 0.55, startAt: [0.3, 1], gnarl: 0.3, tropism: -0.25, segments: 3 },
    ],
    leaves: { clusterRadius: 0.9, cardsPerCluster: 7, cardSize: [0.85, 1.2], clusterSpacing: 0.6, outwardBias: 0.55, fromT: 0.2 },
    lod: [45, 100, 220],
  },
  plane: {
    id: 'plane',
    bark: BARK.plane,
    leafKind: LEAF_KIND.plane,
    leafCell: 'plane',
    trunk: { length: [6, 8], radius: [0.35, 0.5], lean: 0.06, gnarl: 0.06, segments: 7, taper: 0.7, flute: 0.05, twist: 0.2 },
    levels: [
      { count: [3, 5], angle: [0.45, 0.8], lengthRatio: [1.0, 1.4], radiusRatio: 0.6, startAt: [0.7, 1], gnarl: 0.12, tropism: 0.12, segments: 6 },
      { count: [3, 5], angle: [0.5, 0.95], lengthRatio: [0.5, 0.7], radiusRatio: 0.55, startAt: [0.3, 1], gnarl: 0.15, tropism: 0.02, segments: 4 },
      { count: [2, 4], angle: [0.5, 0.9], lengthRatio: [0.45, 0.6], radiusRatio: 0.55, startAt: [0.3, 1], gnarl: 0.15, tropism: -0.08, segments: 3 },
    ],
    leaves: { clusterRadius: 1.5, cardsPerCluster: 8, cardSize: [1.5, 2.1], clusterSpacing: 1.0, outwardBias: 0.6, fromT: 0.3 },
    lod: [60, 140, 300],
  },
  plane_ancient: {
    id: 'plane_ancient',
    bark: BARK.plane,
    leafKind: LEAF_KIND.plane,
    leafCell: 'plane',
    trunk: { length: [5, 6], radius: [1.0, 1.2], lean: 0.05, gnarl: 0.1, segments: 8, taper: 0.65, flute: 0.15, twist: 0.4 },
    levels: [
      { count: [4, 5], angle: [0.6, 0.95], lengthRatio: [1.6, 2.0], radiusRatio: 0.55, startAt: [0.75, 1], gnarl: 0.15, tropism: 0.08, segments: 7 },
      { count: [3, 5], angle: [0.5, 1.0], lengthRatio: [0.5, 0.7], radiusRatio: 0.55, startAt: [0.3, 1], gnarl: 0.15, tropism: 0.0, segments: 5 },
      { count: [2, 4], angle: [0.5, 0.9], lengthRatio: [0.45, 0.6], radiusRatio: 0.55, startAt: [0.3, 1], gnarl: 0.15, tropism: -0.1, segments: 3 },
    ],
    leaves: { clusterRadius: 1.7, cardsPerCluster: 8, cardSize: [1.6, 2.2], clusterSpacing: 1.0, outwardBias: 0.6, fromT: 0.3 },
    lod: [70, 160, 340],
  },
  cypress: {
    id: 'cypress',
    bark: BARK.cypress,
    leafKind: LEAF_KIND.cypress,
    leafCell: 'cypress',
    trunk: { length: [11, 16], radius: [0.18, 0.26], lean: 0.02, gnarl: 0.02, segments: 4, taper: 0.4, flute: 0.0, twist: 0 },
    levels: [],
    leaves: { clusterRadius: 0, cardsPerCluster: 0, cardSize: [1, 1], clusterSpacing: 1, outwardBias: 1, fromT: 0 },
    crown: 'cypress',
    lod: [60, 140, 320],
  },
  fig: {
    id: 'fig',
    bark: BARK.fig,
    leafKind: LEAF_KIND.fig,
    leafCell: 'fig',
    trunk: { length: [0.5, 0.8], radius: [0.16, 0.22], lean: 0.1, gnarl: 0.15, segments: 3, taper: 0.85, flute: 0.05, twist: 0.3 },
    levels: [
      { count: [3, 5], angle: [0.6, 1.1], lengthRatio: [3.5, 4.5], radiusRatio: 0.65, startAt: [0.85, 1], gnarl: 0.18, tropism: 0.02, segments: 5 },
      { count: [2, 4], angle: [0.5, 1.0], lengthRatio: [0.45, 0.65], radiusRatio: 0.6, startAt: [0.4, 1], gnarl: 0.15, tropism: -0.05, segments: 3 },
    ],
    leaves: { clusterRadius: 0.9, cardsPerCluster: 6, cardSize: [1.0, 1.35], clusterSpacing: 0.7, outwardBias: 0.55, fromT: 0.35 },
    lod: [35, 80, 170],
  },
  pomegranate: {
    id: 'pomegranate',
    bark: BARK.pomegranate,
    leafKind: LEAF_KIND.pomegranate,
    leafCell: 'pomegranate',
    trunk: { length: [0.4, 0.7], radius: [0.07, 0.1], lean: 0.12, gnarl: 0.2, segments: 3, taper: 0.8, flute: 0.1, twist: 0.6 },
    levels: [
      { count: [4, 6], angle: [0.3, 0.7], lengthRatio: [3.5, 5], radiusRatio: 0.6, startAt: [0.7, 1], gnarl: 0.2, tropism: 0.1, segments: 4 },
      { count: [2, 3], angle: [0.4, 0.9], lengthRatio: [0.4, 0.6], radiusRatio: 0.6, startAt: [0.3, 1], gnarl: 0.2, tropism: -0.05, segments: 3 },
    ],
    leaves: { clusterRadius: 0.55, cardsPerCluster: 6, cardSize: [0.6, 0.85], clusterSpacing: 0.45, outwardBias: 0.5, fromT: 0.3 },
    lod: [30, 70, 140],
  },
  myrtle: {
    id: 'myrtle',
    bark: BARK.shrub,
    leafKind: LEAF_KIND.shrub,
    leafCell: 'myrtle',
    trunk: { length: [0.15, 0.25], radius: [0.04, 0.06], lean: 0.1, gnarl: 0.2, segments: 2, taper: 0.8, flute: 0, twist: 0 },
    levels: [{ count: [6, 9], angle: [0.4, 1.1], lengthRatio: [6, 9], radiusRatio: 0.6, startAt: [0.6, 1], gnarl: 0.2, tropism: 0.05, segments: 3 }],
    leaves: { clusterRadius: 0.4, cardsPerCluster: 5, cardSize: [0.5, 0.75], clusterSpacing: 0.35, outwardBias: 0.5, fromT: 0.25 },
    lod: [25, 55, 110],
  },
  laurel: {
    id: 'laurel',
    bark: BARK.shrub,
    leafKind: LEAF_KIND.shrub,
    leafCell: 'laurel',
    trunk: { length: [0.3, 0.5], radius: [0.06, 0.09], lean: 0.08, gnarl: 0.15, segments: 2, taper: 0.8, flute: 0, twist: 0 },
    levels: [
      { count: [5, 7], angle: [0.25, 0.7], lengthRatio: [5, 7], radiusRatio: 0.6, startAt: [0.6, 1], gnarl: 0.15, tropism: 0.15, segments: 3 },
      { count: [2, 3], angle: [0.4, 0.8], lengthRatio: [0.4, 0.6], radiusRatio: 0.6, startAt: [0.4, 1], gnarl: 0.15, tropism: 0.0, segments: 2 },
    ],
    leaves: { clusterRadius: 0.55, cardsPerCluster: 6, cardSize: [0.7, 0.95], clusterSpacing: 0.45, outwardBias: 0.5, fromT: 0.3 },
    lod: [30, 65, 130],
  },
  reed: {
    id: 'reed',
    bark: BARK.shrub,
    leafKind: LEAF_KIND.reed,
    leafCell: 'reed',
    trunk: { length: [0.05, 0.1], radius: [0.02, 0.03], lean: 0, gnarl: 0, segments: 1, taper: 1, flute: 0, twist: 0 },
    levels: [],
    leaves: { clusterRadius: 0, cardsPerCluster: 0, cardSize: [2.2, 3.2], clusterSpacing: 1, outwardBias: 0, fromT: 0 },
    crown: 'reed',
    lod: [25, 50, 90],
  },
};
