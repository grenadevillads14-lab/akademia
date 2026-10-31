/**
 * The slave boy's square (Plato, Meno 82b–85b), as pure logic.
 *
 * A lattice of points in the dust. A square of side 2 (area 4) is already drawn. Draw a square with
 * double the area. Doubling the side gives 16 (four times!), side 3 gives 9; the answer is the square
 * built on the diagonal of the original, whose area is exactly 8 though its side is no whole number.
 *
 * Segments join lattice points along rows, columns or diagonals; a square counts when all four of its
 * sides are fully drawn (a side may be made of several collinear pieces).
 */
export type Pt = readonly [number, number];
export type Seg = readonly [Pt, Pt];

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const key = (a: Pt, b: Pt) => {
  const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
  return `${p[0]},${p[1]}-${q[0]},${q[1]}`;
};

/** Break a segment into primitive lattice steps (so collinear pieces join up). */
export function steps(s: Seg): string[] {
  const [a, b] = s;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const g = gcd(dx, dy);
  if (g === 0) return [];
  const sx = dx / g;
  const sy = dy / g;
  const out: string[] = [];
  for (let i = 0; i < g; i++) out.push(key([a[0] + sx * i, a[1] + sy * i], [a[0] + sx * (i + 1), a[1] + sy * (i + 1)]));
  return out;
}

/** Only rows, columns and 45° diagonals can be drawn with the stick along the grid. */
export function allowed(s: Seg): boolean {
  const dx = Math.abs(s[1][0] - s[0][0]);
  const dy = Math.abs(s[1][1] - s[0][1]);
  return (dx > 0 || dy > 0) && (dx === 0 || dy === 0 || dx === dy);
}

function hasSide(drawn: Set<string>, a: Pt, b: Pt): boolean {
  return steps([a, b]).every((k) => drawn.has(k));
}

export interface FoundSquare {
  corners: [Pt, Pt, Pt, Pt];
  /** Area in square units (exact, from the squared side length). */
  area: number;
}

/** All squares whose four sides are fully drawn, within an n × n lattice (0..n). */
export function findSquares(segments: Seg[], n: number): FoundSquare[] {
  const drawn = new Set(segments.flatMap(steps));
  const pts: Pt[] = [];
  for (let x = 0; x <= n; x++) for (let y = 0; y <= n; y++) pts.push([x, y]);
  const seen = new Set<string>();
  const found: FoundSquare[] = [];
  for (const a of pts) {
    for (const b of pts) {
      if (a === b) continue;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      // Only rows, columns or diagonals can be sides.
      if (!(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) continue;
      const c: Pt = [b[0] - dy, b[1] + dx];
      const d: Pt = [a[0] - dy, a[1] + dx];
      if ([c, d].some(([x, y]) => x < 0 || y < 0 || x > n || y > n)) continue;
      if (!hasSide(drawn, a, b) || !hasSide(drawn, b, c) || !hasSide(drawn, c, d) || !hasSide(drawn, d, a)) continue;
      const id = [a, b, c, d].map((p) => p.join(',')).sort().join('|');
      if (seen.has(id)) continue;
      seen.add(id);
      found.push({ corners: [a, b, c, d], area: dx * dx + dy * dy });
    }
  }
  return found;
}

export interface MenoStatus {
  solved: boolean;
  /** Feedback key for the largest new square drawn (not the given one). */
  feedback: 'none' | 'given' | 'four_times' | 'nine' | 'double' | 'other';
  areas: number[];
}

export const MENO_GIVEN: Seg[] = [
  [[0, 0], [2, 0]],
  [[2, 0], [2, 2]],
  [[2, 2], [0, 2]],
  [[0, 2], [0, 0]],
];

export function evaluateMeno(drawn: Seg[], n = 4): MenoStatus {
  const squares = findSquares([...MENO_GIVEN, ...drawn], n);
  const areas = squares.map((s) => s.area).sort((a, b) => a - b);
  const others = squares.filter((s) => !(s.area === 4 && s.corners.every(([x, y]) => x <= 2 && y <= 2)));
  if (others.some((s) => s.area === 8)) return { solved: true, feedback: 'double', areas };
  const biggest = others.sort((a, b) => b.area - a.area)[0];
  if (!biggest) return { solved: false, feedback: squares.length ? 'given' : 'none', areas };
  if (biggest.area === 16) return { solved: false, feedback: 'four_times', areas };
  if (biggest.area === 9) return { solved: false, feedback: 'nine', areas };
  return { solved: false, feedback: 'other', areas };
}
