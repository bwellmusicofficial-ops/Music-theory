import { describe, expect, it } from 'vitest';
import { buildPaper, createMockTest } from './engine';
import { generators } from '@/lesson/generators';
import { questionTypes } from '@/lesson/questions';
import { MAX_MOCK_ATTEMPTS, MOCK_RESULTS_KEY, bestOf, createLocalMockResultSink, toAttempt, type MockAttempt } from './store';
import { fakeClock, fixtureConfig } from './test-fixtures';

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(k: string) { return this.data.get(k) ?? null; }
  key(i: number) { return Array.from(this.data.keys())[i] ?? null; }
  removeItem(k: string) { this.data.delete(k); }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

const attempt = (over: Partial<MockAttempt> = {}): MockAttempt => ({
  configId: 'grade-1',
  at: '2026-11-15T10:00:00.000Z',
  seed: 1,
  score: 0.7,
  correct: 21,
  total: 30,
  band: 'pass',
  timedOut: false,
  elapsedMs: 1000,
  sections: [{ id: 'rhythm', correct: 5, total: 9 }],
  skills: [{ skill: 'rhythm.a.b', correct: 1, total: 2 }],
  ...over,
});

describe('local mock result sink', () => {
  it('saves and lists attempts, oldest first, per test', async () => {
    const sink = createLocalMockResultSink(new MemoryStorage());
    await sink.save(attempt({ seed: 1 }));
    await sink.save(attempt({ seed: 2, configId: 'grade-2' }));
    await sink.save(attempt({ seed: 3 }));
    expect((await sink.list('grade-1')).map((a) => a.seed)).toEqual([1, 3]);
    expect(await sink.list()).toHaveLength(3);
    expect(await sink.list('nope')).toEqual([]);
  });

  it('keeps the attempts across sinks on the same storage, under a versioned key', async () => {
    const storage = new MemoryStorage();
    await createLocalMockResultSink(storage).save(attempt());
    expect(MOCK_RESULTS_KEY).toBe('mtn:v1:mock-results');
    expect(storage.getItem(MOCK_RESULTS_KEY)).toContain('grade-1');
    expect(await createLocalMockResultSink(storage).list()).toHaveLength(1);
  });

  it('finds the best attempt, the earliest on a tie, and null when there is none', async () => {
    const sink = createLocalMockResultSink(new MemoryStorage());
    expect(await sink.best('grade-1')).toBeNull();
    await sink.save(attempt({ seed: 1, score: 0.5 }));
    await sink.save(attempt({ seed: 2, score: 0.9, band: 'distinction' }));
    await sink.save(attempt({ seed: 3, score: 0.9 }));
    await sink.save(attempt({ seed: 4, score: 0.4, configId: 'other' }));
    expect((await sink.best('grade-1'))!.seed).toBe(2);
    expect(bestOf([])).toBeNull();
  });

  it('reads corrupt JSON as empty, and recovers on the next save', async () => {
    const storage = new MemoryStorage();
    storage.setItem(MOCK_RESULTS_KEY, '{not json');
    const sink = createLocalMockResultSink(storage);
    expect(await sink.list()).toEqual([]);
    expect(await sink.best('grade-1')).toBeNull();
    await sink.save(attempt());
    expect(await sink.list()).toHaveLength(1);
  });

  it('ignores a stored value that is not a list', async () => {
    const storage = new MemoryStorage();
    storage.setItem(MOCK_RESULTS_KEY, JSON.stringify({ a: 1 }));
    expect(await createLocalMockResultSink(storage).list()).toEqual([]);
  });

  it('drops malformed rows and keeps good ones', async () => {
    const storage = new MemoryStorage();
    storage.setItem(MOCK_RESULTS_KEY, JSON.stringify([attempt({ seed: 1 }), { configId: 'x' }, null, 5, { ...attempt(), score: 7 }, { ...attempt(), band: 'gold' }, attempt({ seed: 2 })]));
    expect((await createLocalMockResultSink(storage).list()).map((a) => a.seed)).toEqual([1, 2]);
  });

  it('works with no storage at all (kept in memory)', async () => {
    const sink = createLocalMockResultSink();
    // jsdom has localStorage; clear what other tests may have left.
    globalThis.localStorage?.removeItem(MOCK_RESULTS_KEY);
    await sink.save(attempt({ seed: 9 }));
    expect((await sink.list()).map((a) => a.seed)).toEqual([9]);
    globalThis.localStorage?.removeItem(MOCK_RESULTS_KEY);
  });

  it('keeps working in memory when storage throws on read and write', async () => {
    const broken: Storage = Object.assign(new MemoryStorage(), {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('full'); },
    });
    const sink = createLocalMockResultSink(broken);
    expect(await sink.list()).toEqual([]);
    await sink.save(attempt({ seed: 1 }));
    await sink.save(attempt({ seed: 2 }));
    expect((await sink.list()).map((a) => a.seed)).toEqual([1, 2]);
    expect((await sink.best('grade-1'))!.seed).toBe(1);
  });

  it('keeps working when only writing fails', async () => {
    const storage = new MemoryStorage();
    storage.setItem = () => { throw new Error('quota'); };
    const sink = createLocalMockResultSink(storage);
    await sink.save(attempt({ seed: 1 }));
    expect(await sink.list()).toHaveLength(1);
  });

  it('caps the stored attempts, dropping the oldest', async () => {
    const storage = new MemoryStorage();
    storage.setItem(MOCK_RESULTS_KEY, JSON.stringify(Array.from({ length: MAX_MOCK_ATTEMPTS }, (_, i) => attempt({ seed: i }))));
    const sink = createLocalMockResultSink(storage);
    await sink.save(attempt({ seed: 999 }));
    const all = await sink.list();
    expect(all).toHaveLength(MAX_MOCK_ATTEMPTS);
    expect(all[0]!.seed).toBe(1);
    expect(all.at(-1)!.seed).toBe(999);
  });
});

describe('toAttempt', () => {
  it('keeps date, score, band and the per-section and per-skill breakdown', () => {
    const config = fixtureConfig();
    const paper = buildPaper(config, 3, { generators, questionTypes });
    const test = createMockTest({ config, paper, questionTypes, clock: fakeClock() });
    test.setAnswer(0, { optionId: 'a' });
    const row = toAttempt(test.submit(), new Date('2026-11-15T12:00:00Z'));
    expect(row.at).toBe('2026-11-15T12:00:00.000Z');
    expect(row).toMatchObject({ configId: 'fixture', seed: 3, total: 6, band: 'not-yet', timedOut: false });
    expect(row.sections.map((s) => s.id)).toEqual(['first', 'second']);
    expect(row.skills.length).toBe(5);
    expect(toAttempt(test.submit(), '2026-01-01T00:00:00Z').at).toBe('2026-01-01T00:00:00Z');
  });
});
