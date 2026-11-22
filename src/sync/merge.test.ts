import { describe, expect, it } from 'vitest';
import type { AttemptEvent, LessonProgress } from '@/lesson/contracts';
import { attemptKey, lessonAheadOf, mergeAttempts, mergeBests, mergeLessonLists, mergeLessonProgress } from './merge';

const lp = (over: Partial<LessonProgress> = {}): LessonProgress => ({
  lessonId: 'l-1', state: 'in-progress', step: 'practice', questionIndex: 2, bestScore: null, updatedAt: '2026-06-01T10:00:00.000Z', ...over,
});

describe('mergeLessonProgress', () => {
  it('takes the position from whichever side was saved more recently', () => {
    const older = lp({ step: 'hook', questionIndex: 0, updatedAt: '2026-06-01T09:00:00.000Z' });
    const newer = lp({ step: 'name', questionIndex: 1, updatedAt: '2026-06-01T11:00:00.000Z' });
    expect(mergeLessonProgress(older, newer)).toMatchObject({ step: 'name', questionIndex: 1, updatedAt: newer.updatedAt });
    expect(mergeLessonProgress(newer, older)).toMatchObject({ step: 'name', questionIndex: 1 });
  });

  it('on a tie, the side further along wins, whichever way round they are given', () => {
    const a = lp({ step: 'practice', questionIndex: 3 });
    const b = lp({ step: 'practice', questionIndex: 1 });
    expect(mergeLessonProgress(a, b).questionIndex).toBe(3);
    expect(mergeLessonProgress(b, a).questionIndex).toBe(3);
  });

  it('never lowers a completed state, even when the lower one is newer', () => {
    const done = lp({ state: 'complete', step: 'recap', questionIndex: 0, updatedAt: '2026-06-01T09:00:00.000Z' });
    const replay = lp({ state: 'in-progress', step: 'hook', questionIndex: 0, updatedAt: '2026-06-02T09:00:00.000Z' });
    for (const [x, y] of [[done, replay], [replay, done]] as const) {
      const m = mergeLessonProgress(x, y);
      expect(m.state).toBe('complete');
      expect(m.step).toBe('hook'); // the newer position, but still complete
    }
    expect(mergeLessonProgress(lp({ state: 'mastered' }), lp({ state: 'complete' })).state).toBe('mastered');
  });

  it('never lowers a best score, and treats no score as lower than any score', () => {
    expect(mergeLessonProgress(lp({ bestScore: 0.9 }), lp({ bestScore: 0.4 })).bestScore).toBe(0.9);
    expect(mergeLessonProgress(lp({ bestScore: 0.4 }), lp({ bestScore: 0.9 })).bestScore).toBe(0.9);
    expect(mergeLessonProgress(lp({ bestScore: null }), lp({ bestScore: 0 })).bestScore).toBe(0);
    expect(mergeLessonProgress(lp({ bestScore: 0.3 }), lp({ bestScore: null })).bestScore).toBe(0.3);
    expect(mergeLessonProgress(lp(), lp()).bestScore).toBeNull();
  });

  it('is commutative on state and best score, and idempotent', () => {
    const a = lp({ state: 'complete', bestScore: 0.5, updatedAt: '2026-06-01T08:00:00.000Z' });
    const b = lp({ state: 'in-progress', bestScore: 0.8, step: 'name', updatedAt: '2026-06-01T12:00:00.000Z' });
    const ab = mergeLessonProgress(a, b);
    const ba = mergeLessonProgress(b, a);
    expect(ab).toEqual(ba);
    expect(mergeLessonProgress(ab, ab)).toEqual(ab);
    expect(mergeLessonProgress(ab, a)).toEqual(ab);
  });
});

describe('mergeLessonLists and lessonAheadOf', () => {
  it('unions the lessons and merges the ones on both sides', () => {
    const out = mergeLessonLists(
      [lp({ lessonId: 'a', bestScore: 0.2 }), lp({ lessonId: 'only-local' })],
      [lp({ lessonId: 'a', bestScore: 0.7 }), lp({ lessonId: 'only-remote' })],
    );
    expect(out.map((p) => p.lessonId).sort()).toEqual(['a', 'only-local', 'only-remote']);
    expect(out.find((p) => p.lessonId === 'a')!.bestScore).toBe(0.7);
  });

  it('says a lesson is worth sending only when the account lacks something', () => {
    expect(lessonAheadOf(lp(), undefined)).toBe(true);
    expect(lessonAheadOf(lp(), lp())).toBe(false);
    expect(lessonAheadOf(lp({ bestScore: 0.9 }), lp({ bestScore: 0.5 }))).toBe(true);
    expect(lessonAheadOf(lp({ bestScore: 0.5 }), lp({ bestScore: 0.9 }))).toBe(false);
    expect(lessonAheadOf(lp({ state: 'complete' }), lp({ state: 'in-progress' }))).toBe(true);
    expect(lessonAheadOf(lp({ state: 'in-progress', step: 'hook' }), lp({ state: 'complete', step: 'recap' }))).toBe(false);
    expect(lessonAheadOf(lp({ questionIndex: 5 }), lp({ questionIndex: 2 }))).toBe(true);
    expect(lessonAheadOf(lp({ questionIndex: 1 }), lp({ questionIndex: 2 }))).toBe(false);
  });
});

describe('mergeAttempts', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 5, 1, 10, 0, s)).toISOString();
  const att = (i: number, s = i): AttemptEvent => ({ lessonId: 'l', step: 'practice', questionId: `q-${i}`, skill: 'a.b', type: 'ordering', correct: true, score: 1, msTaken: 1, at: at(s) });

  it('is a set keyed by lesson, step, question and time, oldest first', () => {
    const out = mergeAttempts([att(3), att(1)], [att(2), att(1)], 100);
    expect(out.map((a) => a.questionId)).toEqual(['q-1', 'q-2', 'q-3']);
  });

  it('treats the same instant written two ways as one attempt', () => {
    const a = att(1);
    const b = { ...a, at: a.at.replace('.000Z', '+00:00') };
    expect(attemptKey(a)).toBe(attemptKey(b));
    expect(mergeAttempts([a], [b], 10)).toHaveLength(1);
  });

  it('keeps the newest when over the cap', () => {
    const many = Array.from({ length: 10 }, (_, i) => att(i));
    expect(mergeAttempts(many, [], 4).map((a) => a.questionId)).toEqual(['q-6', 'q-7', 'q-8', 'q-9']);
  });
});

describe('mergeBests', () => {
  it('keeps the larger number per key and never lowers one', () => {
    expect(mergeBests({ a: 5, b: 9 }, { a: 7, b: 3, c: 1 })).toEqual({ a: 7, b: 9, c: 1 });
    expect(mergeBests({}, {})).toEqual({});
  });
});
