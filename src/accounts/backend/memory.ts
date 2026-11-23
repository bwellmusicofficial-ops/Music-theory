import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { MemoryProgressStore } from '../progress/memory';
import type { ProgressStore } from '../progress/types';
import { codeNameFormatOk, formatRecoveryCode, generateRecoveryCode, normaliseCodeName } from '../rules';
import { throttleDelaySeconds, WINDOW_SECONDS } from '../throttle';
import type {
  AccountBackend, AccountUser, AgeBand, CookieJar, DeleteResult, RecoverResult, SignInResult, SignUpResult, Throttle,
} from './types';

export const MEMORY_SESSION_COOKIE = 'mtn-fake-session';

/** A deliberately small stand-in for the database's blocked list (the real list is in the seed file). */
const DEFAULT_BLOCKED: { word: string; match: 'exact' | 'contains' }[] = [
  { word: 'admin', match: 'exact' },
  { word: 'teacher', match: 'exact' },
  { word: 'support', match: 'exact' },
  { word: 'staff', match: 'exact' },
  { word: 'musictheorynow', match: 'contains' },
  { word: 'shit', match: 'contains' },
];

interface Row {
  id: string;
  /** Stands in for the synthetic address; kept only inside this class. */
  syntheticEmail: string;
  codeName: string;
  norm: string;
  ageBand: AgeBand;
  passwordHash: string;
  recoveryHash: string;
  createdAt: string;
}

export interface MemoryBackendOptions {
  blocked?: { word: string; match: 'exact' | 'contains' }[];
  /** bcrypt cost. 4 keeps tests fast; the Supabase backend uses 10 for recovery codes. */
  bcryptRounds?: number;
  now?: () => number;
}

/** Same rules as the Supabase backend, all in process memory. For tests and end-to-end runs only. */
export class MemoryAccountBackend implements AccountBackend {
  readonly throttle: Throttle;
  private readonly users = new Map<string, Row>(); // by id
  private readonly byNorm = new Map<string, string>(); // norm -> id
  private readonly sessions = new Map<string, string>(); // token -> id
  private readonly progressStores = new Map<string, MemoryProgressStore>(); // user id -> progress
  private readonly blocked: { word: string; match: 'exact' | 'contains' }[];
  private readonly rounds: number;
  private readonly now: () => number;
  private readonly counters = new Map<string, { failures: number; lastFailedAt: number; lockedUntil: number }>();

  constructor(options: MemoryBackendOptions = {}) {
    this.blocked = (options.blocked ?? DEFAULT_BLOCKED).map((b) => ({ ...b, word: normaliseCodeName(b.word) }));
    this.rounds = options.bcryptRounds ?? 4;
    this.now = options.now ?? Date.now;
    this.throttle = {
      check: async (key) => this.waitFor(key),
      fail: async (key, threshold) => {
        const t = this.now();
        const c = this.counters.get(key);
        const failures = c && t - c.lastFailedAt <= WINDOW_SECONDS * 1000 ? c.failures + 1 : 1;
        const delay = throttleDelaySeconds(failures, threshold);
        this.counters.set(key, { failures, lastFailedAt: t, lockedUntil: delay > 0 ? t + delay * 1000 : 0 });
        return delay;
      },
      clear: async (key) => {
        this.counters.delete(key);
      },
    };
  }

  private waitFor(key: string): number {
    const c = this.counters.get(key);
    if (!c || c.lockedUntil <= this.now()) return 0;
    return Math.ceil((c.lockedUntil - this.now()) / 1000);
  }

  private isBlocked(name: string): boolean {
    const n = normaliseCodeName(name);
    return this.blocked.some((b) => (b.match === 'exact' ? b.word === n : n.includes(b.word)));
  }

  async codeNameAvailable(codeName: string): Promise<boolean> {
    return codeNameFormatOk(codeName) && !this.isBlocked(codeName) && !this.byNorm.has(normaliseCodeName(codeName));
  }

  private open(id: string, jar: CookieJar): void {
    const token = randomUUID() + randomUUID();
    this.sessions.set(token, id);
    jar.setAll([{ name: MEMORY_SESSION_COOKIE, value: token, options: { httpOnly: true, sameSite: 'lax', path: '/' } }]);
  }

  private user(row: Row): AccountUser {
    return { codeName: row.codeName, ageBand: row.ageBand };
  }

  async signUp(input: { codeName: string; password: string; ageBand: AgeBand }, jar: CookieJar): Promise<SignUpResult> {
    if (!(await this.codeNameAvailable(input.codeName))) return { ok: false, reason: 'unavailable' };
    const code = generateRecoveryCode();
    const row: Row = {
      id: randomUUID(),
      syntheticEmail: `${randomUUID()}@accounts.invalid`,
      codeName: input.codeName,
      norm: normaliseCodeName(input.codeName),
      ageBand: input.ageBand,
      passwordHash: await bcrypt.hash(input.password, this.rounds),
      recoveryHash: await bcrypt.hash(code, this.rounds),
      createdAt: new Date(this.now()).toISOString(),
    };
    // Re-check after the awaits: the map, like the unique index, decides a race.
    if (this.byNorm.has(row.norm)) return { ok: false, reason: 'unavailable' };
    this.users.set(row.id, row);
    this.byNorm.set(row.norm, row.id);
    this.open(row.id, jar);
    return { ok: true, user: this.user(row), recoveryCode: formatRecoveryCode(code), signedIn: true };
  }

  async signIn(input: { codeName: string; password: string }, jar: CookieJar): Promise<SignInResult> {
    const id = this.byNorm.get(normaliseCodeName(input.codeName));
    const row = id ? this.users.get(id) : undefined;
    // Compare against a real hash either way so unknown names cost the same time.
    const ok = await bcrypt.compare(input.password, row?.passwordHash ?? DUMMY_HASH);
    if (!row || !ok) return { ok: false };
    this.open(row.id, jar);
    return { ok: true, user: this.user(row) };
  }

  async recover(input: { codeName: string; recoveryCode: string; newPassword: string }, jar: CookieJar): Promise<RecoverResult> {
    const id = this.byNorm.get(normaliseCodeName(input.codeName));
    const row = id ? this.users.get(id) : undefined;
    const ok = await bcrypt.compare(input.recoveryCode, row?.recoveryHash ?? DUMMY_HASH);
    if (!row || !ok) return { ok: false };
    const code = generateRecoveryCode();
    row.passwordHash = await bcrypt.hash(input.newPassword, this.rounds);
    row.recoveryHash = await bcrypt.hash(code, this.rounds);
    // A recovery ends every other session for this account.
    for (const [token, uid] of this.sessions) if (uid === row.id) this.sessions.delete(token);
    this.open(row.id, jar);
    return { ok: true, user: this.user(row), recoveryCode: formatRecoveryCode(code), signedIn: true };
  }

  async signOut(jar: CookieJar): Promise<void> {
    const token = jar.getAll().find((c) => c.name === MEMORY_SESSION_COOKIE)?.value;
    if (token) this.sessions.delete(token);
    jar.setAll([{ name: MEMORY_SESSION_COOKIE, value: '', options: { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 } }]);
  }

  async progress(jar: CookieJar): Promise<ProgressStore | null> {
    const token = jar.getAll().find((c) => c.name === MEMORY_SESSION_COOKIE)?.value;
    const id = token ? this.sessions.get(token) : undefined;
    if (!id || !this.users.has(id)) return null;
    let store = this.progressStores.get(id);
    if (!store) this.progressStores.set(id, (store = new MemoryProgressStore(this.now)));
    return store;
  }

  private sessionUserId(jar: CookieJar): string | null {
    const token = jar.getAll().find((c) => c.name === MEMORY_SESSION_COOKIE)?.value;
    const id = token ? this.sessions.get(token) : undefined;
    return id && this.users.has(id) ? id : null;
  }

  async accountId(jar: CookieJar): Promise<string | null> {
    return this.sessionUserId(jar);
  }

  async exportData(jar: CookieJar): Promise<unknown | null> {
    const id = this.sessionUserId(jar);
    const row = id ? this.users.get(id) : undefined;
    if (!id || !row) return null;
    // The same shape export_my_data() returns, including the parts the route must strip.
    const store = this.progressStores.get(id);
    return {
      exported_at: new Date(this.now()).toISOString(),
      account: { user_id: id, email: row.syntheticEmail, created_at: row.createdAt },
      profile: {
        user_id: id, code_name: row.codeName, code_name_norm: row.norm, age_band: row.ageBand,
        adult_confirmed_at: row.ageBand === 'adult' ? row.createdAt : null, settings: {}, created_at: row.createdAt, updated_at: row.createdAt,
      },
      adult_contact: null,
      account_secrets: { has_recovery_code: true, failed_attempts: 0, last_failed_at: null, locked_until: null, created_at: row.createdAt, updated_at: row.createdAt },
      ...(store ? store.exportRows(id) : { lesson_progress: [], attempts: [], game_scores: [], mock_results: [] }),
    };
  }

  async deleteAccount(jar: CookieJar, confirmCodeName: string): Promise<DeleteResult> {
    const id = this.sessionUserId(jar);
    const row = id ? this.users.get(id) : undefined;
    if (!id || !row) return { status: 'not-signed-in' };
    if (normaliseCodeName(confirmCodeName) !== row.norm) return { status: 'name-mismatch' };
    this.users.delete(id);
    this.byNorm.delete(row.norm);
    this.progressStores.delete(id);
    for (const [token, uid] of this.sessions) if (uid === id) this.sessions.delete(token);
    jar.setAll([{ name: MEMORY_SESSION_COOKIE, value: '', options: { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 } }]);
    return { status: 'deleted', userId: id, codeNameNorm: row.norm };
  }

  async currentUser(jar: CookieJar): Promise<AccountUser | null> {
    const token = jar.getAll().find((c) => c.name === MEMORY_SESSION_COOKIE)?.value;
    const id = token ? this.sessions.get(token) : undefined;
    const row = id ? this.users.get(id) : undefined;
    return row ? this.user(row) : null;
  }
}

/** A valid bcrypt hash of a random string, to spend the same time on unknown names. */
const DUMMY_HASH = bcrypt.hashSync(randomUUID(), 4);
