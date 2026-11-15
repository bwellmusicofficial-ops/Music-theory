/** Shared by the mock tests: a small config of authored multiple-choice questions, and a fake clock. */

import type { QuestionTypeRegistry } from '@/lesson/contracts';
import { questionTypes } from '@/lesson/questions';
import { mockConfigSchema, type MockConfig } from './schema';
import type { Clock } from './engine';

/** One authored multiple-choice question: option "a" is right, "b" and "c" are wrong with reasons. */
export function mcq(id: string, skill: string, correct = 'a') {
  const option = (letter: string) => ({
    id: letter,
    face: { kind: 'text', text: `Option ${letter} of ${id}` },
    ...(letter === correct ? {} : { reason: `Option ${letter} of ${id} is wrong because of reason ${letter}.` }),
  });
  return {
    id,
    type: 'multiple-choice',
    skill,
    prompt: `Question ${id}?`,
    source: 'authored',
    payload: { options: ['a', 'b', 'c'].map(option), correct },
  };
}

/** Six questions in two sections; skills s1 (2 questions), s2 (2), s3 (1), s4 (1). Marks 0.5 / 0.75 / 0.9. */
export function fixtureConfig(overrides: Record<string, unknown> = {}): MockConfig {
  return mockConfigSchema.parse({
    schemaVersion: 1,
    id: 'fixture',
    grade: '1',
    title: 'Fixture test',
    summary: 'A tiny test.',
    minutes: 10,
    passMark: 0.5,
    meritMark: 0.75,
    distinctionMark: 0.9,
    sections: [
      {
        id: 'first',
        title: 'First',
        strand: 'rhythm',
        items: [
          { kind: 'authored', id: 'bank-one', bank: [mcq('q1', 'rhythm.s1'), mcq('q2', 'rhythm.s1'), mcq('q3', 'rhythm.s2')] },
        ],
      },
      {
        id: 'second',
        title: 'Second',
        strand: 'pitch',
        items: [
          { kind: 'authored', id: 'bank-two', bank: [mcq('q4', 'pitch.s2'), mcq('q5', 'pitch.s3'), mcq('q6', 'pitch.s4')] },
        ],
      },
    ],
    ...overrides,
  });
}

/** Questions of the fixture are in bank order only when nothing shuffles: draw all, then find by id. */
export const fixtureTypes: QuestionTypeRegistry = questionTypes;

export function fakeClock(start = 1_000_000): Clock & { advance(ms: number): void; set(ms: number): void } {
  let t = start;
  return {
    now: () => t,
    advance(ms) {
      t += ms;
    },
    set(ms) {
      t = ms;
    },
  };
}
