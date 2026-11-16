/** Personal bests per deck, kept by the page in localStorage as JSON: { [deckId]: score }. */
export const BEST_SCORES_KEY = 'mtn:v1:term-blitz-best';

/** Reads the stored text defensively: anything that is not a map of positive numbers gives what is valid. */
export function parseBestScores(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}
