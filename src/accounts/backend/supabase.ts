import 'server-only';
import bcrypt from 'bcryptjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseProgressStore } from '../progress/supabase';
import type { ProgressStore } from '../progress/types';
import { formatRecoveryCode, generateRecoveryCode, normaliseCodeName } from '../rules';
import type {
  AccountBackend, AccountUser, AgeBand, CookieJar, DeleteResult, RecoverResult, SignInResult, SignUpResult, Throttle,
} from './types';

if (typeof window !== 'undefined') {
  throw new Error('SupabaseAccountBackend holds the secret key and must never be imported in the browser.');
}

/** Cost for recovery-code hashes. A recovery code has about 59 bits, so this is for defence in depth. */
const RECOVERY_BCRYPT_ROUNDS = 10;

/** The two clients this backend needs. Injected so tests can stand in for Supabase. */
export interface SupabaseDeps {
  /** Secret-key client. Bypasses row level security. Server only. */
  admin: SupabaseClient;
  /** Publishable-key client whose session lives in the request's cookies (`@supabase/ssr`). */
  sessionClient(jar: CookieJar): SupabaseClient;
}

interface ProfileRow {
  user_id: string;
  code_name: string;
  age_band: AgeBand;
}

function must<T = unknown>(what: string, r: { data: unknown; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
}

/** Text of the log line (and the thrown error) when a 0005 function is missing: the request is refused, not run without it. */
const MIGRATION_0005_MISSING = (fn: string) =>
  `migration 0005_security_hardening.sql has not been applied (function ${fn} is missing); refusing the request`;

/** Postgres 42883 / PostgREST PGRST202: the function does not exist. */
const isMissingFunction = (e: { message: string; code?: string }) =>
  e.code === '42883' || e.code === 'PGRST202' || /could not find the function|does not exist/i.test(e.message);

const isNotFound = (e: { status?: number; code?: string }) => e.status === 404 || e.code === 'user_not_found';

/**
 * Code-name accounts on Supabase Auth. Each account is an auth user with a synthetic
 * `<random-id>@accounts.invalid` address that exists only to satisfy Supabase and never
 * leaves this class. The profile row (code name, age band) is made by the database
 * trigger from the app metadata passed to `createUser`.
 */
export class SupabaseAccountBackend implements AccountBackend {
  readonly throttle: Throttle;

  constructor(private readonly deps: SupabaseDeps) {
    const { admin } = deps;
    this.throttle = {
      check: async (key) => Number(must('auth_throttle_check', await admin.rpc('auth_throttle_check', { p_key: key }))),
      fail: async (key, threshold) =>
        Number(must('auth_throttle_fail', await admin.rpc('auth_throttle_fail', { p_key: key, p_threshold: threshold }))),
      hit: async (key, threshold) => {
        const r = await admin.rpc('auth_throttle_hit', { p_key: key, p_threshold: threshold });
        if (r.error && isMissingFunction(r.error)) {
          console.error(`[accounts] ${MIGRATION_0005_MISSING('auth_throttle_hit')}`);
          throw new Error(MIGRATION_0005_MISSING('auth_throttle_hit'));
        }
        return Number(must('auth_throttle_hit', r));
      },
      clear: async (key) => {
        must('auth_throttle_clear', await admin.rpc('auth_throttle_clear', { p_key: key }));
      },
    };
  }

  async codeNameAvailable(codeName: string): Promise<boolean> {
    const r = await this.deps.admin.rpc('code_name_available', { candidate: codeName });
    return must('code_name_available', r) === true;
  }

  private async profileByName(codeName: string): Promise<ProfileRow | null> {
    const r = await this.deps.admin
      .from('profiles')
      .select('user_id, code_name, age_band')
      .eq('code_name_norm', normaliseCodeName(codeName))
      .maybeSingle();
    return must<ProfileRow | null>('profiles lookup', r);
  }

  private async syntheticEmail(userId: string): Promise<string | null> {
    const r = await this.deps.admin.auth.admin.getUserById(userId);
    return r.error ? null : (r.data.user?.email ?? null);
  }

  /** Signs in with the synthetic address and sets the session cookies. True when a session was issued. */
  private async openSession(email: string, password: string, jar: CookieJar): Promise<'ok' | 'invalid'> {
    const r = await this.deps.sessionClient(jar).auth.signInWithPassword({ email, password });
    if (!r.error) return 'ok';
    // A wrong password is 400 invalid_credentials. Anything else (network, 5xx) is an outage, not a refusal.
    if (r.error.status === 400 || r.error.code === 'invalid_credentials') return 'invalid';
    throw new Error(`signInWithPassword: ${r.error.message}`);
  }

  async signUp(input: { codeName: string; password: string; ageBand: AgeBand }, jar: CookieJar): Promise<SignUpResult> {
    const { admin } = this.deps;
    const recovery = generateRecoveryCode();
    const recoveryHash = await bcrypt.hash(recovery, RECOVERY_BCRYPT_ROUNDS);
    const email = `${crypto.randomUUID()}@accounts.invalid`;

    // Ask first: a refused name must not leave an auth user behind for the trigger to reject.
    if (!(await this.codeNameAvailable(input.codeName))) return { ok: false, reason: 'unavailable' };

    const created = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      app_metadata: { code_name: input.codeName, age_band: input.ageBand },
    });
    if (created.error || !created.data.user) {
      // The trigger refuses a taken, blocked or badly formed name, and Supabase reports that as a
      // generic failure; the user row may still exist (it is inserted before the metadata update). Remove it.
      await this.removeHalfMadeUser(email);
      if (!(await this.codeNameAvailable(input.codeName))) return { ok: false, reason: 'unavailable' };
      throw new Error(`createUser: ${created.error?.message ?? 'no user returned'}`);
    }
    const userId = created.data.user.id;

    // The profile must carry the name before anything else happens. Supabase writes the metadata after
    // inserting the user (migration 0004 copies it across); if the profile still has no name, or the name
    // belongs to someone else, undo the account rather than leave one that can never be signed in to.
    const named = await this.profileByName(input.codeName);
    if (!named || named.user_id !== userId) {
      await admin.auth.admin.deleteUser(userId);
      if (!(await this.codeNameAvailable(input.codeName))) return { ok: false, reason: 'unavailable' };
      throw new Error('sign-up: the profile did not receive its code name (is migration 0004 applied?)');
    }

    const secret = await admin.from('account_secrets').insert({ user_id: userId, recovery_code_hash: recoveryHash });
    if (secret.error) {
      // Never leave an account whose recovery code was not stored.
      await admin.auth.admin.deleteUser(userId);
      throw new Error(`account_secrets insert: ${secret.error.message}`);
    }

    const user: AccountUser = { codeName: named.code_name ?? input.codeName, ageBand: named.age_band ?? input.ageBand };
    let signedIn = false;
    try {
      signedIn = (await this.openSession(email, input.password, jar)) === 'ok';
    } catch {
      signedIn = false; // The account exists and the code must still be shown; they can sign in next.
    }
    return { ok: true, user, recoveryCode: formatRecoveryCode(recovery), signedIn };
  }

  /** Best effort: find a user by the made-up address we just tried to create and delete it. Never throws. */
  private async removeHalfMadeUser(email: string): Promise<void> {
    const { admin } = this.deps;
    try {
      const r = await admin.rpc('auth_user_id_by_synthetic_email', { p_email: email });
      if (r.error) {
        console.warn(`[accounts] sign-up cleanup: could not look the half-made user up (${isMissingFunction(r.error) ? 'is migration 0005 applied?' : 'database error'})`);
        return;
      }
      if (typeof r.data === 'string' && r.data) await admin.auth.admin.deleteUser(r.data);
    } catch {
      console.warn('[accounts] sign-up cleanup failed');
    }
  }

  /** Ends every session and refresh token of the user. Throws (so the caller refuses) when it cannot, including when 0005 is missing. */
  private async revokeSessions(userId: string): Promise<void> {
    const r = await this.deps.admin.rpc('revoke_user_sessions', { p_user: userId });
    if (r.error) {
      if (isMissingFunction(r.error)) console.error(`[accounts] ${MIGRATION_0005_MISSING('revoke_user_sessions')}`);
      throw new Error(`revoke_user_sessions: ${r.error.message}`);
    }
  }

  async signIn(input: { codeName: string; password: string }, jar: CookieJar): Promise<SignInResult> {
    const profile = await this.profileByName(input.codeName);
    if (!profile) return { ok: false };
    const email = await this.syntheticEmail(profile.user_id);
    if (!email) return { ok: false };
    if ((await this.openSession(email, input.password, jar)) !== 'ok') return { ok: false };
    return { ok: true, user: { codeName: profile.code_name, ageBand: profile.age_band } };
  }

  async recover(input: { codeName: string; recoveryCode: string; newPassword: string }, jar: CookieJar): Promise<RecoverResult> {
    const { admin } = this.deps;
    const profile = await this.profileByName(input.codeName);
    // Reasons are logged on the server only (never the code name or the code), so a refusal can be diagnosed.
    if (!profile) {
      console.warn('[accounts] recover refused: no account with that code name');
      return { ok: false };
    }
    const secret = must<{ recovery_code_hash: string } | null>(
      'account_secrets lookup',
      await admin.from('account_secrets').select('recovery_code_hash').eq('user_id', profile.user_id).maybeSingle(),
    );
    if (!secret) {
      console.warn('[accounts] recover refused: account has no stored recovery code');
      return { ok: false };
    }
    if (!(await bcrypt.compare(input.recoveryCode, secret.recovery_code_hash))) {
      console.warn('[accounts] recover refused: code does not match the stored hash');
      return { ok: false };
    }

    const email = await this.syntheticEmail(profile.user_id);
    if (!email) throw new Error('recover: user has no address');
    const next = generateRecoveryCode();
    const nextHash = await bcrypt.hash(next, RECOVERY_BCRYPT_ROUNDS);

    // 1. Sign everyone out BEFORE anything changes. It also proves revoke_user_sessions exists (fail closed),
    //    so a missing 0005 refuses the request while the old password and code still work.
    await this.revokeSessions(profile.user_id);
    // 2. Password next: if a later step fails the old code still works, so nothing is lost.
    must('updateUserById', await admin.auth.admin.updateUserById(profile.user_id, { password: input.newPassword }));
    // 3. Sign out again: a session opened with the old password in the moments since step 1 dies too. Always
    //    done, whether or not the new sign-in below succeeds, so an attacker is never left signed in.
    await this.revokeSessions(profile.user_id);
    must('account_secrets update', await admin.from('account_secrets').update({ recovery_code_hash: nextHash }).eq('user_id', profile.user_id));

    // 4. Only now the new session.
    let signedIn = false;
    try {
      signedIn = (await this.openSession(email, input.newPassword, jar)) === 'ok';
    } catch {
      /* the password and code are already changed; the code must still be shown */
    }
    return {
      ok: true,
      user: { codeName: profile.code_name, ageBand: profile.age_band },
      recoveryCode: formatRecoveryCode(next),
      signedIn,
    };
  }

  async signOut(jar: CookieJar): Promise<void> {
    try {
      // 'local': this device only. The default would end the person's sessions everywhere.
      await this.deps.sessionClient(jar).auth.signOut({ scope: 'local' });
    } finally {
      // Whatever Supabase said, forget our cookies.
      jar.setAll(
        jar
          .getAll()
          .filter((c) => c.name.startsWith('sb-'))
          .map((c) => ({ name: c.name, value: '', options: { maxAge: 0, path: '/' } })),
      );
    }
  }

  async progress(jar: CookieJar): Promise<ProgressStore | null> {
    // The user's own session client (publishable key + their cookie): row level security does the rest.
    const client = this.deps.sessionClient(jar);
    const r = await client.auth.getUser();
    if (r.error || !r.data.user) return null;
    return new SupabaseProgressStore(client, r.data.user.id);
  }

  async accountId(jar: CookieJar): Promise<string | null> {
    const r = await this.deps.sessionClient(jar).auth.getUser();
    return r.error || !r.data.user ? null : r.data.user.id;
  }

  async exportData(jar: CookieJar): Promise<unknown | null> {
    // As the signed-in user (their cookie, the publishable key): export_my_data() is granted to `authenticated`
    // only and uses auth.uid(), so it can return nobody else's rows.
    const client = this.deps.sessionClient(jar);
    const who = await client.auth.getUser();
    if (who.error || !who.data.user) return null;
    return must('export_my_data', await client.rpc('export_my_data'));
  }

  async deleteAccount(jar: CookieJar, confirmCodeName: string): Promise<DeleteResult> {
    const { admin } = this.deps;
    const client = this.deps.sessionClient(jar);
    const who = await client.auth.getUser();
    if (who.error || !who.data.user) return { status: 'not-signed-in' };
    const userId = who.data.user.id;

    // 1. Nothing is changed yet. Read the code name (to check the confirmation and to forget its rate-limit rows).
    //    A missing profile means an earlier delete got part-way: skip the check and finish the job.
    const profile = must<{ code_name: string | null } | null>(
      'profiles lookup',
      await admin.from('profiles').select('code_name').eq('user_id', userId).maybeSingle(),
    );
    const codeNameNorm = profile?.code_name ? normaliseCodeName(profile.code_name) : null;
    if (codeNameNorm !== null && normaliseCodeName(confirmCodeName) !== codeNameNorm) return { status: 'name-mismatch' };

    // 2. The one irreversible step, as the user. delete_my_account() deletes the auth user in ONE database
    //    transaction and every table cascades from it, so it either all happens or none of it does. If this
    //    throws, the person is still signed in with all their data and can try again.
    must('delete_my_account', await client.rpc('delete_my_account'));

    // 3. Belt and braces: make sure the auth user is gone through the official admin route too.
    await this.removeAuthUser(userId);

    // 4. Last, end the device's session. Only now, so any failure above leaves a session that can retry.
    try {
      await this.signOut(jar);
    } catch {
      /* the cookies are cleared in signOut's finally block whatever Supabase said */
    }
    return { status: 'deleted', userId, codeNameNorm };
  }

  /** Removes the auth user with the secret key. "Not found" is success: delete_my_account() normally got there first. */
  private async removeAuthUser(userId: string): Promise<void> {
    const { admin } = this.deps;
    const r = await admin.auth.admin.deleteUser(userId);
    if (!r.error || isNotFound(r.error)) return;
    // Some other error. Ask whether the user is still there: if it is, the account is NOT fully deleted.
    const check = await admin.auth.admin.getUserById(userId);
    if (check.data?.user) throw new Error(`deleteUser: ${r.error.message}; the auth user still exists`);
    console.warn('[accounts] delete: could not confirm the auth user is gone through the admin API');
  }

  async currentUser(jar: CookieJar): Promise<AccountUser | null> {
    const r = await this.deps.sessionClient(jar).auth.getUser();
    if (r.error || !r.data.user) return null;
    const p = await this.deps.admin
      .from('profiles')
      .select('user_id, code_name, age_band')
      .eq('user_id', r.data.user.id)
      .maybeSingle();
    const row = must<ProfileRow | null>('profiles lookup', p);
    return row?.code_name ? { codeName: row.code_name, ageBand: row.age_band } : null;
  }
}
