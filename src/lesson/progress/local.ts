/**
 * ProgressSink on localStorage (Phase 0). Storage is injectable for tests.
 *
 * Layout: two versioned keys. Bump the version in the key if the shape changes.
 *   mtn:v1:progress  -> { [lessonId]: LessonProgress }
 *   mtn:v1:attempts  -> AttemptEvent[] (newest last, capped)
 *
 * Tolerant by design: corrupted JSON reads as empty, malformed rows are
 * dropped, and when storage is missing, throws on access or is full, the sink
 * keeps working in memory for the rest of the page's life.
 */

import type { AttemptEvent, LessonProgress, ProgressSink } from '../contracts';
import { STEP_ORDER } from '../vocab';

export const PROGRESS_KEY = 'mtn:v1:progress';
export const ATTEMPTS_KEY = 'mtn:v1:attempts';
export const MAX_ATTEMPTS = 2000;

export type LocalProgressSink = ProgressSink & {
  /** Stored attempts, oldest first. Not part of the ProgressSink contract. */
  loadAttempts(): Promise<AttemptEvent[]>;
};

const LESSON_STATES = ['not-started', 'in-progress', 'complete', 'mastered'];

function isProgress(v: unknown): v is LessonProgress {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.lessonId === 'string' &&
    typeof p.state === 'string' &&
    LESSON_STATES.includes(p.state) &&
    typeof p.step === 'string' &&
    (STEP_ORDER as readonly string[]).includes(p.step) &&
    typeof p.questionIndex === 'number' &&
    (p.bestScore === null || typeof p.bestScore === 'number') &&
    typeof p.updatedAt === 'string'
  );
}

function isAttempt(v: unknown): v is AttemptEvent {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.lessonId === 'string' &&
    typeof a.questionId === 'string' &&
    typeof a.correct === 'boolean' &&
    typeof a.at === 'string'
  );
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage;
  } catch {
    // Accessing localStorage can throw (blocked cookies, sandboxed frames).
    return undefined;
  }
}

export function createLocalProgressSink(storage?: Storage): LocalProgressSink {
  const backing = storage ?? defaultStorage();
  /** Values written while storage was failing; they win over whatever storage holds. */
  const memory = new Map<string, string>();
  /** Keys whose reads threw: their writes are mirrored in memory so they can be read back. */
  const unreadable = new Set<string>();

  function read(key: string): string | null {
    if (memory.has(key)) return memory.get(key) ?? null;
    if (!backing) return null;
    try {
      return backing.getItem(key);
    } catch {
      unreadable.add(key);
      return null;
    }
  }

  function write(key: string, value: string): void {
    if (!backing || memory.has(key)) {
      memory.set(key, value);
      return;
    }
    try {
      backing.setItem(key, value);
    } catch {
      memory.set(key, value);
      return;
    }
    if (unreadable.has(key)) memory.set(key, value);
  }

  function readProgress(): Record<string, LessonProgress> {
    const raw = read(PROGRESS_KEY);
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
      const out: Record<string, LessonProgress> = {};
      for (const [id, value] of Object.entries(parsed)) {
        if (isProgress(value) && value.lessonId === id) out[id] = value;
      }
      return out;
    } catch {
      return {};
    }
  }

  function readAttempts(): AttemptEvent[] {
    const raw = read(ATTEMPTS_KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isAttempt) : [];
    } catch {
      return [];
    }
  }

  return {
    async recordAttempt(event) {
      const all = readAttempts();
      all.push(event);
      write(ATTEMPTS_KEY, JSON.stringify(all.length > MAX_ATTEMPTS ? all.slice(-MAX_ATTEMPTS) : all));
    },
    async saveLessonProgress(progress) {
      const all = readProgress();
      all[progress.lessonId] = progress;
      write(PROGRESS_KEY, JSON.stringify(all));
    },
    async loadLessonProgress(lessonId) {
      return readProgress()[lessonId] ?? null;
    },
    async loadAllLessonProgress() {
      return Object.values(readProgress());
    },
    async loadAttempts() {
      return readAttempts();
    },
  };
}
