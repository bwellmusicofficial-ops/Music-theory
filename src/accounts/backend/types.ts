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

import type { ProgressStore } from '../progress/types';

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

/**
 * What `deleteAccount` did. `deleted` carries the normalised code name (or null) so the route can forget the
 * throttle rows keyed by it. `name-mismatch`: the typed confirmation was not this account's code name, nothing
 * was changed.
 */
export type DeleteResult =
  | { status: 'deleted'; userId: string; codeNameNorm: string | null }
  | { status: 'name-mismatch' }
  | { status: 'not-signed-in' };

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
  /**
   * Saved progress for whoever the cookies say is signed in, or null when nobody is (P1-03). The store is
   * bound to that one user. The Supabase implementation uses the user's own session, so row level security applies.
   */
  progress(jar: CookieJar): Promise<ProgressStore | null>;
  /**
   * An opaque id for whoever is signed in, or null. It exists only to key rate limits (P1-16) and must never be
   * sent to the browser. Works for an account whose profile is already gone (a half-finished delete).
   */
  accountId(jar: CookieJar): Promise<string | null>;
  /**
   * Everything the account holds, exactly as `export_my_data()` returns it (the Supabase backend calls it as the
   * signed-in user, so row level security applies), or null when nobody is signed in. The route cleans it (see
   * `../export-file.ts`) before it leaves the server.
   */
  exportData(jar: CookieJar): Promise<unknown | null>;
  /**
   * Deletes the signed-in person's account and everything in it (P1-16). `confirmCodeName` must be the account's
   * own code name (compared without case or separators). Order and failure behaviour are documented in
   * docs/accounts-build.md ("Export and delete"). Throws when the deletion could not be completed; the person
   * is then still signed in and may try again. On success the device's session cookies are cleared.
   */
  deleteAccount(jar: CookieJar, confirmCodeName: string): Promise<DeleteResult>;
}
