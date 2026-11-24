// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- these tests read untyped JSON and wrap untyped Supabase clients */
/**
 * P1-17 security fixes, proved over BOTH backends: the memory backend, and the Supabase backend running the real SQL
 * (0001 to 0005) in PGlite under a fake Supabase Auth. Each test here failed before the fix it covers.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, type Harness } from '@/db/test-harness';
import { MemoryAccountBackend } from './backend/memory';
import { SupabaseAccountBackend } from './backend/supabase';
import type { AccountBackend, CookieJar } from './backend/types';
import { handleRecover, handleSignIn, handleSignUp, ipBucket, nameHash, type LoadDeps } from './handlers';
import { createFakeSupabase, type FakeSupabaseOptions } from './test-support/fake-supabase';
import { TestJar } from './test-support/jar';
import { NAME_PAIR_THRESHOLD, NAME_THRESHOLD } from './throttle';

let h: Harness;
beforeAll(async () => {
  h = await createHarness({ seed: true });
}, 60_000);
afterAll(async () => {
  await h.close();
});
beforeEach(() => {
  process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = '1';
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
  vi.restoreAllMocks();
});

const PW = 'purple elephants';
let n = 0;
const name = (stem: string) => `${stem}${++n}x${Math.random().toString(36).slice(2, 5)}`.slice(0, 20);

const post = (body: unknown, ip = '203.0.113.7') =>
  new Request('http://localhost:3000/api/account/x', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify(body),
  });
const body = async (r: Response) => (await r.json()) as Record<string, any>;

interface World {
  backend: AccountBackend;
  load: LoadDeps;
  /** Password guesses that reached the password check. */
  guesses: { count: number };
  admin?: any;
  sessionClientFor?: (jar: CookieJar) => any;
}

const makers: Record<string, (o?: FakeSupabaseOptions) => World> = {
  memory: () => {
    const backend = new MemoryAccountBackend();
    const guesses = { count: 0 };
    const real = backend.signIn.bind(backend);
    backend.signIn = async (i, j) => { guesses.count++; return real(i, j); };
    const realRecover = backend.recover.bind(backend);
    backend.recover = async (i, j) => { guesses.count++; return realRecover(i, j); };
    return { backend, guesses, load: async () => ({ backend, jar: new TestJar() }) };
  },
  supabase: (options = {}) => {
    const guesses = { count: 0 };
    const fake = createFakeSupabase(h, { ...options, onSignInAttempt: () => { guesses.count++; } });
    const backend = new SupabaseAccountBackend({ admin: fake.admin, sessionClient: fake.sessionClient });
    return { backend, guesses, admin: fake.admin, sessionClientFor: fake.sessionClient, load: async () => ({ backend, jar: new TestJar() }) };
  },
};

async function signUp(w: World, codeName: string, password = PW) {
  const jar = new TestJar();
  const r = await handleSignUp(post({ codeName, password, ageBand: 'under_18' }, '198.51.100.1'), async () => ({ backend: w.backend, jar }));
  expect(r.status).toBe(200);
  return { jar, recoveryCode: (await body(r)).recoveryCode as string };
}

describe.each(Object.keys(makers))('%s backend', (kind) => {
  const make = (o?: FakeSupabaseOptions) => makers[kind]!(o);

  describe('finding 4: parallel guesses (check-then-record race)', () => {
    it('100 simultaneous wrong passwords from one address: no more than 5 are tried', async () => {
      const w = make();
      const codeName = name('Racer');
      await signUp(w, codeName);
      w.guesses.count = 0;
      const rs = await Promise.all(Array.from({ length: 100 }, (_, i) => handleSignIn(post({ codeName, password: `wrong guess ${i}` }), w.load)));
      expect(w.guesses.count).toBeLessThanOrEqual(NAME_PAIR_THRESHOLD);
      expect(rs.filter((r) => r.status === 401)).toHaveLength(NAME_PAIR_THRESHOLD);
      expect(rs.filter((r) => r.status === 429)).toHaveLength(95);
    }, 60_000);

    it('100 simultaneous guesses spread over 100 addresses: no more than the per-name ceiling (50) are tried', async () => {
      const w = make();
      const codeName = name('Spread');
      await signUp(w, codeName);
      w.guesses.count = 0;
      await Promise.all(Array.from({ length: 100 }, (_, i) => handleSignIn(post({ codeName, password: `wrong guess ${i}` }, `10.9.${i}.1`), w.load)));
      expect(w.guesses.count).toBeLessThanOrEqual(NAME_THRESHOLD);
    }, 120_000);

    it('100 simultaneous recovery codes: no more than 5 are tried', async () => {
      const w = make();
      const codeName = name('RecRace');
      await signUp(w, codeName);
      w.guesses.count = 0;
      await Promise.all(Array.from({ length: 100 }, (_, i) =>
        handleRecover(post({ codeName, recoveryCode: `ABCDEFGHJK${(i % 9) + 2}${(i % 7) + 2}`, newPassword: 'a brand new one' }), w.load)));
      expect(w.guesses.count).toBeLessThanOrEqual(NAME_PAIR_THRESHOLD);
    }, 60_000);
  });

  describe('finding 3: one pupil cannot lock out a school', () => {
    it('20 failures from the school address against other names do not stop a classmate signing in', async () => {
      const w = make();
      const classmate = name('Classmate');
      await signUp(w, classmate);
      for (let i = 0; i < 20; i++) await handleSignIn(post({ codeName: `Nobody${i}x`, password: PW }, '192.0.2.50'), w.load);
      expect((await handleSignIn(post({ codeName: classmate, password: PW }, '192.0.2.50'), w.load)).status).toBe(200);
    }, 60_000);

    it('a wrong guess at a classmate\'s name every 15 minutes for a day never locks them out', async () => {
      let now = 1_000_000_000_000;
      const backend = new MemoryAccountBackend({ now: () => now });
      if (kind === 'supabase') return; // the database clock is real; the memory backend proves the schedule, 0005 tests prove the SQL
      const load: LoadDeps = async () => ({ backend, jar: new TestJar() });
      const classmate = name('Victim');
      await handleSignUp(post({ codeName: classmate, password: PW, ageBand: 'under_18' }, '198.51.100.1'), load);
      const statuses = new Set<number>();
      for (let i = 0; i < 96; i++) {
        statuses.add((await handleSignIn(post({ codeName: classmate, password: `guess number ${i}` }, '192.0.2.50'), load)).status);
        now += 15 * 60_000;
      }
      expect([...statuses]).toEqual([401]);
      expect((await handleSignIn(post({ codeName: classmate, password: PW }, '192.0.2.50'), load)).status).toBe(200);
    });

    it('one address can still not guess one name quickly: 5 tries, then a wait', async () => {
      const w = make();
      const codeName = name('Guessed');
      await signUp(w, codeName);
      const out: number[] = [];
      for (let i = 0; i < 7; i++) out.push((await handleSignIn(post({ codeName, password: `wrong guess ${i}` }, '192.0.2.77'), w.load)).status);
      expect(out).toEqual([401, 401, 401, 401, 401, 429, 429]);
      // ...and the owner on another address is not affected by that address's pair counter.
      expect((await handleSignIn(post({ codeName, password: PW }, '192.0.2.78'), w.load)).status).toBe(200);
    }, 60_000);

    it('sign-up: a refused name does not use up the address\'s allowance, and the check comes before the count', async () => {
      const w = make();
      const taken = name('TakenNm');
      await signUp(w, taken);
      for (let i = 0; i < 70; i++) {
        const r = await handleSignUp(post({ codeName: taken, password: PW, ageBand: 'adult' }, '192.0.2.99'), w.load);
        expect(r.status).toBe(409);
      }
      const ok = await handleSignUp(post({ codeName: name('FreshOne'), password: PW, ageBand: 'adult' }, '192.0.2.99'), w.load);
      expect(ok.status).toBe(200);
    }, 120_000);
  });

  describe('finding 8: no typed name in a throttle key', () => {
    it('the same name always gives the same key part, which is a hash and not the name', () => {
      expect(nameHash('Swift_Cello42')).toBe(nameHash('swiftcello42'));
      expect(nameHash('SwiftCello42')).not.toContain('swiftcello');
      expect(nameHash('SwiftCello42')).toMatch(/^[0-9a-f]{32}$/);
    });
  });
});

describe('supabase backend: what only its database shows', () => {
  const sb = (o?: FakeSupabaseOptions) => makers.supabase!(o);

  it('throttle rows hold a keyed hash of the name and of the address, never the typed name or the address', async () => {
    const w = sb();
    const codeName = name('HashedNm');
    await signUp(w, codeName);
    await handleSignIn(post({ codeName, password: 'wrong guess' }, '192.0.2.123'), w.load);
    await handleRecover(post({ codeName, recoveryCode: 'ABCDEFGHJKMN', newPassword: 'a brand new one' }, '192.0.2.123'), w.load);
    const keys = (await h.asOwner((s) => s.q<{ key: string }>(`select key from public.auth_throttle`))).map((r) => r.key);
    expect(keys.some((k) => k.includes(nameHash(codeName)))).toBe(true);
    for (const k of keys) {
      expect(k.toLowerCase(), k).not.toContain(codeName.toLowerCase());
      expect(k, k).not.toContain('192.0.2.123');
    }
  });

  it('finding 7: a recovery signs out every other session, and the attacker stays out even if the new sign-in fails', async () => {
    const w = sb();
    const codeName = name('Hijacked');
    const { recoveryCode } = await signUp(w, codeName);
    // The attacker holds a session opened with the old password.
    const attacker = new TestJar();
    expect((await w.backend.signIn({ codeName, password: PW }, attacker)).ok).toBe(true);
    expect(await w.backend.currentUser(attacker)).not.toBeNull();

    // Make the NEW sign-in (the one recovery does at the end) fail with an outage.
    const real = w.sessionClientFor!;
    const flaky = new SupabaseAccountBackend({
      admin: w.admin,
      sessionClient: (jar) => {
        const c = real(jar);
        return { ...c, auth: { ...c.auth, signInWithPassword: async () => ({ data: { session: null }, error: { message: 'upstream down', status: 503 } }), getUser: c.auth.getUser, getSession: c.auth.getSession } };
      },
    });
    const r = await flakyRecover(flaky, codeName, recoveryCode);
    expect(r.ok && r.signedIn).toBe(false);
    expect(await w.backend.currentUser(attacker)).toBeNull();
    expect((await w.backend.signIn({ codeName, password: PW }, new TestJar())).ok).toBe(false); // old password gone
  }, 60_000);

  it('finding 7: with 0005 missing, recovery is refused before anything changes (old password and code still work)', async () => {
    const w = sb({ missingRpcs: ['revoke_user_sessions'] });
    const codeName = name('NoRevoke');
    const { recoveryCode } = await signUp(w, codeName);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handleRecover(post({ codeName, recoveryCode, newPassword: 'a brand new one' }), w.load);
    expect(res.status).toBe(500);
    expect(errors.mock.calls.flat().join(' ')).toMatch(/migration 0005_security_hardening\.sql has not been applied/);
    expect((await w.backend.signIn({ codeName, password: PW }, new TestJar())).ok).toBe(true);
    expect((await w.backend.signIn({ codeName, password: 'a brand new one' }, new TestJar())).ok).toBe(false);
  }, 60_000);

  it('finding 4: with 0005 missing, sign-in and recovery fail closed: no password is tried, a clear line is logged', async () => {
    const w = sb({ missingRpcs: ['auth_throttle_hit'] });
    const codeName = name('FailClosed');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    w.guesses.count = 0;
    const a = await handleSignIn(post({ codeName, password: PW }), w.load);
    const b = await handleRecover(post({ codeName, recoveryCode: 'ABCDEFGHJKMN', newPassword: 'a brand new one' }), w.load);
    expect([a.status, b.status]).toEqual([500, 500]);
    expect(w.guesses.count).toBe(0);
    expect(errors.mock.calls.flat().join(' ')).toMatch(/migration 0005_security_hardening\.sql has not been applied \(function auth_throttle_hit is missing\)/);
  });

  it('finding 8: a wrong recovery code logs a reason without any part of the stored hash', async () => {
    const w = sb();
    const codeName = name('NoHashLog');
    await signUp(w, codeName);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await handleRecover(post({ codeName, recoveryCode: 'ABCDEFGHJKMN', newPassword: 'a brand new one' }), w.load);
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toMatch(/recover refused/);
    expect(logged).not.toMatch(/\$2|bcrypt|\([^)]*[0-9a-zA-Z./$]{4}\)/);
  });

  it('finding 9: a refused name never reaches createUser (no orphan user)', async () => {
    const w = sb();
    const taken = name('NoOrphan');
    await signUp(w, taken);
    const create = vi.spyOn(w.admin.auth.admin, 'createUser');
    const users = async () => Number(await h.asOwner((s) => s.scalar(`select count(*) from auth.users`)));
    const before = await users();
    for (const refused of [taken, taken.toUpperCase(), 'admin']) {
      expect(await w.backend.signUp({ codeName: refused, password: PW, ageBand: 'adult' }, new TestJar())).toEqual({ ok: false, reason: 'unavailable' });
    }
    expect(create).not.toHaveBeenCalled();
    expect(await users()).toBe(before);
  });

  it('finding 9: if createUser fails after its user row exists, that user is found by its made-up address and deleted', async () => {
    const w = sb();
    const real = w.admin.auth.admin.createUser.bind(w.admin.auth.admin);
    w.admin.auth.admin.createUser = async (a: any) => {
      await real(a); // the user row now exists...
      return { data: { user: null }, error: { message: 'Database error creating new user', status: 500 } }; // ...but the call reports failure
    };
    const users = async () => Number(await h.asOwner((s) => s.scalar(`select count(*) from auth.users`)));
    const before = await users();
    await expect(w.backend.signUp({ codeName: name('Orphaned'), password: PW, ageBand: 'adult' }, new TestJar())).rejects.toThrow(/createUser/);
    expect(await users()).toBe(before);
  });
});

/** Recovers through a backend whose session client is given, using the handler's own steps. */
async function flakyRecover(backend: AccountBackend, codeName: string, recoveryCode: string) {
  return backend.recover({ codeName, recoveryCode: recoveryCode.replace(/-/g, ''), newPassword: 'a brand new one' }, new TestJar());
}

describe('ipBucket (finding 3: an IPv6 address counts by its /64)', () => {
  it('keeps IPv4 as it is', () => expect(ipBucket('203.0.113.7')).toBe('203.0.113.7'));
  it('gives every address of one /64 the same bucket, and different /64s different ones', () => {
    const a = ipBucket('2001:db8:abcd:12::1');
    expect(ipBucket('2001:0db8:abcd:0012:ffff:ffff:ffff:ffff')).toBe(a);
    expect(ipBucket('2001:DB8:ABCD:12:1:2:3:4')).toBe(a);
    expect(ipBucket('2001:db8:abcd:13::1')).not.toBe(a);
    expect(a).toBe('2001:0db8:abcd:0012::/64');
  });
  it('treats an IPv4-mapped IPv6 address as the IPv4 address, and handles short and bracketed forms', () => {
    expect(ipBucket('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(ipBucket('::1')).toBe('0000:0000:0000:0000::/64');
    expect(ipBucket('[2001:db8::5]')).toBe('2001:0db8:0000:0000::/64');
    expect(ipBucket('fe80::1%eth0')).toBe('fe80:0000:0000:0000::/64');
  });
  it('rotating through a /64 does not dodge the per-address failure ceiling', async () => {
    const backend = new MemoryAccountBackend();
    const load: LoadDeps = async () => ({ backend, jar: new TestJar() });
    let last = 0;
    for (let i = 0; i < 200; i++) last = (await handleSignIn(post({ codeName: `Nobody${i}x`, password: PW }, `2001:db8:1:2:${i.toString(16)}::1`), load)).status;
    expect(last).toBe(429);
    expect((await handleSignIn(post({ codeName: 'Anyone1', password: PW }, '2001:db8:1:2:ffff::9'), load)).status).toBe(429);
    expect((await handleSignIn(post({ codeName: 'Anyone1', password: PW }, '2001:db8:1:3::9'), load)).status).toBe(401);
  }, 60_000);
});
