import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LIMITS, type AttemptWire, type GameWire, type LessonWire, type MockWire, type SnapshotWire } from '@/sync/wire';
import { RateLimitedError, type MergeCounts, type ProgressStore } from './types';

if (typeof window !== 'undefined') {
  throw new Error('SupabaseProgressStore must never be imported in the browser.');
}

type Failure = { message: string; code?: string } | null;

function must<T>(what: string, r: { data: unknown; error: Failure }): T {
  if (r.error) {
    // 53400 is the database's own "too many attempts in the last minute" (and merge's hourly cap).
    if (r.error.code === '53400') throw new RateLimitedError(60);
    throw new Error(`${what}: ${r.error.message}`);
  }
  return r.data as T;
}

const iso = (v: unknown): string => (v instanceof Date ? v : new Date(String(v))).toISOString();

/**
 * Progress on the signed-in user's own Supabase session (the publishable key plus their cookie), never the
 * secret key, so row level security is what keeps one learner out of another's rows. Every statement here
 * is one that 0001's column grants and policies allow; `src/db/progress-sql.test.ts` runs them as the user.
 */
export class SupabaseProgressStore implements ProgressStore {
  constructor(
    private readonly client: SupabaseClient,
    /** The signed-in user's id, as the auth server confirmed it. Rows are written with it; RLS checks it again. */
    private readonly userId: string,
  ) {}

  async snapshot(): Promise<SnapshotWire> {
    const c = this.client;
    const [l, a, g, m] = await Promise.all([
      c.from('lesson_progress').select('lesson_id, state, step, question_index, best_score, updated_at').limit(1000),
      c
        .from('attempts')
        .select('lesson_id, step, question_id, skill, type, correct, score, ms_taken, seed, occurred_at')
        .order('occurred_at', { ascending: false })
        .limit(LIMITS.snapshotAttempts),
      c.from('game_scores').select('game_id, score').order('score', { ascending: false }).limit(1000),
      c.from('mock_results').select('grade, score, created_at').order('created_at', { ascending: false }).limit(200),
    ]);
    const lessons = must<Record<string, unknown>[]>('lesson_progress select', l);
    const attempts = must<Record<string, unknown>[]>('attempts select', a);
    const games = must<{ game_id: string; score: number }[]>('game_scores select', g);
    const mocks = must<Record<string, unknown>[]>('mock_results select', m);

    const best: Record<string, number> = {};
    for (const row of games) if (row.score > (best[row.game_id] ?? -1)) best[row.game_id] = row.score;
    return {
      lessons: lessons.map((r) => ({
        lessonId: r.lesson_id as string,
        state: r.state as SnapshotWire['lessons'][number]['state'],
        step: r.step as SnapshotWire['lessons'][number]['step'],
        questionIndex: r.question_index as number,
        bestScore: (r.best_score as number | null) ?? null,
        updatedAt: iso(r.updated_at),
      })),
      attempts: attempts.map((r) => ({
        lessonId: r.lesson_id as string,
        step: r.step as AttemptWire['step'],
        questionId: r.question_id as string,
        skill: r.skill as string,
        type: r.type as AttemptWire['type'],
        correct: r.correct as boolean,
        score: r.score as number,
        msTaken: r.ms_taken as number,
        ...(r.seed === null || r.seed === undefined ? {} : { seed: Number(r.seed) }),
        at: iso(r.occurred_at),
      })),
      games: best,
      mocks: mocks.map((r) => ({ grade: r.grade as SnapshotWire['mocks'][number]['grade'], score: r.score as number, at: iso(r.created_at) })),
    };
  }

  private async mergeRpc(payload: { lessons: readonly LessonWire[]; attempts: readonly AttemptWire[] }): Promise<MergeCounts> {
    return must<MergeCounts>('merge_guest_progress', await this.client.rpc('merge_guest_progress', { payload }));
  }

  /**
   * Lessons go through `merge_guest_progress` too: it is the one place that applies "keep the better result"
   * atomically (more advanced state, greater best score, furthest position), so a device that was offline for a
   * week cannot move a learner backwards. Its `merged` flag only touches attempts, which this does not send.
   */
  async saveLessons(items: readonly LessonWire[]) {
    if (items.length === 0) return { skipped: 0 };
    const r = await this.mergeRpc({ lessons: items, attempts: [] });
    return { skipped: r.lessons_skipped };
  }

  async recordAttempts(items: readonly AttemptWire[]) {
    if (items.length === 0) return { inserted: 0 };
    const rows = items.map((a) => ({
      user_id: this.userId,
      lesson_id: a.lessonId,
      step: a.step,
      question_id: a.questionId,
      skill: a.skill,
      type: a.type,
      correct: a.correct,
      score: a.score,
      ms_taken: a.msTaken,
      seed: a.seed ?? null,
      source: a.seed === undefined ? 'authored' : 'generated',
      occurred_at: a.at,
    }));
    // ON CONFLICT DO NOTHING on the table's own dedupe key: sending the same attempt twice stores it once.
    const r = await this.client
      .from('attempts')
      .upsert(rows, { onConflict: 'user_id,lesson_id,step,question_id,occurred_at', ignoreDuplicates: true })
      .select('id');
    return { inserted: must<unknown[]>('attempts upsert', r).length };
  }

  async saveGameBests(items: readonly GameWire[]) {
    const top = new Map<string, number>();
    for (const g of items) if (g.score > (top.get(g.gameId) ?? -1)) top.set(g.gameId, g.score);
    let saved = 0;
    for (const [gameId, score] of top) {
      const r = await this.client.from('game_scores').select('score').eq('game_id', gameId).order('score', { ascending: false }).limit(1);
      const current = must<{ score: number }[]>('game_scores select', r)[0]?.score ?? -1;
      if (score <= current) continue;
      must('game_scores insert', await this.client.from('game_scores').insert({ user_id: this.userId, game_id: gameId, score, summary: {} }));
      saved++;
    }
    return { saved };
  }

  async saveMockResults(items: readonly MockWire[]) {
    let saved = 0;
    for (const m of items) {
      const r = await this.client.from('mock_results').select('breakdown').eq('grade', m.grade).eq('score', m.score).limit(50);
      const same = must<{ breakdown: unknown }[]>('mock_results select', r).some((x) => JSON.stringify(sortKeys(x.breakdown)) === JSON.stringify(sortKeys(m.breakdown)));
      if (same) continue;
      must('mock_results insert', await this.client.from('mock_results').insert({ user_id: this.userId, grade: m.grade, score: m.score, breakdown: m.breakdown }));
      saved++;
    }
    return { saved };
  }

  mergeGuest(payload: { lessons: readonly LessonWire[]; attempts: readonly AttemptWire[] }) {
    return this.mergeRpc(payload);
  }
}

function sortKeys(v: unknown): unknown {
  if (typeof v !== 'object' || v === null) return v;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
}
