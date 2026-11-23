/**
 * The shape of progress on the wire between the browser and /api/account/progress/*, and the
 * validators both sides use. Every limit here mirrors a check in supabase/migrations/0001_init.sql
 * (enum values, id patterns, ranges), so a row the route accepts is a row the database accepts.
 * No account strings or paths in this file: the browser's normal (switch off) bundle may import it.
 */
import { z } from 'zod';
import { GRADES, STEP_ORDER } from '@/lesson/schema';

export const LESSON_STATES = ['not-started', 'in-progress', 'complete', 'mastered'] as const;

/**
 * The question types the database `question_type` enum holds: 0001's nine plus the four that 0003
 * added (applied to the real project by the owner on 23 Nov 2026). `src/db/progress-sql.test.ts`
 * fails if the enum and this list ever disagree.
 */
export const DB_QUESTION_TYPES = [
  'note-on-stave',
  'play-keyboard',
  'tap-rhythm',
  'by-ear',
  'complete-bar',
  'spot-mistake',
  'ordering',
  'multiple-choice',
  'match-up',
  'place-bar-lines',
  'fix-beaming',
  'write-key-signature',
  'find-in-passage',
] as const;

/** Per-request bounds. The sync route takes small batches; guest merge takes what the database function allows. */
export const LIMITS = {
  syncLessons: 100,
  syncAttempts: 200,
  syncGames: 20,
  syncMocks: 20,
  mergeLessons: 500,
  mergeAttempts: 5000,
  snapshotAttempts: 1000,
} as const;

const MIN_AT = Date.parse('2020-01-01T00:00:00Z');
const DAY_MS = 86_400_000;

const kebab = z
  .string()
  .max(100)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const skill = z
  .string()
  .max(100)
  .regex(/^[a-z0-9-]+(\.[a-z0-9-]+){1,3}$/);
const fraction = z.number().min(0).max(1);

export const lessonWireSchema = z.object({
  lessonId: kebab,
  state: z.enum(LESSON_STATES),
  step: z.enum(STEP_ORDER),
  questionIndex: z.number().int().min(0).max(1000),
  bestScore: fraction.nullable(),
});
export type LessonWire = z.infer<typeof lessonWireSchema>;

/** ISO 8601 with a zone, between 2020-01-01 and a day from now (the same bounds merge_guest_progress applies). */
const isoAt = (now: () => number) =>
  z
    .string()
    .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$/)
    .refine((s) => {
      const t = Date.parse(s);
      return Number.isFinite(t) && t >= MIN_AT && t <= now() + DAY_MS;
    });

export function attemptWireSchema(now: () => number = Date.now) {
  return z.object({
    lessonId: kebab,
    step: z.enum(STEP_ORDER),
    questionId: kebab,
    skill,
    type: z.enum(DB_QUESTION_TYPES),
    correct: z.boolean(),
    score: fraction,
    msTaken: z.number().int().min(0).max(3_600_000),
    seed: z
      .number()
      .int()
      .refine((n) => Math.abs(n) < 1e15)
      .optional(),
    at: isoAt(now),
  });
}
export type AttemptWire = z.infer<ReturnType<typeof attemptWireSchema>>;

export const GAME_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const gameWireSchema = z.object({
  gameId: z.string().max(50).regex(GAME_ID),
  score: z.number().int().min(0).max(1_000_000),
});
export type GameWire = z.infer<typeof gameWireSchema>;

const breakdownSchema = z
  .record(z.string().max(60).regex(/^[a-z0-9-]+(\.[a-z0-9-]+){0,3}$/), fraction)
  .refine((b) => Object.keys(b).length <= 60 && JSON.stringify(b).length <= 4096);
export const mockWireSchema = z.object({
  grade: z.enum(GRADES),
  score: fraction,
  breakdown: breakdownSchema,
});
export type MockWire = z.infer<typeof mockWireSchema>;

/** What GET /progress returns. Times are ISO strings. */
export interface SnapshotWire {
  lessons: {
    lessonId: string;
    state: (typeof LESSON_STATES)[number];
    step: (typeof STEP_ORDER)[number];
    questionIndex: number;
    bestScore: number | null;
    updatedAt: string;
  }[];
  attempts: (AttemptWire & { at: string })[];
  /** Best score per game id. */
  games: Record<string, number>;
  mocks: { grade: (typeof GRADES)[number]; score: number; at: string }[];
}

export interface BatchWire {
  lessons: LessonWire[];
  attempts: AttemptWire[];
  games: GameWire[];
  mocks: MockWire[];
}

export interface SkippedCounts {
  lessons: number;
  attempts: number;
  games: number;
  mocks: number;
}

/** Keeps the items that pass `schema`; counts the rest. Never throws. */
export function keepValid<T>(schema: z.ZodType<T>, items: readonly unknown[]): { ok: T[]; skipped: number } {
  const ok: T[] = [];
  for (const item of items) {
    const r = schema.safeParse(item);
    if (r.success) ok.push(r.data);
  }
  return { ok, skipped: items.length - ok.length };
}

// --- game ids -------------------------------------------------------------------

/** A stored game id is the game plus its variant, e.g. `key-hunt` + `grade-1:sig-to-key:timed`. */
const COLON = '-colon-';

export function encodeGameId(game: string, variant: string | null): string | null {
  const id = variant === null ? game : `${game}-${variant.replace(/:/g, COLON)}`;
  return id.length <= 50 && GAME_ID.test(id) ? id : null;
}

/** Splits a stored game id back into the game and the variant the device keys its best by. */
export function decodeGameId(id: string, games: readonly string[]): { game: string; variant: string | null } | null {
  for (const g of games) {
    if (id === g) return { game: g, variant: null };
    if (id.startsWith(`${g}-`)) return { game: g, variant: id.slice(g.length + 1).split(COLON).join(':') };
  }
  return null;
}

// --- mock results ---------------------------------------------------------------

/** The mock config id that goes with a grade. Mock tests are named `grade-<n>`. */
export const mockConfigIdFor = (grade: string) => `grade-${grade}`;
export function gradeOfMockConfig(configId: string): (typeof GRADES)[number] | null {
  const m = /^grade-(start|[1-8])$/.exec(configId);
  return m ? (m[1] as (typeof GRADES)[number]) : null;
}
