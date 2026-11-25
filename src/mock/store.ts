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

import type { MockBand, MockResult } from './engine';

export const MOCK_RESULTS_KEY = 'mtn:v1:mock-results';
export const MAX_MOCK_ATTEMPTS = 200;

interface Tally {
  correct: number;
  total: number;
}

export interface MockAttempt {
  configId: string;
  /** ISO 8601. */
  at: string;
  seed: number;
  /** Marks gained / marks available, 0..1. */
  score: number;
  correct: number;
  /** Marks available. 0 means unknown: a result brought over from the account, which keeps only the score. */
  total: number;
  band: MockBand;
  timedOut: boolean;
  elapsedMs: number;
  sections: (Tally & { id: string })[];
  skills: (Tally & { skill: string })[];
}

const BANDS: readonly string[] = ['distinction', 'merit', 'pass', 'not-yet'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function parseTallies<K extends 'id' | 'skill'>(rows: unknown, key: K): (Tally & Record<K, string>)[] | null {
  if (!Array.isArray(rows)) return null;
  const out: (Tally & Record<K, string>)[] = [];
  for (const r of rows) {
    if (!isRecord(r) || typeof r[key] !== 'string' || !isCount(r.correct) || !isCount(r.total)) return null;
    out.push({ correct: r.correct, total: r.total, [key]: r[key] } as unknown as Tally & Record<K, string>);
  }
  return out;
}

/**
 * Checks one stored row and returns a clean copy (unknown fields dropped), or null if it is malformed. A small
 * hand-written check rather than zod, so the dashboard, course map and games do not download zod just to read
 * their own saved results. `mock/attempt-schema.ts` holds the zod version of the same rules, and a test keeps the
 * two in agreement.
 */
export function parseMockAttempt(row: unknown): MockAttempt | null {
  if (!isRecord(row)) return null;
  const { configId, at, seed, score, correct, total, band, timedOut, elapsedMs } = row;
  if (!isNonEmptyString(configId) || !isNonEmptyString(at)) return null;
  if (typeof seed !== 'number' || !Number.isFinite(seed)) return null;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) return null;
  if (!isCount(correct) || !isCount(total) || !isCount(elapsedMs)) return null;
  if (typeof band !== 'string' || !BANDS.includes(band) || typeof timedOut !== 'boolean') return null;
  const sections = parseTallies(row.sections, 'id');
  const skills = parseTallies(row.skills, 'skill');
  if (!sections || !skills) return null;
  return { configId, at, seed, score, correct, total, band: band as MockBand, timedOut, elapsedMs, sections, skills };
}

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
        const ok = parseMockAttempt(row);
        if (ok) out.push(ok);
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
