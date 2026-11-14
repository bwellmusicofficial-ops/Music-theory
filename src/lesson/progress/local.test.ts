import { describe, expect, it, vi } from 'vitest';
import type { AttemptEvent, LessonProgress } from '../contracts';
import { MemoryStorage } from '../player/test-fixtures';
import { ATTEMPTS_KEY, MAX_ATTEMPTS, PROGRESS_KEY, createLocalProgressSink } from './local';

const progress = (id: string, over: Partial<LessonProgress> = {}): LessonProgress => ({
  lessonId: id,
  state: 'in-progress',
  step: 'practice',
  questionIndex: 1,
  bestScore: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
const attempt = (n: number): AttemptEvent => ({
  lessonId: 'l',
  step: 'practice',
  questionId: `q${n}`,
  skill: 'rhythm.pulse.steady',
  type: 'multiple-choice',
  correct: n % 2 === 0,
  score: n % 2,
  msTaken: n,
  at: '2026-01-01T00:00:00.000Z',
});

describe('createLocalProgressSink', () => {
  it('saves and loads progress per lesson and lists all', async () => {
    const sink = createLocalProgressSink(new MemoryStorage());
    expect(await sink.loadLessonProgress('a')).toBeNull();
    expect(await sink.loadAllLessonProgress()).toEqual([]);
    await sink.saveLessonProgress(progress('a'));
    await sink.saveLessonProgress(progress('b', { state: 'complete', bestScore: 0.9 }));
    expect(await sink.loadLessonProgress('a')).toEqual(progress('a'));
    expect((await sink.loadAllLessonProgress()).map((p) => p.lessonId).sort()).toEqual(['a', 'b']);
  });

  it('overwrites the same lesson', async () => {
    const sink = createLocalProgressSink(new MemoryStorage());
    await sink.saveLessonProgress(progress('a'));
    await sink.saveLessonProgress(progress('a', { questionIndex: 3 }));
    expect((await sink.loadLessonProgress('a'))?.questionIndex).toBe(3);
    expect(await sink.loadAllLessonProgress()).toHaveLength(1);
  });

  it('persists through a new sink on the same storage, under versioned keys', async () => {
    const storage = new MemoryStorage();
    await createLocalProgressSink(storage).saveLessonProgress(progress('a'));
    await createLocalProgressSink(storage).recordAttempt(attempt(1));
    expect(PROGRESS_KEY).toMatch(/:v1:/);
    expect(ATTEMPTS_KEY).toMatch(/:v1:/);
    expect(storage.getItem(PROGRESS_KEY)).toContain('"a"');
    const again = createLocalProgressSink(storage);
    expect(await again.loadLessonProgress('a')).toEqual(progress('a'));
    expect(await again.loadAttempts()).toEqual([attempt(1)]);
  });

  it('records attempts in order', async () => {
    const sink = createLocalProgressSink(new MemoryStorage());
    for (let i = 0; i < 5; i++) await sink.recordAttempt(attempt(i));
    expect((await sink.loadAttempts()).map((a) => a.questionId)).toEqual(['q0', 'q1', 'q2', 'q3', 'q4']);
  });

  it('keeps only the most recent 2000 attempts', async () => {
    const storage = new MemoryStorage();
    const seed = Array.from({ length: MAX_ATTEMPTS }, (_, i) => attempt(i));
    storage.setItem(ATTEMPTS_KEY, JSON.stringify(seed));
    const sink = createLocalProgressSink(storage);
    await sink.recordAttempt(attempt(5000));
    await sink.recordAttempt(attempt(5001));
    const all = await sink.loadAttempts();
    expect(MAX_ATTEMPTS).toBe(2000);
    expect(all).toHaveLength(2000);
    expect(all[0].questionId).toBe('q2');
    expect(all.at(-1)?.questionId).toBe('q5001');
  });

  it('trims an oversized stored list on the next write', async () => {
    const storage = new MemoryStorage();
    storage.setItem(ATTEMPTS_KEY, JSON.stringify(Array.from({ length: 2500 }, (_, i) => attempt(i))));
    const sink = createLocalProgressSink(storage);
    await sink.recordAttempt(attempt(9999));
    const all = await sink.loadAttempts();
    expect(all).toHaveLength(2000);
    expect(all.at(-1)?.questionId).toBe('q9999');
  });

  describe('corrupted storage', () => {
    it('reads corrupted JSON as empty and recovers on the next write', async () => {
      const storage = new MemoryStorage();
      storage.setItem(PROGRESS_KEY, '{not json');
      storage.setItem(ATTEMPTS_KEY, '[[[');
      const sink = createLocalProgressSink(storage);
      expect(await sink.loadAllLessonProgress()).toEqual([]);
      expect(await sink.loadLessonProgress('a')).toBeNull();
      expect(await sink.loadAttempts()).toEqual([]);
      await sink.saveLessonProgress(progress('a'));
      await sink.recordAttempt(attempt(1));
      expect(await sink.loadLessonProgress('a')).toEqual(progress('a'));
      expect(await sink.loadAttempts()).toHaveLength(1);
    });

    it('reads the wrong JSON shapes as empty', async () => {
      const storage = new MemoryStorage();
      for (const bad of ['null', '42', '"x"', '[]', 'true']) {
        storage.setItem(PROGRESS_KEY, bad);
        storage.setItem(ATTEMPTS_KEY, bad === '[]' ? '{}' : bad);
        const sink = createLocalProgressSink(storage);
        expect(await sink.loadAllLessonProgress()).toEqual([]);
        expect(await sink.loadAttempts()).toEqual([]);
      }
    });

    it('drops malformed rows but keeps good ones', async () => {
      const storage = new MemoryStorage();
      storage.setItem(
        PROGRESS_KEY,
        JSON.stringify({
          good: progress('good'),
          mismatched: progress('other'),
          badStep: { ...progress('badStep'), step: 'nope' },
          badState: { ...progress('badState'), state: 'weird' },
          junk: 5,
        }),
      );
      storage.setItem(ATTEMPTS_KEY, JSON.stringify([attempt(1), { nope: true }, null, 7, attempt(2)]));
      const sink = createLocalProgressSink(storage);
      expect((await sink.loadAllLessonProgress()).map((p) => p.lessonId)).toEqual(['good']);
      expect((await sink.loadAttempts()).map((a) => a.questionId)).toEqual(['q1', 'q2']);
    });
  });

  describe('storage unavailable', () => {
    it('works in memory when no storage exists', async () => {
      const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
      try {
        const sink = createLocalProgressSink();
        await sink.saveLessonProgress(progress('a'));
        await sink.recordAttempt(attempt(1));
        expect(await sink.loadLessonProgress('a')).toEqual(progress('a'));
        expect(await sink.loadAttempts()).toHaveLength(1);
      } finally {
        if (original) Object.defineProperty(globalThis, 'localStorage', original);
      }
    });

    it('survives localStorage access that throws (blocked storage)', async () => {
      const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
      try {
        const sink = createLocalProgressSink();
        await sink.saveLessonProgress(progress('a'));
        expect(await sink.loadLessonProgress('a')).toEqual(progress('a'));
      } finally {
        if (original) Object.defineProperty(globalThis, 'localStorage', original);
      }
    });

    it('falls back to memory when writes throw (quota), without losing earlier data', async () => {
      const storage = new MemoryStorage();
      const sink = createLocalProgressSink(storage);
      await sink.saveLessonProgress(progress('a'));
      vi.spyOn(storage, 'setItem').mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError');
      });
      await expect(sink.recordAttempt(attempt(1))).resolves.toBeUndefined();
      await expect(sink.saveLessonProgress(progress('b'))).resolves.toBeUndefined();
      expect(await sink.loadAttempts()).toHaveLength(1);
      expect((await sink.loadAllLessonProgress()).map((p) => p.lessonId).sort()).toEqual(['a', 'b']);
      await sink.recordAttempt(attempt(2));
      expect(await sink.loadAttempts()).toHaveLength(2);
    });

    it('survives reads that throw', async () => {
      const storage = new MemoryStorage();
      vi.spyOn(storage, 'getItem').mockImplementation(() => {
        throw new Error('nope');
      });
      const sink = createLocalProgressSink(storage);
      expect(await sink.loadAllLessonProgress()).toEqual([]);
      await sink.saveLessonProgress(progress('a'));
      expect(await sink.loadLessonProgress('a')).toEqual(progress('a'));
    });
  });
});
