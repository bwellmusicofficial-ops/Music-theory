import type { Rng } from '@/engine/types';

const IDS = ['a', 'b', 'c', 'd'] as const;

export interface Choice<Face> {
  face: Face;
  reason?: string;
}

/**
 * The final step of every choice generator: one `rng.shuffle([correct, ...wrongs])`, then
 * ids a, b, c, d in display order. Returns the options and the id of the correct one.
 */
export function placeOptions<Face>(
  rng: Rng,
  correct: Face,
  wrongs: { face: Face; reason: string }[],
): { options: { id: string; face: Face; reason?: string }[]; correct: string } {
  const all = [{ face: correct, isCorrect: true, reason: undefined as string | undefined }, ...wrongs.map((w) => ({ ...w, isCorrect: false }))];
  const order = rng.shuffle(all);
  let correctId = 'a';
  const options = order.map((item, index) => {
    const id = IDS[index]!;
    if (item.isCorrect) correctId = id;
    return item.reason === undefined ? { id, face: item.face } : { id, face: item.face, reason: item.reason };
  });
  return { options, correct: correctId };
}

/** First `n` items of `candidates` whose key has not been seen (and is not in `exclude`). */
export function takeDistinct<T>(candidates: T[], n: number, key: (t: T) => string, exclude: string[] = []): T[] {
  const seen = new Set(exclude);
  const out: T[] = [];
  for (const c of candidates) {
    const k = key(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}
