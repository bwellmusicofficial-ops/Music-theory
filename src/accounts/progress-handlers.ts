import { accountsEnabled } from './enabled';
import { fail, json, rateLimited, readBody, sameSite, type LoadDeps } from './handlers';
import { isKnownGameId, knownLessonIds } from './known-ids.server';
import { MERGE_REQUESTS_PER_HOUR, SYNC_REQUESTS_PER_HOUR } from './throttle';
import { RateLimitedError, type ProgressStore } from './progress/types';
import {
  LIMITS, attemptWireSchema, gameWireSchema, keepValid, lessonWireSchema, mockWireSchema, type SkippedCounts,
} from '@/sync/wire';

/**
 * Request handling for /api/account/progress/*, kept apart from Next so it can be tested with plain `Request`
 * objects and the memory backend (like ./handlers.ts, whose rules it shares: 404 when the switch is off,
 * cross-site posts refused, small JSON bodies, nothing cached, a fixed error on a fault).
 *
 * Who is writing comes only from the session cookie. No request body ever names a user.
 */

const SYNC_BODY_CHARS = 512 * 1024;
/** 5000 attempts are about 1.3 MB of JSON; the database refuses a merge over 2 MiB (0005), so refuse earlier here. */
const MERGE_BODY_CHARS = 2 * 1024 * 1024;

const notSignedIn = () => fail(401, 'not-signed-in');

/** Signed-in store, or the response to send instead. */
async function withStore(
  req: Request,
  load: LoadDeps,
  run: (store: ProgressStore) => Promise<Response>,
  /** Writes are limited per learner: the request is counted BEFORE its body is read, so a flood of junk, duplicates
   *  or invalid items costs the same as real work. `GET` passes none. */
  limit?: { kind: 'sync' | 'merge'; perHour: number },
): Promise<Response> {
  if (!accountsEnabled()) return new Response(null, { status: 404 });
  try {
    const { backend, jar } = await load();
    const store = await backend.progress(jar);
    if (!store) return notSignedIn();
    if (limit) {
      const wait = await backend.throttle.hit(`${limit.kind}:user:${store.userId}`, limit.perHour);
      if (wait > 0) return rateLimited(wait);
    }
    return await run(store);
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return json({ error: 'rate-limited', retryAfterSeconds: err.retryAfterSeconds }, 429, { 'retry-after': String(err.retryAfterSeconds) });
    }
    console.error('[accounts] progress request failed:', err instanceof Error ? err.message : 'unknown error');
    return fail(500, 'server-error');
  }
}

type Section = 'lessons' | 'attempts' | 'games' | 'mocks';

/** Keeps lessons whose id is a real lesson; the rest count as skipped. */
function onlyKnownLessons<T extends { lessonId: string }>(r: { ok: T[]; skipped: number }): { ok: T[]; skipped: number } {
  const known = knownLessonIds();
  const ok = r.ok.filter((l) => known.has(l.lessonId));
  return { ok, skipped: r.skipped + (r.ok.length - ok.length) };
}
const onlyKnownAttempts = onlyKnownLessons;

/** A section that may be absent, must be an array, and must fit the limit. Null means the request is malformed. */
function section(body: Record<string, unknown>, key: Section, max: number): unknown[] | null {
  const v = body[key];
  if (v === undefined) return [];
  return Array.isArray(v) && v.length <= max ? v : null;
}

/** GET /api/account/progress -> the snapshot */
export function handleProgressGet(req: Request, load: LoadDeps): Promise<Response> {
  return withStore(req, load, async (store) => json(await store.snapshot()));
}

/**
 * POST /api/account/progress/sync  { lessons?, attempts?, games?, mocks? } -> { ok, skipped }
 * Items that fail validation are counted and left out, never fatal: one bad item must not block the queue.
 */
export function handleProgressSync(req: Request, load: LoadDeps): Promise<Response> {
  if (!accountsEnabled()) return Promise.resolve(new Response(null, { status: 404 }));
  if (!sameSite(req)) return Promise.resolve(fail(403, 'forbidden'));
  return withStore(req, load, async (store) => {
    const body = await readBody(req, SYNC_BODY_CHARS);
    if (body instanceof Response) return body;
    const raw = {
      lessons: section(body, 'lessons', LIMITS.syncLessons),
      attempts: section(body, 'attempts', LIMITS.syncAttempts),
      games: section(body, 'games', LIMITS.syncGames),
      mocks: section(body, 'mocks', LIMITS.syncMocks),
    };
    if (Object.values(raw).some((v) => v === null)) return fail(400, 'bad-request');

    const lessons = onlyKnownLessons(keepValid(lessonWireSchema, raw.lessons!));
    const attempts = onlyKnownAttempts(keepValid(attemptWireSchema(), raw.attempts!));
    const games = keepValid(gameWireSchema, raw.games!);
    const knownGames = games.ok.filter((g) => isKnownGameId(g.gameId));
    games.skipped += games.ok.length - knownGames.length;
    games.ok = knownGames;
    const mocks = keepValid(mockWireSchema, raw.mocks!);

    // Lessons first (they matter most), attempts last (the only writes with a rate cap).
    const l = await store.saveLessons(lessons.ok);
    await store.saveGameBests(games.ok);
    await store.saveMockResults(mocks.ok);
    await store.recordAttempts(attempts.ok);
    const skipped: SkippedCounts = {
      lessons: lessons.skipped + l.skipped,
      attempts: attempts.skipped,
      games: games.skipped,
      mocks: mocks.skipped,
    };
    return json({ ok: true, skipped });
  }, { kind: 'sync', perHour: SYNC_REQUESTS_PER_HOUR });
}

/** POST /api/account/progress/merge  { lessons, attempts } -> merge_guest_progress's counts */
export function handleProgressMerge(req: Request, load: LoadDeps): Promise<Response> {
  if (!accountsEnabled()) return Promise.resolve(new Response(null, { status: 404 }));
  if (!sameSite(req)) return Promise.resolve(fail(403, 'forbidden'));
  return withStore(req, load, async (store) => {
    const body = await readBody(req, MERGE_BODY_CHARS);
    if (body instanceof Response) return body;
    const lessonsRaw = section(body, 'lessons', LIMITS.mergeLessons);
    const attemptsRaw = section(body, 'attempts', LIMITS.mergeAttempts);
    if (!lessonsRaw || !attemptsRaw) return fail(400, 'bad-request');
    const lessons = onlyKnownLessons(keepValid(lessonWireSchema, lessonsRaw));
    const attempts = onlyKnownAttempts(keepValid(attemptWireSchema(), attemptsRaw));
    const counts = await store.mergeGuest({ lessons: lessons.ok, attempts: attempts.ok });
    return json({
      ...counts,
      lessons_skipped: counts.lessons_skipped + lessons.skipped,
      attempts_skipped: counts.attempts_skipped + attempts.skipped,
    });
  }, { kind: 'merge', perHour: MERGE_REQUESTS_PER_HOUR });
}
