/**
 * Where mock test results go. `MockResultSink` is the seam: Phase 0 keeps them
 * in localStorage (this file); Supabase can implement the same interface later
 * and the screens never change.
 *
 * Layout: one versioned key, `mtn:v1:mock-results` -> MockAttempt[] (oldest
 * first, capped). Tolerant by design: corrupt JSON reads as empty, malformed
 * rows are dropped, and when storage is missing, throws, or is full the sink
 * keeps working in memory for the rest of the page's life.
 */

import { z } from 'zod';
import type { MockBand, MockResult } from './engine';

export const MOCK_RESULTS_KEY = 'mtn:v1:mock-results';
export const MAX_MOCK_ATTEMPTS = 200;

const tallySchema = z.object({
  correct: z.number().min(0),
  total: z.number().min(0),
});

export const mockAttemptSchema = z.object({
  configId: z.string().min(1),
  /** ISO 8601. */
  at: z.string().min(1),
  seed: z.number(),
  /** Marks gained / marks available, 0..1. */
  score: z.number().min(0).max(1),
  correct: z.number().min(0),
  /** Marks available. 0 means unknown: a result brought over from the account, which keeps only the score. */
  total: z.number().min(0),
  band: z.enum(['distinction', 'merit', 'pass', 'not-yet']),
  timedOut: z.boolean(),
  elapsedMs: z.number().min(0),
  sections: z.array(tallySchema.extend({ id: z.string() })),
  skills: z.array(tallySchema.extend({ skill: z.string() })),
});
export type MockAttempt = z.infer<typeof mockAttemptSchema>;

export interface MockResultSink {
  /** Stores one finished attempt. */
  save(attempt: MockAttempt): Promise<void>;
  /** Attempts for one test (or all when no id is given), oldest first. */
  list(configId?: string): Promise<MockAttempt[]>;
  /** The attempt with the highest score for a test (the earliest wins a tie), or null. */
  best(configId: string): Promise<MockAttempt | null>;
}

/** Turns a finished test into the row that is stored. */
export function toAttempt(result: MockResult, at: Date | string = new Date()): MockAttempt {
  return {
    configId: result.configId,
    at: typeof at === 'string' ? at : at.toISOString(),
    seed: result.seed,
    score: result.score.fraction,
    correct: result.score.correct,
    total: result.score.total,
    band: result.band,
    timedOut: result.timedOut,
    elapsedMs: result.elapsedMs,
    sections: result.sections.map((s) => ({ id: s.id, correct: s.correct, total: s.total })),
    skills: result.skills.map((s) => ({ skill: s.skill, correct: s.correct, total: s.total })),
  };
}

export function bestOf(attempts: readonly MockAttempt[]): MockAttempt | null {
  let best: MockAttempt | null = null;
  for (const a of attempts) if (best === null || a.score > best.score) best = a;
  return best;
}

export const BAND_ORDER: readonly MockBand[] = ['not-yet', 'pass', 'merit', 'distinction'];

function defaultStorage(): Storage | undefined {
  try {
    return typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage;
  } catch {
    // Accessing localStorage can throw (blocked cookies, sandboxed frames).
    return undefined;
  }
}

export function createLocalMockResultSink(storage?: Storage): MockResultSink {
  const backing = storage ?? defaultStorage();
  /** Set once storage fails: the in-memory copy then wins over whatever storage holds. */
  let memory: string | null | undefined;

  function read(): string | null {
    if (memory !== undefined) return memory;
    if (!backing) return null;
    try {
      return backing.getItem(MOCK_RESULTS_KEY);
    } catch {
      return null;
    }
  }

  function write(value: string): void {
    if (!backing || memory !== undefined) {
      memory = value;
      return;
    }
    try {
      backing.setItem(MOCK_RESULTS_KEY, value);
    } catch {
      memory = value;
    }
  }

  function readAll(): MockAttempt[] {
    const raw = read();
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const out: MockAttempt[] = [];
      for (const row of parsed) {
        const ok = mockAttemptSchema.safeParse(row);
        if (ok.success) out.push(ok.data);
      }
      return out;
    } catch {
      return [];
    }
  }

  return {
    async save(attempt) {
      const all = readAll();
      all.push(attempt);
      write(JSON.stringify(all.length > MAX_MOCK_ATTEMPTS ? all.slice(-MAX_MOCK_ATTEMPTS) : all));
    },
    async list(configId) {
      const all = readAll();
      return configId === undefined ? all : all.filter((a) => a.configId === configId);
    },
    async best(configId) {
      return bestOf(readAll().filter((a) => a.configId === configId));
    },
  };
}
