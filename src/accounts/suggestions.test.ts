import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADJECTIVES, generateSuggestion, generateSuggestions, NOUNS } from './suggestions';
import { codeNameFormatOk, normaliseCodeName } from './rules';

/** The starter blocked list the owner reviews: read straight from the seed file. */
function blocked() {
  const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'seed', 'blocked_names.sql'), 'utf8');
  return [...sql.matchAll(/\('([^']+)',\s*'(exact|contains)'\)/g)].map((m) => ({ word: normaliseCodeName(m[1]!), match: m[2]! }));
}

describe('suggestions', () => {
  it('look like SwiftCello42 and pass the format rules', () => {
    for (let i = 0; i < 200; i++) {
      const s = generateSuggestion();
      expect(s).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d\d$/);
      expect(codeNameFormatOk(s)).toBe(true);
    }
  });

  it('come three at a time, all different', () => {
    for (let i = 0; i < 50; i++) expect(new Set(generateSuggestions()).size).toBe(3);
  });

  it('are deterministic given a random source', () => {
    expect(generateSuggestion(() => 0)).toBe(`${ADJECTIVES[0]}${NOUNS[0]}00`);
    expect(generateSuggestion(() => 0.999)).toBe(`${ADJECTIVES.at(-1)}${NOUNS.at(-1)}99`);
  });

  it('word lists have no duplicates and every combination fits in 20 characters', () => {
    expect(new Set(ADJECTIVES).size).toBe(ADJECTIVES.length);
    expect(new Set(NOUNS).size).toBe(NOUNS.length);
    const longest = Math.max(...ADJECTIVES.map((w) => w.length)) + Math.max(...NOUNS.map((w) => w.length)) + 2;
    expect(longest).toBeLessThanOrEqual(20);
  });

  it('no combination can be blocked by the starter blocked list or refused by the format rules', () => {
    const list = blocked();
    expect(list.length).toBeGreaterThan(20);
    const bad: string[] = [];
    for (const a of ADJECTIVES) {
      for (const n of NOUNS) {
        for (const d of ['00', '07', '42', '69', '99']) {
          const s = `${a}${n}${d}`;
          const norm = normaliseCodeName(s);
          const hit = list.some((b) => (b.match === 'exact' ? b.word === norm : norm.includes(b.word)));
          if (hit || !codeNameFormatOk(s)) bad.push(s);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('the words are friendly: no word on the blocked list sits inside any single word either', () => {
    const list = blocked().filter((b) => b.match === 'contains');
    for (const w of [...ADJECTIVES, ...NOUNS]) for (const b of list) expect(normaliseCodeName(w)).not.toContain(b.word);
  });
});
