import type { AttemptEvent } from '@/lesson/contracts';
import { skillLabel } from '@/lesson/skills';
import type { LessonMeta } from './course';

/** Attempts closer together than this belong to one session. */
export const SESSION_GAP_MS = 30 * 60 * 1000;
/** Longest time a single answer can add, so a phone left open does not count as practice. */
const MAX_ANSWER_MS = 5 * 60 * 1000;

interface Stamped {
  time: number;
  ms: number;
  attempt: AttemptEvent;
}

function stamp(attempts: readonly AttemptEvent[]): Stamped[] {
  const rows: Stamped[] = [];
  for (const attempt of attempts) {
    const time = Date.parse(attempt.at);
    if (Number.isNaN(time)) continue;
    const ms = Number.isFinite(attempt.msTaken) ? Math.min(Math.max(attempt.msTaken, 0), MAX_ANSWER_MS) : 0;
    rows.push({ time, ms, attempt });
  }
  return rows.sort((a, b) => a.time - b.time);
}

export interface PracticeSession {
  /** Epoch ms of the first answer, less the time that answer took. */
  start: number;
  /** Epoch ms of the last answer. */
  end: number;
  attempts: number;
}

/** Groups attempts into sessions: a new one starts after a gap of 30 minutes or more. */
export function sessionsOf(attempts: readonly AttemptEvent[]): PracticeSession[] {
  const rows = stamp(attempts);
  const sessions: PracticeSession[] = [];
  let last = -Infinity;
  for (const row of rows) {
    const current = sessions[sessions.length - 1];
    if (current && row.time - last < SESSION_GAP_MS) {
      current.end = row.time;
      current.attempts += 1;
    } else {
      sessions.push({ start: row.time - row.ms, end: row.time, attempts: 1 });
    }
    last = row.time;
  }
  return sessions;
}

/** Midnight at the start of the Monday of `now`'s week, in the learner's local time. */
export function startOfWeek(now: Date): Date {
  const daysSinceMonday = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
}

export interface WeekSummary {
  /** Time practised, in ms. */
  ms: number;
  /** Whole minutes, at least 1 when anything was practised. */
  minutes: number;
  sessions: number;
  attempts: number;
}

/** Practice since Monday 00:00 (local time) up to `now`. */
export function weekSummary(attempts: readonly AttemptEvent[], now: Date): WeekSummary {
  const from = startOfWeek(now).getTime();
  const to = now.getTime();
  const mine = attempts.filter((a) => {
    const t = Date.parse(a.at);
    return t >= from && t <= to;
  });
  const sessions = sessionsOf(mine);
  const ms = sessions.reduce((sum, s) => sum + (s.end - s.start), 0);
  return {
    ms,
    minutes: ms === 0 ? 0 : Math.max(1, Math.round(ms / 60000)),
    sessions: sessions.length,
    attempts: mine.length,
  };
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export interface Streak {
  /** Consecutive local days with at least one attempt, ending today (or yesterday, if today has none yet). */
  days: number;
  activeToday: boolean;
}

/** A simple streak: no freezes, no grace beyond "today is not over yet". */
export function streak(attempts: readonly AttemptEvent[], now: Date): Streak {
  const to = now.getTime();
  const days = new Set<string>();
  for (const a of attempts) {
    const t = Date.parse(a.at);
    if (!Number.isNaN(t) && t <= to) days.add(dayKey(new Date(t)));
  }
  const activeToday = days.has(dayKey(now));
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (activeToday ? 0 : 1));
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count += 1;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return { days: count, activeToday };
}

export interface WeakSkill {
  skill: string;
  label: string;
  /** Share of answers correct, 0..1. */
  accuracy: number;
  attempts: number;
  /** Lessons that teach the skill, in teaching order. */
  lessons: LessonMeta[];
}

export interface WeakestOptions {
  /** How many to return. Default 3. */
  limit?: number;
  /** Only the most recent attempts count. Default 200. */
  window?: number;
  /** A skill needs at least this many attempts in the window. Default 5. */
  minAttempts?: number;
  /** Skills at or above this accuracy are not "worth another look". Default 0.9. */
  maxAccuracy?: number;
}

/**
 * The skills with the lowest accuracy among the last `window` attempts, each
 * with the lessons that teach it. Skills no lesson teaches are left out (there
 * is nothing to link to).
 */
export function weakestSkills(
  attempts: readonly AttemptEvent[],
  lessons: readonly LessonMeta[],
  options: WeakestOptions = {},
): WeakSkill[] {
  const { limit = 3, window = 200, minAttempts = 5, maxAccuracy = 0.9 } = options;
  const recent = stamp(attempts).slice(-window);
  const tally = new Map<string, { right: number; total: number }>();
  for (const { attempt } of recent) {
    if (typeof attempt.skill !== 'string' || attempt.skill === '') continue;
    const t = tally.get(attempt.skill) ?? { right: 0, total: 0 };
    t.total += 1;
    if (attempt.correct) t.right += 1;
    tally.set(attempt.skill, t);
  }
  const rows: WeakSkill[] = [];
  for (const [skill, t] of tally) {
    if (t.total < minAttempts) continue;
    const accuracy = t.right / t.total;
    if (accuracy >= maxAccuracy) continue;
    const teaching = lessons.filter((l) => l.skills.includes(skill));
    if (teaching.length === 0) continue;
    rows.push({ skill, label: skillLabel(skill), accuracy, attempts: t.total, lessons: teaching });
  }
  rows.sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts || a.skill.localeCompare(b.skill));
  return rows.slice(0, Math.max(0, limit));
}
