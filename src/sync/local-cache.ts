/**
 * This device's saved progress as the rest of the app already keeps it (localStorage, `mtn:v1:*` keys), seen
 * from the sync side: read it, fold the account's copy into it, set it aside, wipe it. Settings are never
 * touched here. Storage is injectable; every read is tolerant (corrupt reads as empty) and every write that
 * fails is ignored (the page keeps working in memory, as the rest of the app does).
 */
import { GAMES } from '@/components/site/games';
import type { AttemptEvent, LessonProgress } from '@/lesson/contracts';
import { ATTEMPTS_KEY, MAX_ATTEMPTS, PROGRESS_KEY } from '@/lesson/progress/local';
import { STEP_ORDER } from '@/lesson/schema';
import { MAX_MOCK_ATTEMPTS, MOCK_RESULTS_KEY, mockAttemptSchema, type MockAttempt } from '@/mock/store';
import { lessonAheadOf, mergeAttempts, mergeBests, mergeLessonLists } from './merge';
import {
  LESSON_STATES, LIMITS, attemptWireSchema, decodeGameId, encodeGameId, gameWireSchema, gradeOfMockConfig,
  keepValid, mockConfigIdFor, type AttemptWire, type BatchWire, type SnapshotWire,
} from './wire';

/** Which account's progress the device's progress keys currently hold, if any. Absent means guest data. */
export const OWNER_KEY = 'mtn:v1:sync-owner';
/** Guest progress set aside while an account's progress is on the device. One JSON object of key -> text. */
export const STASH_KEY = 'mtn:v1:guest-stash';

/** Every key that holds learning progress (not settings, not the outbox, not the markers above). */
export const PROGRESS_STORAGE_KEYS: readonly string[] = [
  PROGRESS_KEY,
  ATTEMPTS_KEY,
  MOCK_RESULTS_KEY,
  ...GAMES.flatMap((g) => (g.best ? [g.best.key] : [])),
];

export function defaultStorage(): Storage | undefined {
  try {
    return typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function get(s: Storage | undefined, key: string): string | null {
  try {
    return s?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function set(s: Storage | undefined, key: string, value: string): void {
  try {
    s?.setItem(key, value);
  } catch {
    /* full or blocked: ignore */
  }
}
function del(s: Storage | undefined, key: string): void {
  try {
    s?.removeItem(key);
  } catch {
    /* ignore */
  }
}
function json(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// --- reading ---------------------------------------------------------------------

export function readLessons(s: Storage | undefined): LessonProgress[] {
  const v = json(get(s, PROGRESS_KEY));
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return [];
  const out: LessonProgress[] = [];
  for (const [id, p] of Object.entries(v as Record<string, Partial<LessonProgress>>)) {
    if (
      p && p.lessonId === id && (LESSON_STATES as readonly string[]).includes(p.state ?? '') &&
      (STEP_ORDER as readonly string[]).includes(p.step ?? '') && typeof p.questionIndex === 'number' &&
      (p.bestScore === null || typeof p.bestScore === 'number') && typeof p.updatedAt === 'string'
    ) out.push(p as LessonProgress);
  }
  return out;
}

export function readAttempts(s: Storage | undefined): AttemptEvent[] {
  const v = json(get(s, ATTEMPTS_KEY));
  return Array.isArray(v)
    ? (v.filter(
        (a): a is AttemptEvent =>
          !!a && typeof a.lessonId === 'string' && typeof a.questionId === 'string' && typeof a.correct === 'boolean' && typeof a.at === 'string',
      ) as AttemptEvent[])
    : [];
}

export function readMocks(s: Storage | undefined): MockAttempt[] {
  const v = json(get(s, MOCK_RESULTS_KEY));
  if (!Array.isArray(v)) return [];
  const out: MockAttempt[] = [];
  for (const row of v) {
    const r = mockAttemptSchema.safeParse(row);
    if (r.success) out.push(r.data);
  }
  return out;
}

/** Best score per stored game id, from the four games' own keys. */
export function readGameBests(s: Storage | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of GAMES) {
    if (!g.best) continue;
    const raw = json(get(s, g.best.key));
    if (g.best.shape === 'single') {
      const n = Number(get(s, g.best.key));
      const id = encodeGameId(g.id, null);
      if (id && Number.isFinite(n) && n > 0) out[id] = Math.floor(n);
    } else if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      for (const [variant, n] of Object.entries(raw)) {
        const id = encodeGameId(g.id, variant);
        if (id && typeof n === 'number' && Number.isFinite(n) && n > 0) out[id] = Math.floor(n);
      }
    }
  }
  return out;
}

export function hasProgress(s: Storage | undefined): boolean {
  return (
    readLessons(s).length > 0 || readAttempts(s).length > 0 || readMocks(s).length > 0 ||
    Object.keys(readGameBests(s)).length > 0
  );
}

// --- what to send ------------------------------------------------------------------

export function lessonToWire(p: LessonProgress) {
  return { lessonId: p.lessonId, state: p.state, step: p.step, questionIndex: Math.max(0, Math.min(1000, Math.floor(p.questionIndex))), bestScore: p.bestScore };
}

/** One attempt as the wire wants it, or null when the database cannot hold it (see DB_QUESTION_TYPES). */
export function attemptToWire(a: AttemptEvent, now: () => number = Date.now): AttemptWire | null {
  const candidate = {
    lessonId: a.lessonId, step: a.step, questionId: a.questionId, skill: a.skill, type: a.type, correct: a.correct,
    score: a.score, msTaken: Math.max(0, Math.min(3_600_000, Math.round(a.msTaken))),
    ...(a.seed !== undefined ? { seed: a.seed } : {}), at: a.at,
  };
  const r = attemptWireSchema(now).safeParse(candidate);
  return r.success ? r.data : null;
}

export function mockToWire(a: MockAttempt) {
  const grade = gradeOfMockConfig(a.configId);
  if (!grade) return null;
  const breakdown: Record<string, number> = {};
  for (const sk of a.skills) {
    if (sk.total > 0 && /^[a-z0-9-]+(\.[a-z0-9-]+){0,3}$/.test(sk.skill) && sk.skill.length <= 60 && Object.keys(breakdown).length < 60) {
      breakdown[sk.skill] = Math.max(0, Math.min(1, sk.correct / sk.total));
    }
  }
  return { grade, score: a.score, breakdown };
}

/** Everything on the device in the shape the routes take. Bounded the way the database function is. */
export function guestPayload(s: Storage | undefined, now: () => number = Date.now): BatchWire {
  const lessons = readLessons(s).slice(0, LIMITS.mergeLessons).map(lessonToWire);
  const attempts: AttemptWire[] = [];
  for (const a of readAttempts(s).slice(-LIMITS.mergeAttempts)) {
    const w = attemptToWire(a, now);
    if (w) attempts.push(w);
  }
  const games = keepValid(gameWireSchema, Object.entries(readGameBests(s)).map(([gameId, score]) => ({ gameId, score }))).ok;
  const mocks = readMocks(s).flatMap((m) => {
    const w = mockToWire(m);
    return w ? [w] : [];
  });
  return { lessons, attempts, games, mocks };
}

// --- folding the account's copy in ------------------------------------------------------

/** Account mock results come back as scores only: no marks total, and the band is read from the score. */
const MOCK_MARKS = { passMark: 0.66, meritMark: 0.8, distinctionMark: 0.9 };
/** Same rule as `bandFor` in src/mock/engine.ts (a test keeps them equal); not imported, to keep that engine out of this chunk. */
export function bandOfScore(fraction: number): MockAttempt['band'] {
  const f = fraction + 1e-9;
  if (f >= MOCK_MARKS.distinctionMark) return 'distinction';
  if (f >= MOCK_MARKS.meritMark) return 'merit';
  if (f >= MOCK_MARKS.passMark) return 'pass';
  return 'not-yet';
}

function writeBests(s: Storage | undefined, bests: Record<string, number>): boolean {
  let changed = false;
  for (const g of GAMES) {
    if (!g.best) continue;
    const mine: Record<string, number> = {};
    for (const [id, n] of Object.entries(bests)) {
      const d = decodeGameId(id, [g.id]);
      if (d && d.game === g.id) mine[d.variant ?? ''] = n;
    }
    if (g.best.shape === 'single') {
      const n = mine[''];
      if (n !== undefined && n > Number(get(s, g.best.key) ?? 0)) {
        set(s, g.best.key, String(n));
        changed = true;
      }
    } else {
      const raw = json(get(s, g.best.key));
      const current: Record<string, number> = {};
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        for (const [k, v] of Object.entries(raw)) if (typeof v === 'number') current[k] = v;
      }
      const merged = mergeBests(current, mine);
      if (JSON.stringify(merged) !== JSON.stringify(current)) {
        set(s, g.best.key, JSON.stringify(merged));
        changed = true;
      }
    }
  }
  return changed;
}

/** Folds the account's progress into this device's. Never lowers anything. Returns true when something changed. */
export function applySnapshot(s: Storage | undefined, snap: SnapshotWire, pendingLessons: ReadonlySet<string> = new Set()): boolean {
  let changed = false;

  const localLessons = readLessons(s);
  // A lesson with a save still waiting to be sent is newer than anything the account can say about it.
  const mergedLessons = mergeLessonLists(
    localLessons,
    snap.lessons.map((l) => ({ ...l, updatedAt: pendingLessons.has(l.lessonId) ? new Date(0).toISOString() : l.updatedAt })),
  );
  const asMap = (list: LessonProgress[]) => Object.fromEntries(list.map((p) => [p.lessonId, p]));
  if (JSON.stringify(asMap(localLessons)) !== JSON.stringify(asMap(mergedLessons)) ) {
    set(s, PROGRESS_KEY, JSON.stringify(asMap(mergedLessons)));
    changed = true;
  }

  const localAttempts = readAttempts(s);
  const remoteAttempts: AttemptEvent[] = snap.attempts.map((a) => ({ ...a }));
  const mergedAttempts = mergeAttempts(localAttempts, remoteAttempts, MAX_ATTEMPTS);
  if (mergedAttempts.length !== localAttempts.length) {
    set(s, ATTEMPTS_KEY, JSON.stringify(mergedAttempts));
    changed = true;
  }

  if (writeBests(s, snap.games)) changed = true;

  const localMocks = readMocks(s);
  const added: MockAttempt[] = [];
  for (const m of snap.mocks) {
    const configId = mockConfigIdFor(m.grade);
    if (localMocks.some((l) => l.configId === configId && l.score === m.score) || added.some((l) => l.configId === configId && l.score === m.score)) continue;
    added.push({
      configId, at: m.at, seed: 0, score: m.score, correct: 0, total: 0, band: bandOfScore(m.score),
      timedOut: false, elapsedMs: 0, sections: [], skills: [],
    });
  }
  if (added.length) {
    const all = [...localMocks, ...added].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    set(s, MOCK_RESULTS_KEY, JSON.stringify(all.length > MAX_MOCK_ATTEMPTS ? all.slice(-MAX_MOCK_ATTEMPTS) : all));
    changed = true;
  }
  return changed;
}

/**
 * What this device has that the account does not (progress made before the account was known, or a lost
 * write). Sent after each fold-in so the two end up the same.
 */
export function unsyncedAgainst(s: Storage | undefined, snap: SnapshotWire): BatchWire {
  const remoteLessons = new Map(snap.lessons.map((l) => [l.lessonId, { ...l } as LessonProgress]));
  const lessons = readLessons(s)
    .filter((p) => lessonAheadOf(p, remoteLessons.get(p.lessonId)))
    .map(lessonToWire);
  const games = Object.entries(readGameBests(s))
    .filter(([id, n]) => n > (snap.games[id] ?? 0))
    .map(([gameId, score]) => ({ gameId, score }));
  const mocks = readMocks(s).flatMap((m) => {
    const grade = gradeOfMockConfig(m.configId);
    if (!grade || snap.mocks.some((r) => r.grade === grade && r.score === m.score)) return [];
    const w = mockToWire(m);
    return w ? [w] : [];
  });
  return { lessons, attempts: [], games, mocks };
}

// --- setting aside and wiping ----------------------------------------------------------

export function readOwner(s: Storage | undefined): string | null {
  return get(s, OWNER_KEY);
}
export function writeOwner(s: Storage | undefined, owner: string | null): void {
  if (owner === null) del(s, OWNER_KEY);
  else set(s, OWNER_KEY, owner);
}

export function clearProgress(s: Storage | undefined): void {
  for (const k of PROGRESS_STORAGE_KEYS) del(s, k);
}

/** Moves the device's progress into the stash and empties the progress keys. */
export function stashProgress(s: Storage | undefined): void {
  const stash: Record<string, string> = {};
  for (const k of PROGRESS_STORAGE_KEYS) {
    const v = get(s, k);
    if (v !== null) stash[k] = v;
  }
  if (Object.keys(stash).length) set(s, STASH_KEY, JSON.stringify(stash));
  clearProgress(s);
}

export function hasStash(s: Storage | undefined): boolean {
  const v = json(get(s, STASH_KEY));
  return typeof v === 'object' && v !== null && Object.keys(v).length > 0;
}

/** Puts the stash back as the device's progress and removes it. Returns true if there was one. */
export function restoreStash(s: Storage | undefined): boolean {
  const v = json(get(s, STASH_KEY));
  del(s, STASH_KEY);
  if (typeof v !== 'object' || v === null) return false;
  let any = false;
  for (const [k, text] of Object.entries(v as Record<string, unknown>)) {
    if (PROGRESS_STORAGE_KEYS.includes(k) && typeof text === 'string') {
      set(s, k, text);
      any = true;
    }
  }
  return any;
}

/** Everything the account put on this device is removed and any set-aside guest progress comes back. */
export function wipeAccountCache(s: Storage | undefined): void {
  clearProgress(s);
  restoreStash(s);
  writeOwner(s, null);
}
