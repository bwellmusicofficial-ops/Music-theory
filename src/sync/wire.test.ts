import { describe, expect, it } from 'vitest';
import { GAMES } from '@/components/site/games';
import { variantOf } from '@/games/key-hunt';
import { CURATED_DECKS } from '@/games/term-blitz/deck-data';
import { GRADES } from '@/lesson/schema';
import { bandFor } from '@/mock/engine';
import { bandOfScore } from './local-cache';
import { attemptWireSchema, decodeGameId, encodeGameId, gradeOfMockConfig, lessonWireSchema, mockConfigIdFor } from './wire';

const GAME_IDS = GAMES.map((g) => g.id);

describe('game ids', () => {
  const variants: [string, string | null][] = [
    ['note-rush', null],
    ...['60', '120', '30'].map((v): [string, string] => ['tap-it', v]),
    ...['start', 'italian', ...GRADES.filter((g) => g !== 'start').map((g) => `grade-${g}`), ...Object.keys(CURATED_DECKS)].map((d): [string, string] => ['term-blitz', d]),
    ...GRADES.filter((g) => g !== 'start').flatMap((g) =>
      (['sig-to-key', 'key-to-sig'] as const).flatMap((m) =>
        [true, false].map((u): [string, string] => ['key-hunt', variantOf(`grade-${g}` as never, m, u)]),
      ),
    ),
  ];

  it.each(variants)('%s / %s survives a round trip, fits the database check and the 50 character limit', (game, variant) => {
    const id = encodeGameId(game, variant);
    expect(id).not.toBeNull();
    expect(id!.length).toBeLessThanOrEqual(50);
    expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(decodeGameId(id!, GAME_IDS)).toEqual({ game, variant });
  });

  it('gives no two variants the same id', () => {
    const ids = variants.map(([g, v]) => encodeGameId(g, v));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('refuses a variant that cannot be stored, and an id from a game it does not know', () => {
    expect(encodeGameId('tap-it', 'Not Valid')).toBeNull();
    expect(encodeGameId('tap-it', 'x'.repeat(60))).toBeNull();
    expect(decodeGameId('mystery-game-1', GAME_IDS)).toBeNull();
  });
});

describe('mock configs and grades', () => {
  it('maps a grade to its mock config and back', () => {
    for (const g of GRADES) expect(gradeOfMockConfig(mockConfigIdFor(g))).toBe(g);
    expect(gradeOfMockConfig('practice-paper')).toBeNull();
    expect(gradeOfMockConfig('grade-9')).toBeNull();
  });

  it('reads a band from a score the same way the mock engine does', () => {
    const marks = { passMark: 0.66, meritMark: 0.8, distinctionMark: 0.9 };
    for (const f of [0, 0.5, 0.65, 0.66, 0.6599999999, 0.8, 0.79, 0.9, 0.8999999999, 1]) {
      expect(bandOfScore(f), String(f)).toBe(bandFor(f, marks));
    }
  });
});

describe('validators mirror the database checks', () => {
  const lesson = { lessonId: 'g1-rhythm-01', state: 'complete', step: 'recap', questionIndex: 0, bestScore: 1 };
  it('lessons', () => {
    expect(lessonWireSchema.safeParse(lesson).success).toBe(true);
    for (const bad of [{ lessonId: 'A' }, { state: 'done' }, { step: 'x' }, { questionIndex: 1001 }, { questionIndex: 1.5 }, { bestScore: 2 }, { bestScore: -0.1 }]) {
      expect(lessonWireSchema.safeParse({ ...lesson, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
    expect(lessonWireSchema.safeParse({ ...lesson, bestScore: null }).success).toBe(true);
  });

  it('attempts, including the time window', () => {
    const now = Date.parse('2026-06-01T12:00:00Z');
    const schema = attemptWireSchema(() => now);
    const a = { lessonId: 'l-1', step: 'practice', questionId: 'q-1', skill: 'a.b', type: 'ordering', correct: true, score: 1, msTaken: 10, at: '2026-06-01T11:00:00.123Z' };
    expect(schema.safeParse(a).success).toBe(true);
    expect(schema.safeParse({ ...a, seed: 123 }).success).toBe(true);
    for (const bad of [{ at: '2019-12-31T23:59:59Z' }, { at: '2026-06-03T00:00:00Z' }, { at: 'yesterday' }, { at: '2026-06-01T11:00:00' }, { seed: 1e15 }, { seed: 1.5 }, { msTaken: 3_600_001 }, { skill: 'single' }, { type: 'fix-beaming' }]) {
      expect(schema.safeParse({ ...a, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
    expect(schema.safeParse({ ...a, at: '2026-06-02T11:00:00Z' }).success).toBe(true); // within the day of slack
  });
});
