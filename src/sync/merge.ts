/**
 * Pure merge rules for progress held in two places (this device and the account). No storage, no network.
 *
 *  - A lesson never loses a completed state or a best score. The resume position comes from whichever
 *    side was saved more recently; a tie goes to the side that is further along.
 *  - Attempts are a set, keyed the way the database keys them (lesson, step, question, time).
 *  - A game's best is the larger number. Nothing ever lowers it.
 */
import type { AttemptEvent, LessonProgress } from '@/lesson/contracts';
import { STEP_ORDER } from '@/lesson/vocab';
import { LESSON_STATES } from './wire';

const rank = (s: LessonProgress['state']) => LESSON_STATES.indexOf(s);
const stepRank = (s: LessonProgress['step']) => STEP_ORDER.indexOf(s);
const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

function furtherAlong(a: LessonProgress, b: LessonProgress): boolean {
  return (
    rank(a.state) - rank(b.state) ||
    stepRank(a.step) - stepRank(b.step) ||
    a.questionIndex - b.questionIndex
  ) > 0;
}

export function mergeLessonProgress(a: LessonProgress, b: LessonProgress): LessonProgress {
  const ta = time(a.updatedAt);
  const tb = time(b.updatedAt);
  const newer = ta !== tb ? (ta > tb ? a : b) : furtherAlong(b, a) ? b : a;
  const best =
    a.bestScore === null ? b.bestScore : b.bestScore === null ? a.bestScore : Math.max(a.bestScore, b.bestScore);
  return {
    lessonId: a.lessonId,
    state: rank(a.state) >= rank(b.state) ? a.state : b.state,
    step: newer.step,
    questionIndex: newer.questionIndex,
    bestScore: best,
    updatedAt: ta >= tb ? a.updatedAt : b.updatedAt,
  };
}

/** True when `local` holds something the account copy lacks (so it is worth sending). */
export function lessonAheadOf(local: LessonProgress, remote: LessonProgress | undefined): boolean {
  if (!remote) return true;
  if (rank(local.state) > rank(remote.state)) return true;
  if ((local.bestScore ?? -1) > (remote.bestScore ?? -1)) return true;
  // The account keeps the furthest position, so only a further position is news to it.
  return rank(local.state) === rank(remote.state) && furtherAlong(local, remote);
}

export function mergeLessonLists(local: readonly LessonProgress[], remote: readonly LessonProgress[]): LessonProgress[] {
  const out = new Map<string, LessonProgress>();
  for (const p of local) out.set(p.lessonId, p);
  for (const p of remote) {
    const mine = out.get(p.lessonId);
    out.set(p.lessonId, mine ? mergeLessonProgress(mine, p) : p);
  }
  return [...out.values()];
}

export const attemptKey = (a: Pick<AttemptEvent, 'lessonId' | 'step' | 'questionId' | 'at'>): string => {
  const t = Date.parse(a.at);
  return `${a.lessonId}|${a.step}|${a.questionId}|${Number.isFinite(t) ? t : a.at}`;
};

/** Union by key, oldest first, keeping the newest `cap`. */
export function mergeAttempts(local: readonly AttemptEvent[], remote: readonly AttemptEvent[], cap: number): AttemptEvent[] {
  const seen = new Set<string>();
  const all: AttemptEvent[] = [];
  for (const a of [...local, ...remote]) {
    const k = attemptKey(a);
    if (seen.has(k)) continue;
    seen.add(k);
    all.push(a);
  }
  all.sort((x, y) => time(x.at) - time(y.at));
  return all.length > cap ? all.slice(-cap) : all;
}

export function mergeBests(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (v > (out[k] ?? 0)) out[k] = v;
  return out;
}
