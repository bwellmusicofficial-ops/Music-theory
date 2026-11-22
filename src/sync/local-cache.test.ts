import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '@/lesson/player/test-fixtures';
import { ATTEMPTS_KEY, PROGRESS_KEY } from '@/lesson/progress/local';
import { MOCK_RESULTS_KEY } from '@/mock/store';
import { SETTINGS_KEY } from '@/settings/storage';
import {
  OWNER_KEY, STASH_KEY, applySnapshot, attemptToWire, clearProgress, guestPayload, hasProgress, hasStash, mockToWire,
  readGameBests, readLessons, restoreStash, stashProgress, unsyncedAgainst, wipeAccountCache, writeOwner,
} from './local-cache';
import { attemptEvent, lessonProgress } from './test-support';
import type { SnapshotWire } from './wire';

const emptySnap = (over: Partial<SnapshotWire> = {}): SnapshotWire => ({ lessons: [], attempts: [], games: {}, mocks: [], ...over });
const put = (s: Storage, key: string, v: unknown) => s.setItem(key, typeof v === 'string' ? v : JSON.stringify(v));

describe('reading what is on the device', () => {
  it('reads the four games\' own keys into stored game ids, ignoring junk', () => {
    const s = new MemoryStorage();
    put(s, 'mtn:v1:note-rush-best', '120');
    put(s, 'mtn:v1:tap-it-best', { '60': 45, '120': 'x', '-5': -1 });
    put(s, 'mtn:v1:key-hunt-best', { 'grade-1:sig-to-key:timed': 310.9 });
    put(s, 'mtn:v1:term-blitz-best', '{broken');
    expect(readGameBests(s)).toEqual({ 'note-rush': 120, 'tap-it-60': 45, 'key-hunt-grade-1-colon-sig-to-key-colon-timed': 310 });
  });

  it('knows whether there is any progress, and treats corrupt data as none', () => {
    const s = new MemoryStorage();
    expect(hasProgress(s)).toBe(false);
    put(s, PROGRESS_KEY, '{nope');
    put(s, ATTEMPTS_KEY, '[1,2,3]');
    expect(hasProgress(s)).toBe(false);
    put(s, 'mtn:v1:note-rush-best', '1');
    expect(hasProgress(s)).toBe(true);
    expect(hasProgress(undefined)).toBe(false);
  });

  it('settings alone are not progress', () => {
    const s = new MemoryStorage();
    put(s, SETTINGS_KEY, { theme: 'light' });
    expect(hasProgress(s)).toBe(false);
  });
});

describe('what is sent', () => {
  it('turns an attempt into the wire shape, clamps the time, and refuses what the database cannot hold', () => {
    expect(attemptToWire(attemptEvent(1, { msTaken: 9_999_999 }))?.msTaken).toBe(3_600_000);
    expect(attemptToWire(attemptEvent(1, { seed: 12 }))?.seed).toBe(12);
    expect(attemptToWire(attemptEvent(1, { type: 'find-in-passage' }))).toBeNull();
    expect(attemptToWire(attemptEvent(1, { questionId: 'Has Spaces' }))).toBeNull();
    expect(attemptToWire(attemptEvent(1, { at: '2001-01-01T00:00:00Z' }))).toBeNull();
  });

  it('builds the guest payload from the device, leaving out what cannot be stored', () => {
    const s = new MemoryStorage();
    put(s, PROGRESS_KEY, { 'g1-rhythm-01': lessonProgress() });
    put(s, ATTEMPTS_KEY, [attemptEvent(1), attemptEvent(2, { type: 'fix-beaming' })]);
    put(s, 'mtn:v1:note-rush-best', '9');
    const p = guestPayload(s);
    expect(p.lessons).toEqual([{ lessonId: 'g1-rhythm-01', state: 'in-progress', step: 'practice', questionIndex: 2, bestScore: null }]);
    expect(p.attempts).toHaveLength(1);
    expect(p.games).toEqual([{ gameId: 'note-rush', score: 9 }]);
    expect(p.mocks).toEqual([]);
  });

  it('sends mock results as a grade, a score and per-skill fractions; a test it cannot name is not sent', () => {
    const base = { at: new Date().toISOString(), seed: 1, score: 0.5, correct: 1, total: 2, band: 'not-yet' as const, timedOut: false, elapsedMs: 1, sections: [] };
    expect(mockToWire({ ...base, configId: 'grade-3', skills: [{ skill: 'a.b', correct: 1, total: 4 }, { skill: 'c.d', correct: 0, total: 0 }, { skill: 'Bad Skill', correct: 1, total: 1 }] }))
      .toEqual({ grade: '3', score: 0.5, breakdown: { 'a.b': 0.25 } });
    expect(mockToWire({ ...base, configId: 'practice', skills: [] })).toBeNull();
  });
});

describe('applySnapshot', () => {
  it('adds what the account has, never lowers what the device has, and reports whether anything changed', () => {
    const s = new MemoryStorage();
    put(s, PROGRESS_KEY, { 'g1-rhythm-01': lessonProgress({ state: 'complete', bestScore: 0.9 }) });
    put(s, 'mtn:v1:note-rush-best', '100');
    const changed = applySnapshot(s, emptySnap({
      lessons: [
        { lessonId: 'g1-rhythm-01', state: 'in-progress', step: 'hook', questionIndex: 0, bestScore: 0.3, updatedAt: '2000-01-01T00:00:00.000Z' },
        { lessonId: 'g1-pitch-01', state: 'complete', step: 'recap', questionIndex: 0, bestScore: 1, updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
      games: { 'note-rush': 40, 'tap-it-60': 70 },
    }));
    expect(changed).toBe(true);
    const lessons = Object.fromEntries(readLessons(s).map((l) => [l.lessonId, l]));
    expect(lessons['g1-rhythm-01']).toMatchObject({ state: 'complete', bestScore: 0.9 });
    expect(lessons['g1-pitch-01']).toMatchObject({ state: 'complete' });
    expect(s.getItem('mtn:v1:note-rush-best')).toBe('100');
    expect(JSON.parse(s.getItem('mtn:v1:tap-it-best')!)).toEqual({ '60': 70 });
  });

  it('is idempotent: applying the same snapshot again changes nothing', () => {
    const s = new MemoryStorage();
    const snap = emptySnap({
      lessons: [{ lessonId: 'g1-pitch-01', state: 'complete', step: 'recap', questionIndex: 0, bestScore: 1, updatedAt: '2026-01-01T00:00:00.000Z' }],
      attempts: [{ ...attemptEvent(1) } as SnapshotWire['attempts'][number]],
      games: { 'note-rush': 5 },
      mocks: [{ grade: '1', score: 0.7, at: '2026-01-01T00:00:00.000Z' }],
    });
    expect(applySnapshot(s, snap)).toBe(true);
    const before = JSON.stringify([...Array(s.length)].map((_, i) => [s.key(i), s.getItem(s.key(i)!)]));
    expect(applySnapshot(s, snap)).toBe(false);
    expect(JSON.stringify([...Array(s.length)].map((_, i) => [s.key(i), s.getItem(s.key(i)!)]))).toBe(before);
  });

  it('does not add a mock result the device already has under another timestamp', () => {
    const s = new MemoryStorage();
    put(s, MOCK_RESULTS_KEY, [{ configId: 'grade-1', at: '2026-01-01T00:00:00.000Z', seed: 3, score: 0.7, correct: 14, total: 20, band: 'pass', timedOut: false, elapsedMs: 1, sections: [], skills: [] }]);
    expect(applySnapshot(s, emptySnap({ mocks: [{ grade: '1', score: 0.7, at: '2026-02-02T00:00:00.000Z' }] }))).toBe(false);
  });

  it('ignores game ids it does not know', () => {
    const s = new MemoryStorage();
    expect(applySnapshot(s, emptySnap({ games: { 'mystery-game': 5 } }))).toBe(false);
  });
});

describe('unsyncedAgainst', () => {
  it('lists only what the account lacks', () => {
    const s = new MemoryStorage();
    put(s, PROGRESS_KEY, { a: lessonProgress({ lessonId: 'a', bestScore: 0.9 }), b: lessonProgress({ lessonId: 'b' }) });
    put(s, 'mtn:v1:note-rush-best', '50');
    put(s, 'mtn:v1:tap-it-best', { '60': 10, '120': 99 });
    const batch = unsyncedAgainst(s, emptySnap({
      lessons: [
        { lessonId: 'a', state: 'in-progress', step: 'practice', questionIndex: 2, bestScore: 0.5, updatedAt: '2026-01-01T00:00:00.000Z' },
        { lessonId: 'b', state: 'in-progress', step: 'practice', questionIndex: 2, bestScore: null, updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
      games: { 'note-rush': 50, 'tap-it-60': 20, 'tap-it-120': 10 },
    }));
    expect(batch.lessons.map((l) => l.lessonId)).toEqual(['a']);
    expect(batch.games).toEqual([{ gameId: 'tap-it-120', score: 99 }]);
  });
});

describe('setting aside, restoring and wiping', () => {
  const seed = () => {
    const s = new MemoryStorage();
    put(s, PROGRESS_KEY, { a: lessonProgress({ lessonId: 'a' }) });
    put(s, ATTEMPTS_KEY, [attemptEvent(1)]);
    put(s, 'mtn:v1:note-rush-best', '7');
    put(s, SETTINGS_KEY, { theme: 'light' });
    return s;
  };

  it('stash moves progress aside and restore puts it back exactly, leaving settings alone', () => {
    const s = seed();
    const before = [PROGRESS_KEY, ATTEMPTS_KEY, 'mtn:v1:note-rush-best'].map((k) => s.getItem(k));
    stashProgress(s);
    expect(hasProgress(s)).toBe(false);
    expect(hasStash(s)).toBe(true);
    expect(s.getItem(SETTINGS_KEY)).not.toBeNull();
    expect(restoreStash(s)).toBe(true);
    expect([PROGRESS_KEY, ATTEMPTS_KEY, 'mtn:v1:note-rush-best'].map((k) => s.getItem(k))).toEqual(before);
    expect(hasStash(s)).toBe(false);
    expect(restoreStash(s)).toBe(false);
  });

  it('restore ignores keys that are not progress keys, so a tampered stash cannot write elsewhere', () => {
    const s = new MemoryStorage();
    put(s, STASH_KEY, { [SETTINGS_KEY]: '{"theme":"x"}', 'other:key': 'y', [PROGRESS_KEY]: '{}' });
    restoreStash(s);
    expect(s.getItem(SETTINGS_KEY)).toBeNull();
    expect(s.getItem('other:key')).toBeNull();
    expect(s.getItem(PROGRESS_KEY)).toBe('{}');
  });

  it('wipeAccountCache removes progress and the owner marker, keeps settings, restores the stash', () => {
    const s = seed();
    writeOwner(s, 'kid');
    stashProgress(s);
    put(s, PROGRESS_KEY, { acct: lessonProgress({ lessonId: 'acct' }) });
    wipeAccountCache(s);
    expect(s.getItem(OWNER_KEY)).toBeNull();
    expect(readLessons(s).map((l) => l.lessonId)).toEqual(['a']);
    expect(s.getItem(SETTINGS_KEY)).not.toBeNull();
    clearProgress(s);
    expect(hasProgress(s)).toBe(false);
  });

  it('survives storage that throws', () => {
    const s = new MemoryStorage();
    s.getItem = () => {
      throw new Error('blocked');
    };
    s.setItem = () => {
      throw new Error('blocked');
    };
    expect(hasProgress(s)).toBe(false);
    expect(() => stashProgress(s)).not.toThrow();
    expect(() => wipeAccountCache(s)).not.toThrow();
    expect(() => applySnapshot(s, emptySnap({ games: { 'note-rush': 5 } }))).not.toThrow();
  });
});
