// @vitest-environment node
/**
 * One set of scenarios, run against BOTH backends. The Supabase backend runs over the real SQL
 * (PGlite, migrations 0001 and 0002 and the blocked-name seed) with Supabase Auth imitated by
 * `test-support/fake-supabase.ts`; that is as close as can be proved without the real project.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '@/db/test-harness';
import { createFakeSupabase } from '../test-support/fake-supabase';
import { TestJar } from '../test-support/jar';
import { MemoryAccountBackend } from './memory';
import { SupabaseAccountBackend } from './supabase';
import type { AccountBackend } from './types';
import { normaliseRecoveryCode } from '../rules';

let h: Harness;
beforeAll(async () => {
  h = await createHarness({ seed: true, throttle: true });
}, 60_000);
afterAll(async () => {
  await h.close();
});

const makers: Record<string, () => AccountBackend> = {
  memory: () => new MemoryAccountBackend(),
  supabase: () => {
    const fake = createFakeSupabase(h);
    return new SupabaseAccountBackend({ admin: fake.admin, sessionClient: fake.sessionClient });
  },
};

let n = 0;
/** A name unique across both backends and all tests (they share one database). */
const name = (stem: string) => `${stem}${++n}x${Math.random().toString(36).slice(2, 6)}`.slice(0, 20);

describe.each(Object.keys(makers))('%s backend', (kind) => {
  const make = () => makers[kind]!();
  const noAddress = (v: unknown) => expect(JSON.stringify(v)).not.toMatch(/accounts\.invalid|@/);

  it('says a fresh well-formed name is available, and refuses bad, blocked and taken ones', async () => {
    const b = make();
    const jar = new TestJar();
    const taken = name('Taken');
    expect(await b.codeNameAvailable(taken)).toBe(true);
    expect(await b.codeNameAvailable('ab')).toBe(false);
    expect(await b.codeNameAvailable('admin')).toBe(false);
    expect((await b.signUp({ codeName: taken, password: 'correct horse', ageBand: 'under_18' }, jar)).ok).toBe(true);
    expect(await b.codeNameAvailable(taken)).toBe(false);
    expect(await b.codeNameAvailable(taken.toUpperCase())).toBe(false);
    expect(await b.codeNameAvailable(taken.replace(/^./, (c) => c + '_'))).toBe(false);
  });

  it('signs up: a recovery code in the right shape, signed in, name as typed, no address anywhere', async () => {
    const b = make();
    const jar = new TestJar();
    const codeName = name('Swift_Cello');
    const r = await b.signUp({ codeName, password: 'correct horse', ageBand: 'adult' }, jar);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.recoveryCode).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(r.signedIn).toBe(true);
    expect(r.user).toEqual({ codeName, ageBand: 'adult' });
    expect(await b.currentUser(jar)).toEqual({ codeName, ageBand: 'adult' });
    noAddress(r);
    noAddress(await b.currentUser(jar));
  });

  it('the age band is stored: under 18 is the default reading', async () => {
    const b = make();
    const r = await b.signUp({ codeName: name('Young'), password: 'correct horse', ageBand: 'under_18' }, new TestJar());
    expect(r.ok && r.user.ageBand).toBe('under_18');
  });

  it('refuses a second account whose name differs only by case or separators', async () => {
    const b = make();
    const base = name('Rhythm_Fox');
    expect((await b.signUp({ codeName: base, password: 'correct horse', ageBand: 'under_18' }, new TestJar())).ok).toBe(true);
    for (const variant of [base.toLowerCase(), base.toUpperCase(), base.replace('_', '-')]) {
      const r = await b.signUp({ codeName: variant, password: 'another pass', ageBand: 'under_18' }, new TestJar());
      expect(r, variant).toEqual({ ok: false, reason: 'unavailable' });
    }
  });

  it('refuses a blocked name at sign-up', async () => {
    const r = await make().signUp({ codeName: 'Admin', password: 'correct horse', ageBand: 'under_18' }, new TestJar());
    expect(r).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('two sign-ups for one name at once: exactly one wins', async () => {
    const b = make();
    const codeName = name('Race');
    const rs = await Promise.all([1, 2, 3].map((i) => b.signUp({ codeName, password: `correct horse ${i}`, ageBand: 'under_18' }, new TestJar())));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
  });

  it('signs in with the right password, case and separators ignored; refuses wrong and unknown the same way', async () => {
    const b = make();
    const codeName = name('Quiet_Harp');
    await b.signUp({ codeName, password: 'correct horse', ageBand: 'under_18' }, new TestJar());
    const jar = new TestJar();
    const ok = await b.signIn({ codeName: codeName.toLowerCase().replace('_', '-'), password: 'correct horse' }, jar);
    expect(ok).toEqual({ ok: true, user: { codeName, ageBand: 'under_18' } });
    expect(await b.currentUser(jar)).toEqual({ codeName, ageBand: 'under_18' });

    const wrongJar = new TestJar();
    expect(await b.signIn({ codeName, password: 'wrong horse!' }, wrongJar)).toEqual({ ok: false });
    expect(await b.signIn({ codeName: name('Nobody'), password: 'correct horse' }, wrongJar)).toEqual({ ok: false });
    expect(await b.currentUser(wrongJar)).toBeNull();
    expect(wrongJar.everSet).toEqual([]);
  });

  it('signs out: the session is gone and the cookie cleared', async () => {
    const b = make();
    const jar = new TestJar();
    await b.signUp({ codeName: name('Bye'), password: 'correct horse', ageBand: 'under_18' }, jar);
    expect(await b.currentUser(jar)).not.toBeNull();
    await b.signOut(jar);
    expect(await b.currentUser(jar)).toBeNull();
    expect(jar.getAll()).toEqual([]);
    await b.signOut(jar); // signing out twice is harmless
  });

  it('recovers: new password works, old password and old code do not, a new code is issued, other sessions end', async () => {
    const b = make();
    const codeName = name('Lost_Pass');
    const firstJar = new TestJar();
    const up = await b.signUp({ codeName, password: 'correct horse', ageBand: 'under_18' }, firstJar);
    if (!up.ok) throw new Error('setup');
    const oldCode = normaliseRecoveryCode(up.recoveryCode)!;

    const wrong = await b.recover({ codeName, recoveryCode: 'ABCDEFGHJKMN', newPassword: 'brand new pass' }, new TestJar());
    expect(wrong).toEqual({ ok: false });

    const jar = new TestJar();
    const r = await b.recover({ codeName: codeName.toUpperCase(), recoveryCode: oldCode, newPassword: 'brand new pass' }, jar);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    noAddress(r);
    expect(r.signedIn).toBe(true);
    expect(r.recoveryCode).not.toBe(up.recoveryCode);
    expect(await b.currentUser(jar)).toEqual({ codeName, ageBand: 'under_18' });

    expect(await b.signIn({ codeName, password: 'correct horse' }, new TestJar())).toEqual({ ok: false });
    expect((await b.signIn({ codeName, password: 'brand new pass' }, new TestJar())).ok).toBe(true);
    expect(await b.recover({ codeName, recoveryCode: oldCode, newPassword: 'yet another one' }, new TestJar())).toEqual({ ok: false });
    expect((await b.recover({ codeName, recoveryCode: normaliseRecoveryCode(r.recoveryCode)!, newPassword: 'yet another one' }, new TestJar())).ok).toBe(true);
    expect(await b.currentUser(firstJar)).toBeNull(); // the session from before the recovery has ended
  });

  it('recovery for an unknown name fails like a wrong code', async () => {
    expect(await make().recover({ codeName: name('Ghost'), recoveryCode: 'ABCDEFGHJKMN', newPassword: 'brand new pass' }, new TestJar())).toEqual({ ok: false });
  });

  it('who-am-i with no cookie is null', async () => {
    expect(await make().currentUser(new TestJar())).toBeNull();
  });

  it('throttle: free below the threshold, then 30, 60 seconds; clear resets', async () => {
    const t = make().throttle;
    const key = name('k');
    expect(await t.check(key)).toBe(0);
    const waits = [];
    for (let i = 0; i < 6; i++) waits.push(await t.fail(key, 5));
    expect(waits).toEqual([0, 0, 0, 0, 30, 60]);
    expect(await t.check(key)).toBeGreaterThan(30);
    await t.clear(key);
    expect(await t.check(key)).toBe(0);
  });
});

describe('supabase backend specifics', () => {
  it('stores only a bcrypt hash of the recovery code, and a failed secret insert leaves no account', async () => {
    const fake = createFakeSupabase(h);
    const b = new SupabaseAccountBackend({ admin: fake.admin, sessionClient: fake.sessionClient });
    const codeName = name('Hashed');
    const up = await b.signUp({ codeName, password: 'correct horse', ageBand: 'under_18' }, new TestJar());
    if (!up.ok) throw new Error('setup');
    const [row] = await h.asOwner((s) => s.q<{ recovery_code_hash: string }>(
      `select s.recovery_code_hash from public.account_secrets s join public.profiles p using (user_id) where p.code_name = $1`, [codeName]));
    expect(row!.recovery_code_hash).toMatch(/^\$2[ab]\$10\$/);
    expect(row!.recovery_code_hash).not.toContain(normaliseRecoveryCode(up.recoveryCode)!);

    // Make the secrets insert fail, and check the half-made user is removed.
    const broken = new SupabaseAccountBackend({
      admin: new Proxy(fake.admin, {
        get: (t, p, r) =>
          p === 'from'
            ? (table: string) =>
                table === 'account_secrets' ? { insert: async () => ({ data: null, error: { message: 'boom' } }) } : fake.admin.from(table)
            : Reflect.get(t, p, r),
      }),
      sessionClient: fake.sessionClient,
    });
    const failName = name('NoSecret');
    await expect(broken.signUp({ codeName: failName, password: 'correct horse', ageBand: 'under_18' }, new TestJar())).rejects.toThrow(/account_secrets/);
    expect(await h.asOwner((s) => s.scalar<number>(`select count(*)::int from public.profiles where code_name = $1`, [failName]))).toBe(0);
  });

  it('the synthetic address has the .invalid form and is never in an API result', async () => {
    const [u] = await h.asOwner((s) => s.q<{ email: string }>(`select email from auth.users where email like '%accounts.invalid' limit 1`));
    expect(u!.email).toMatch(/^[0-9a-f-]{36}@accounts\.invalid$/);
  });

  it('an outage while signing in is an error, not a "wrong password"', async () => {
    const fake = createFakeSupabase(h);
    const down = new SupabaseAccountBackend({
      admin: fake.admin,
      sessionClient: () => ({ auth: { signInWithPassword: async () => ({ data: {}, error: { message: 'fetch failed', status: 502 } }) } }) as never,
    });
    const codeName = name('Outage');
    await new SupabaseAccountBackend({ admin: fake.admin, sessionClient: fake.sessionClient }).signUp({ codeName, password: 'correct horse', ageBand: 'under_18' }, new TestJar());
    await expect(down.signIn({ codeName, password: 'correct horse' }, new TestJar())).rejects.toThrow(/signInWithPassword/);
  });
});
