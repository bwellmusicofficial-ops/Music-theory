import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '@/lesson/player/test-fixtures';
import { MAX_OUTBOX, OUTBOX_KEY, Outbox } from './outbox';
import { LIMITS, type AttemptWire, type LessonWire } from './wire';

const lesson = (id: string, over: Partial<LessonWire> = {}): LessonWire => ({ lessonId: id, state: 'in-progress', step: 'hook', questionIndex: 0, bestScore: null, ...over });
const attempt = (i: number): AttemptWire => ({ lessonId: 'l-1', step: 'practice', questionId: `q-${i}`, skill: 'a.b', type: 'ordering', correct: true, score: 1, msTaken: 5, at: new Date(Date.UTC(2026, 5, 1, 10, 0, i)).toISOString() });
const mock = (score: number) => ({ grade: '1' as const, score, breakdown: { 'a.b': score } });

describe('Outbox', () => {
  it('starts empty and has nothing to send', () => {
    const o = new Outbox(new MemoryStorage());
    expect(o.size()).toBe(0);
    expect(o.nextBatch()).toBeNull();
  });

  it('keeps entries in the order they were added, across kinds', () => {
    const o = new Outbox(new MemoryStorage());
    o.add([{ k: 'attempt', v: attempt(1) }, { k: 'lesson', v: lesson('a') }, { k: 'attempt', v: attempt(2) }, { k: 'game', v: { gameId: 'note-rush', score: 5 } }]);
    expect(o.entries().map((e) => e.k)).toEqual(['attempt', 'lesson', 'attempt', 'game']);
    const next = o.nextBatch()!;
    expect(next.batch.attempts.map((a) => a.questionId)).toEqual(['q-1', 'q-2']);
    expect(next.batch.lessons).toHaveLength(1);
    expect(next.batch.games).toEqual([{ gameId: 'note-rush', score: 5 }]);
    expect(next.ids).toEqual([1, 2, 3, 4]);
  });

  it('a newer save of a lesson replaces the older one and goes to the back', () => {
    const o = new Outbox(new MemoryStorage());
    o.add([{ k: 'lesson', v: lesson('a', { step: 'hook' }) }, { k: 'lesson', v: lesson('b') }, { k: 'lesson', v: lesson('a', { step: 'name' }) }]);
    expect(o.entries().map((e) => (e.k === 'lesson' ? `${e.v.lessonId}:${e.v.step}` : ''))).toEqual(['b:hook', 'a:name']);
  });

  it('keeps only the highest score for a game, and ignores a lower or equal one', () => {
    const o = new Outbox(new MemoryStorage());
    o.add([{ k: 'game', v: { gameId: 'g', score: 10 } }, { k: 'game', v: { gameId: 'g', score: 5 } }, { k: 'game', v: { gameId: 'g', score: 10 } }]);
    expect(o.size()).toBe(1);
    o.add([{ k: 'game', v: { gameId: 'g', score: 12 } }, { k: 'game', v: { gameId: 'other', score: 1 } }]);
    expect(o.entries().map((e) => (e.k === 'game' ? [e.v.gameId, e.v.score] : null))).toEqual([['g', 12], ['other', 1]]);
  });

  it('does not queue the same attempt or mock result twice', () => {
    const o = new Outbox(new MemoryStorage());
    o.add([{ k: 'attempt', v: attempt(1) }, { k: 'attempt', v: attempt(1) }, { k: 'mock', v: mock(0.5) }, { k: 'mock', v: mock(0.5) }, { k: 'mock', v: mock(0.6) }]);
    expect(o.entries().map((e) => e.k)).toEqual(['attempt', 'mock', 'mock']);
  });

  it('cuts batches to the request limits and hands out the rest next time', () => {
    const o = new Outbox(new MemoryStorage());
    o.add(Array.from({ length: LIMITS.syncAttempts + 30 }, (_, i) => ({ k: 'attempt' as const, v: attempt(i) })));
    const first = o.nextBatch()!;
    expect(first.batch.attempts).toHaveLength(LIMITS.syncAttempts);
    o.remove(first.ids);
    const second = o.nextBatch()!;
    expect(second.batch.attempts).toHaveLength(30);
    expect(second.batch.attempts[0]!.questionId).toBe(`q-${LIMITS.syncAttempts}`);
    o.remove(second.ids);
    expect(o.size()).toBe(0);
  });

  it('removes only what was confirmed: work added while a batch was in flight stays', () => {
    const o = new Outbox(new MemoryStorage());
    o.add([{ k: 'lesson', v: lesson('a') }]);
    const inFlight = o.nextBatch()!;
    o.add([{ k: 'lesson', v: lesson('b') }]);
    o.remove(inFlight.ids);
    expect(o.entries().map((e) => (e.k === 'lesson' ? e.v.lessonId : ''))).toEqual(['b']);
  });

  it('survives a reload: a new Outbox over the same storage sees everything, and ids keep counting up', () => {
    const storage = new MemoryStorage();
    const first = new Outbox(storage);
    first.add([{ k: 'lesson', v: lesson('a') }, { k: 'attempt', v: attempt(1) }]);
    const reloaded = new Outbox(storage);
    expect(reloaded.entries()).toEqual(first.entries());
    reloaded.add([{ k: 'attempt', v: attempt(2) }]);
    expect(reloaded.entries().map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('two tabs share one queue', () => {
    const storage = new MemoryStorage();
    const a = new Outbox(storage);
    const b = new Outbox(storage);
    a.add([{ k: 'attempt', v: attempt(1) }]);
    b.add([{ k: 'attempt', v: attempt(2) }]);
    expect(a.size()).toBe(2);
    const batch = b.nextBatch()!;
    a.remove(batch.ids);
    expect(b.size()).toBe(0);
  });

  it('reads corrupt storage as empty, and drops malformed entries', () => {
    const storage = new MemoryStorage();
    storage.setItem(OUTBOX_KEY, '{not json');
    expect(new Outbox(storage).size()).toBe(0);
    storage.setItem(OUTBOX_KEY, JSON.stringify({ v: 1, next: 5, entries: [{ id: 1, k: 'lesson', v: lesson('a') }, { id: 'x' }, null, { id: 2, k: 'bogus', v: {} }] }));
    expect(new Outbox(storage).size()).toBe(1);
    storage.setItem(OUTBOX_KEY, JSON.stringify({ v: 2, entries: [] }));
    expect(new Outbox(storage).size()).toBe(0);
  });

  it('keeps working in memory when storage is full or missing', () => {
    const full = new MemoryStorage();
    full.setItem = () => {
      throw new Error('quota');
    };
    const o = new Outbox(full);
    o.add([{ k: 'lesson', v: lesson('a') }]);
    o.add([{ k: 'lesson', v: lesson('b') }]);
    expect(o.size()).toBe(2);
    const none = new Outbox(undefined);
    none.add([{ k: 'attempt', v: attempt(1) }]);
    expect(none.size()).toBe(1);
  });

  it('removes its storage key when it empties, and clear() forgets everything', () => {
    const storage = new MemoryStorage();
    const o = new Outbox(storage);
    o.add([{ k: 'attempt', v: attempt(1) }]);
    expect(storage.getItem(OUTBOX_KEY)).not.toBeNull();
    o.remove(o.nextBatch()!.ids);
    expect(storage.getItem(OUTBOX_KEY)).toBeNull();
    o.add([{ k: 'attempt', v: attempt(2) }]);
    o.clear();
    expect(o.size()).toBe(0);
    expect(storage.getItem(OUTBOX_KEY)).toBeNull();
  });

  it('past its cap, drops the oldest attempts first and keeps lessons', () => {
    const o = new Outbox(new MemoryStorage());
    o.add([{ k: 'lesson', v: lesson('keep') }]);
    o.add(Array.from({ length: MAX_OUTBOX + 10 }, (_, i) => ({ k: 'attempt' as const, v: attempt(i) })));
    expect(o.size()).toBe(MAX_OUTBOX);
    expect(o.entries().some((e) => e.k === 'lesson')).toBe(true);
    const firstAttempt = o.entries().find((e) => e.k === 'attempt')!;
    expect(firstAttempt.k === 'attempt' && firstAttempt.v.questionId).toBe('q-11');
  });
});
