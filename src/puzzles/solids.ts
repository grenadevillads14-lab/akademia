/**
 * The Platonic solids (Plato, Timaeus 53c–56c; Euclid XIII.18) as pure logic.
 *
 * At every corner of a regular solid, the same regular polygons meet. A corner needs at least three faces,
 * and their angles must add to less than 360°, or they lie flat (exactly 360°) or cannot close (more).
 * Trying every polygon and count shows there are exactly five: three, four or five triangles, three squares,
 * three pentagons. Hexagons already lie flat with three.
 *
 * Timaeus gives each to an element: tetrahedron fire, octahedron air, icosahedron water, cube earth; the
 * fifth (dodecahedron) "the god used for the whole", the heavens.
 */
export interface VertexTry {
  /** Sides of the polygon (3 triangle, 4 square, 5 pentagon, 6 hexagon…). */
  sides: number;
  /** How many meet at one corner. */
  count: number;
}

export type SolidId = 'tetrahedron' | 'octahedron' | 'icosahedron' | 'cube' | 'dodecahedron';

export interface VertexResult {
  /** Sum of the face angles at the corner, degrees. */
  angleSum: number;
  /** 360 − sum: the gap that folds up into a solid corner (the "angle defect"). */
  defect: number;
  outcome: 'too_few' | 'solid' | 'flat' | 'overlap';
  solid?: SolidId;
  /** For solids: faces, edges and corners (V − E + F = 2). */
  faces?: number;
  edges?: number;
  vertices?: number;
}

export const ELEMENT: Record<SolidId, 'fire' | 'air' | 'water' | 'earth' | 'cosmos'> = {
  tetrahedron: 'fire',
  octahedron: 'air',
  icosahedron: 'water',
  cube: 'earth',
  dodecahedron: 'cosmos',
};

export function interiorAngle(sides: number): number {
  return 180 - 360 / sides;
}

const NAMES: Record<string, SolidId> = { '3,3': 'tetrahedron', '3,4': 'octahedron', '3,5': 'icosahedron', '4,3': 'cube', '5,3': 'dodecahedron' };

export function tryVertex(v: VertexTry): VertexResult {
  const angleSum = interiorAngle(v.sides) * v.count;
  const defect = 360 - angleSum;
  if (v.count < 3) return { angleSum, defect, outcome: 'too_few' };
  if (Math.abs(defect) < 1e-9) return { angleSum, defect: 0, outcome: 'flat' };
  if (defect < 0) return { angleSum, defect, outcome: 'overlap' };
  const solid = NAMES[`${v.sides},${v.count}`];
  if (!solid) throw new Error(`Unexpected solid corner ${v.sides}×${v.count}`);
  // Descartes: the total defect over all corners is 720°, so V = 720 / defect.
  const vertices = Math.round(720 / defect);
  const faces = Math.round((vertices * v.count) / v.sides);
  const edges = Math.round((vertices * v.count) / 2);
  return { angleSum, defect, outcome: 'solid', solid, faces, edges, vertices };
}

/** Every polygon (3..maxSides) and count (3..maxCount) that closes into a solid corner. */
export function allSolids(maxSides = 12, maxCount = 12): VertexTry[] {
  const out: VertexTry[] = [];
  for (let s = 3; s <= maxSides; s++) for (let c = 3; c <= maxCount; c++) if (tryVertex({ sides: s, count: c }).outcome === 'solid') out.push({ sides: s, count: c });
  return out;
}
