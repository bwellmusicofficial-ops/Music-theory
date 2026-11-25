import { describe, expect, it } from 'vitest';
import { mockAttemptSchema } from './attempt-schema';
import { parseMockAttempt, type MockAttempt } from './store';

const good: MockAttempt = {
  configId: 'grade-1',
  at: '2026-11-25T10:00:00.000Z',
  seed: 42,
  score: 0.75,
  correct: 24,
  total: 32,
  band: 'merit',
  timedOut: false,
  elapsedMs: 123456,
  sections: [{ id: 'a', correct: 3, total: 4 }],
  skills: [{ skill: 'pitch.treble', correct: 1, total: 2 }],
};

const variants: Record<string, unknown> = {
  good,
  'unknown total (0)': { ...good, total: 0 },
  'extra fields are dropped': { ...good, extra: 'x', sections: [{ id: 'a', correct: 1, total: 2, more: 1 }] },
  'empty sections and skills': { ...good, sections: [], skills: [] },
  'score at 0 and 1': { ...good, score: 0 },
  'score of 1': { ...good, score: 1 },
  'score above 1': { ...good, score: 1.01 },
  'negative score': { ...good, score: -0.1 },
  'negative correct': { ...good, correct: -1 },
  'negative elapsed': { ...good, elapsedMs: -5 },
  'negative seed is fine': { ...good, seed: -7 },
  'empty configId': { ...good, configId: '' },
  'empty date': { ...good, at: '' },
  'unknown band': { ...good, band: 'gold' },
  'every band: not-yet': { ...good, band: 'not-yet' },
  'timedOut as string': { ...good, timedOut: 'no' },
  'seed as string': { ...good, seed: '42' },
  'sections not an array': { ...good, sections: {} },
  'section missing id': { ...good, sections: [{ correct: 1, total: 2 }] },
  'section id not a string': { ...good, sections: [{ id: 3, correct: 1, total: 2 }] },
  'skill negative total': { ...good, skills: [{ skill: 's', correct: 0, total: -1 }] },
  'skills missing': { ...good, skills: undefined },
  null: null,
  'a string': 'x',
  'an array': [good],
  'a number': 5,
};

describe('parseMockAttempt agrees with the zod schema', () => {
  for (const [name, row] of Object.entries(variants)) {
    it(name, () => {
      const z = mockAttemptSchema.safeParse(row);
      const hand = parseMockAttempt(row);
      if (z.success) expect(hand).toEqual(z.data);
      else expect(hand).toBeNull();
    });
  }
});
