import { STEP_ORDER } from '@/lesson/schema';
import { LESSON_STATES, LIMITS, type AttemptWire, type GameWire, type LessonWire, type MockWire, type SnapshotWire } from '@/sync/wire';
import type { MergeCounts, ProgressStore } from './types';

const rank = (s: LessonWire['state']) => LESSON_STATES.indexOf(s);
const position = (l: LessonWire) => [rank(l.state), STEP_ORDER.indexOf(l.step), l.questionIndex] as const;
const greater = (a: readonly number[], b: readonly number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  return false;
};

interface StoredLesson extends LessonWire {
  updatedAt: string;
}
interface StoredMock extends MockWire {
  at: string;
}

/** One user's progress in process memory, with the same rules the database applies (see 0001_init.sql). */
export class MemoryProgressStore implements ProgressStore {
  private readonly lessons = new Map<string, StoredLesson>();
  private readonly attempts = new Map<string, AttemptWire>();
  private readonly games = new Map<string, number>();
  private readonly mocks: StoredMock[] = [];

  constructor(private readonly now: () => number = Date.now, readonly userId: string = 'memory-user') {}

  async snapshot(): Promise<SnapshotWire> {
    const attempts = [...this.attempts.values()]
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, LIMITS.snapshotAttempts)
      .map((a) => ({ ...a, at: new Date(a.at).toISOString() }));
    return {
      lessons: [...this.lessons.values()].map((l) => ({ ...l })),
      attempts,
      games: Object.fromEntries(this.games),
      mocks: [...this.mocks].reverse().map((m) => ({ grade: m.grade, score: m.score, at: m.at })),
    };
  }

  /** The rows `export_my_data()` would return for this user (same column names), for the memory backend's export. */
  exportRows(userId: string) {
    const stamp = (iso: string) => new Date(iso).toISOString();
    return {
      lesson_progress: [...this.lessons.values()]
        .sort((a, b) => a.lessonId.localeCompare(b.lessonId))
        .map((l) => ({
          user_id: userId, lesson_id: l.lessonId, state: l.state, step: l.step, question_index: l.questionIndex,
          best_score: l.bestScore, created_at: l.updatedAt, updated_at: l.updatedAt,
        })),
      attempts: [...this.attempts.values()].map((a, i) => ({
        id: i + 1, user_id: userId, lesson_id: a.lessonId, step: a.step, question_id: a.questionId, skill: a.skill, type: a.type,
        correct: a.correct, score: a.score, ms_taken: a.msTaken, seed: a.seed ?? null, source: 'authored',
        occurred_at: stamp(a.at), merged: false, created_at: stamp(a.at),
      })),
      game_scores: [...this.games].map(([gameId, score], i) => ({
        id: i + 1, user_id: userId, game_id: gameId, score, summary: {}, created_at: new Date(this.now()).toISOString(),
      })),
      mock_results: this.mocks.map((m, i) => ({
        id: i + 1, user_id: userId, grade: m.grade, score: m.score, breakdown: m.breakdown, created_at: m.at,
      })),
    };
  }

  private mergeLesson(l: LessonWire): void {
    const old = this.lessons.get(l.lessonId);
    const updatedAt = new Date(this.now()).toISOString();
    if (!old) {
      this.lessons.set(l.lessonId, { ...l, updatedAt });
      return;
    }
    const ahead = greater(position(l), position(old));
    this.lessons.set(l.lessonId, {
      lessonId: l.lessonId,
      state: rank(l.state) > rank(old.state) ? l.state : old.state,
      bestScore: l.bestScore === null ? old.bestScore : old.bestScore === null ? l.bestScore : Math.max(l.bestScore, old.bestScore),
      step: ahead ? l.step : old.step,
      questionIndex: ahead ? l.questionIndex : old.questionIndex,
      updatedAt,
    });
  }

  async saveLessons(items: readonly LessonWire[]) {
    for (const l of items) this.mergeLesson(l);
    return { skipped: 0 };
  }

  private addAttempt(a: AttemptWire): boolean {
    const key = [a.lessonId, a.step, a.questionId, Date.parse(a.at)].join('|');
    if (this.attempts.has(key)) return false;
    this.attempts.set(key, a);
    return true;
  }

  async recordAttempts(items: readonly AttemptWire[]) {
    let inserted = 0;
    for (const a of items) if (this.addAttempt(a)) inserted++;
    return { inserted };
  }

  async saveGameBests(items: readonly GameWire[]) {
    let saved = 0;
    for (const g of items) {
      if (g.score > (this.games.get(g.gameId) ?? -1)) {
        this.games.set(g.gameId, g.score);
        saved++;
      }
    }
    return { saved };
  }

  async saveMockResults(items: readonly MockWire[]) {
    let saved = 0;
    for (const m of items) {
      const same = this.mocks.some((x) => x.grade === m.grade && x.score === m.score && JSON.stringify(sortKeys(x.breakdown)) === JSON.stringify(sortKeys(m.breakdown)));
      if (same) continue;
      this.mocks.push({ ...m, at: new Date(this.now()).toISOString() });
      saved++;
    }
    return { saved };
  }

  async mergeGuest(payload: { lessons: readonly LessonWire[]; attempts: readonly AttemptWire[] }): Promise<MergeCounts> {
    if (payload.lessons.length > LIMITS.mergeLessons || payload.attempts.length > LIMITS.mergeAttempts) {
      throw new Error('payload too large');
    }
    for (const l of payload.lessons) this.mergeLesson(l);
    let inserted = 0;
    for (const a of payload.attempts) if (this.addAttempt(a)) inserted++;
    return {
      lessons_merged: payload.lessons.length,
      lessons_skipped: 0,
      attempts_inserted: inserted,
      attempts_duplicate: payload.attempts.length - inserted,
      attempts_skipped: 0,
    };
  }
}

function sortKeys(o: Record<string, number>) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}
