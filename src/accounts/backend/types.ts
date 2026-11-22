/**
 * The server-side seam for code-name accounts (P1-02).
 *
 * Route handlers (`../handlers.ts`) know only this interface. Two implementations:
 * `SupabaseAccountBackend` (real, server-only) and `MemoryAccountBackend` (tests and
 * the end-to-end run). A third caller later (email accounts, P1-03 saving progress,
 * P1-16 export and delete) adds methods here rather than reaching around it.
 *
 * Nothing returned from this interface may contain the synthetic
 * `<random-id>@accounts.invalid` address; it never leaves the backend.
 */

export type AgeBand = 'under_18' | 'adult';

/** What anyone is told about the signed-in person: nothing else. */
export interface AccountUser {
  /** As typed at sign-up (case and separators kept). */
  codeName: string;
  ageBand: AgeBand;
}

/** The request's cookies in, and the cookies to send back out. Implemented over `next/headers` in routes. */
export interface CookieJar {
  getAll(): { name: string; value: string }[];
  setAll(cookies: { name: string; value: string; options?: Record<string, unknown> }[]): void;
}

export type SignUpResult =
  | { ok: true; user: AccountUser; recoveryCode: string; signedIn: boolean }
  | { ok: false; reason: 'unavailable' };

export type SignInResult = { ok: true; user: AccountUser } | { ok: false };

export type RecoverResult =
  | { ok: true; user: AccountUser; recoveryCode: string; signedIn: boolean }
  | { ok: false };

/**
 * Failure counters that survive across serverless instances. `fail` counts one failure
 * (or one request, for the volume limits) and returns the seconds to wait, 0 when none.
 */
export interface Throttle {
  /** Seconds to wait before this key may try again; 0 when it may. */
  check(key: string): Promise<number>;
  fail(key: string, threshold: number): Promise<number>;
  clear(key: string): Promise<void>;
}

export interface AccountBackend {
  readonly throttle: Throttle;
  /** Yes or no only. Applies the format rules, the blocked list and uniqueness. */
  codeNameAvailable(codeName: string): Promise<boolean>;
  /**
   * Inputs are already validated for format and password strength by the handler; the
   * backend still refuses a name that is taken or blocked, and decides races.
   */
  signUp(input: { codeName: string; password: string; ageBand: AgeBand }, jar: CookieJar): Promise<SignUpResult>;
  signIn(input: { codeName: string; password: string }, jar: CookieJar): Promise<SignInResult>;
  /** `recoveryCode` is the canonical 12 symbols. Sets a new password, issues a new code, signs in. */
  recover(input: { codeName: string; recoveryCode: string; newPassword: string }, jar: CookieJar): Promise<RecoverResult>;
  signOut(jar: CookieJar): Promise<void>;
  currentUser(jar: CookieJar): Promise<AccountUser | null>;
}
