/**
 * The Delian problem (Eratosthenes' letter in Eutocius' commentary on Archimedes; Plutarch, De E 386e and
 * De genio Socratis 579b–d) as pure logic.
 *
 * The oracle asked the Delians to double Apollo's cubic altar. Doubling each edge makes it eight times as
 * large. Hippocrates of Chios reduced the problem to finding two mean proportionals between a and 2a:
 * a : x = x : y = y : 2a, so that x³ = 2a³. Archytas found them with a construction in three
 * dimensions, Menaechmus with conic sections; tradition also credits Plato with a sliding-square instrument.
 */
export function volumeScale(edgeScale: number): number {
  return edgeScale ** 3;
}

/** Exact means: x = a·2^(1/3), y = a·2^(2/3). */
export function meanProportionals(a: number, b: number): [number, number] {
  const r = Math.cbrt(b / a);
  return [a * r, a * r * r];
}

/**
 * The mesolabe: three unit-width frames of height h = a (first), each with a diagonal from top-left to
 * bottom-right. Frame k is slid left by s_k (s_1 = 0 fixed; the player moves s_2 and s_3). On the right edge of
 * the third frame, mark the point at height b (the larger extreme; b < h... here we scale so h = 2a and the
 * mark is at a). The line from the top of the first frame's left edge to that mark crosses the frame edges.
 * At the solution, those crossings are where the diagonals meet the edges, and their heights are the means.
 *
 * Simplified, scale-free form used by the game: given heights x and y chosen by the player (via the sliders),
 * the error is how far the three ratios are from equal.
 */
export function proportionError(a: number, x: number, y: number, b: number): number {
  if (x <= 0 || y <= 0) return Infinity;
  const r1 = x / a;
  const r2 = y / x;
  const r3 = b / y;
  const m = (r1 + r2 + r3) / 3;
  return (Math.abs(r1 - m) + Math.abs(r2 - m) + Math.abs(r3 - m)) / m;
}

/**
 * "Plato's machine" (Eutocius, commentary on Archimedes' Sphere and Cylinder II.1; the attribution to Plato
 * is doubtful, but it is the solution tradition gives him). Two lines cross at right angles at O. Mark A at
 * distance a on one (to the left) and B at distance b on the other (downwards). A carpenter's square slides so
 * that one arm passes through B and its corner Y runs along the first line at OY = t; its other arm meets the
 * second line at X. When the angle at X, between XA and XY, is also right, then a : OX = OX : OY = OY : b.
 *
 * With the corner at Y = (t, 0) and B = (0, −b), the perpendicular arm meets the axis at X = (0, t² / b).
 * The error is the cosine of the angle AXY (0 = right angle).
 */
export function platoMachine(a: number, b: number, t: number): { X: [number, number]; Y: [number, number]; A: [number, number]; B: [number, number]; error: number } {
  const y = (t * t) / b;
  const A: [number, number] = [-a, 0];
  const B: [number, number] = [0, -b];
  const X: [number, number] = [0, y];
  const Y: [number, number] = [t, 0];
  const xa = [A[0] - X[0], A[1] - X[1]];
  const xy = [Y[0] - X[0], Y[1] - X[1]];
  const cos = (xa[0]! * xy[0]! + xa[1]! * xy[1]!) / (Math.hypot(xa[0]!, xa[1]!) * Math.hypot(xy[0]!, xy[1]!));
  return { X, Y, A, B, error: cos };
}

/** The corner position that solves the machine: t = a^(1/3) b^(2/3). */
export function platoMachineSolution(a: number, b: number): number {
  return Math.cbrt(a * b * b);
}
