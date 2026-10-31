/**
 * The Divided Line (Plato, Republic VI 509d–511e) as pure logic.
 *
 * A line is cut into two unequal parts, the visible and the intelligible, and each part is cut again in the
 * same ratio. From the bottom: images (shadows, reflections) → eikasia; the things they are images of
 * (animals, plants, artefacts) → pistis; mathematical objects, reached by reasoning from hypotheses with
 * diagrams → dianoia; Forms, reached by dialectic up to the unhypothetical first principle → noesis.
 *
 * A consequence of cutting in the same ratio (often noticed by readers, not stated by Plato): the two middle
 * segments are always equal.
 */
export type Segment = 'eikasia' | 'pistis' | 'dianoia' | 'noesis';
export const SEGMENTS: Segment[] = ['eikasia', 'pistis', 'dianoia', 'noesis'];

export interface Card {
  id: string;
  segment: Segment;
}

export function checkPlacement(cards: readonly Card[], placed: Record<string, Segment | undefined>): { correct: number; wrong: string[]; missing: string[] } {
  let correct = 0;
  const wrong: string[] = [];
  const missing: string[] = [];
  for (const c of cards) {
    const p = placed[c.id];
    if (!p) missing.push(c.id);
    else if (p === c.segment) correct++;
    else wrong.push(c.id);
  }
  return { correct, wrong, missing };
}

/**
 * Cut a line of length L at ratio r (the larger part over the whole, 0.5 < r < 1), then each part at the same
 * ratio. Returns the four segment lengths from the bottom.
 */
export function divide(L: number, r: number): [number, number, number, number] {
  const visible = L * (1 - r);
  const intelligible = L * r;
  return [visible * (1 - r), visible * r, intelligible * (1 - r), intelligible * r];
}
