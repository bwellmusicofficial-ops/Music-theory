// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- these tests read untyped JSON and wrap untyped Supabase clients */
/**
 * P1-16: /api/account/export and /api/account/delete, over BOTH backends. The Supabase backend runs the real SQL
 * (export_my_data, delete_my_account, the cascades, the throttle functions) in PGlite under a fake Supabase Auth.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '@/db/test-harness';
import { USER_TABLES } from '@/db/fixtures';
import type { AttemptWire } from '@/sync/wire';
import { MemoryAccountBackend } from './backend/memory';
import { SupabaseAccountBackend } from './backend/supabase';
import type { AccountBackend, CookieJar } from './backend/types';
import { handleMe, handleSignIn, nameHash, type Deps, type LoadDeps } from './handlers';
import { handleDelete, handleExport } from './privacy-handlers';
import { createFakeSupabase, type FakeSupabase } from './test-support/fake-supabase';
import { TestJar } from './test-support/jar';
import { EXPORT_THRESHOLD } from './throttle';

let h: Harness;
beforeAll(async () => {
  h = await createHarness({ seed: true, throttle: true });
}, 60_000);
afterAll(async () => {
  await h.close();
});
beforeEach(() => {
  process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = '1';
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
});

const NOW = () => new Date('2026-11-23T10:00:00.000Z');
const PASSWORD = 'correct horse';
let n = 0;
const name = (stem: string) => `${stem}${++n}x${Math.random().toString(36).slice(2, 6)}`.slice(0, 20);

const post = (path: string, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...headers }, body: JSON.stringify(body),
  });
const exportReq = (headers?: Record<string, string>) => post('/api/account/export', {}, headers);
const deleteReq = (confirmCodeName: unknown, headers?: Record<string, string>) => post('/api/account/delete', { confirmCodeName }, headers);

interface World {
  backend: AccountBackend;
  fake: FakeSupabase | null;
  /** Wraps the session client so a test can break one call. */
  break?: (fn: (jar: CookieJar) => unknown) => void;
}
const makers: Record<string, () => World> = {
  memory: () => ({ backend: new MemoryAccountBackend(), fake: null }),
  supabase: () => {
    const fake = createFakeSupabase(h);
    return { backend: new SupabaseAccountBackend({ admin: fake.admin, sessionClient: fake.sessionClient }), fake };
  },
};

const attempt = (i: number): AttemptWire => ({
  lessonId: 'g1-rhythm-01', step: 'practice', questionId: `q-${i}`, skill: 'rhythm.note.value', type: 'multiple-choice',
  correct: true, score: 1, msTaken: 1500, at: new Date(Date.UTC(2026, 5, 1, 10, 0, i)).toISOString(),
});

/** A signed-in learner with a lesson, answers, a game best and a mock result. */
async function learner(backend: AccountBackend, stem: string) {
  const jar = new TestJar();
  const codeName = name(stem);
  const r = await backend.signUp({ codeName, password: PASSWORD, ageBand: 'under_18' }, jar);
  if (!r.ok) throw new Error('setup');
  const store = (await backend.progress(jar))!;
  await store.saveLessons([{ lessonId: 'g1-rhythm-01', state: 'complete', step: 'recap', questionIndex: 0, bestScore: 0.9 }]);
  await store.recordAttempts([attempt(1), attempt(2)]);
  await store.saveGameBests([{ gameId: 'note-rush', score: 120 }]);
  await store.saveMockResults([{ grade: '1', score: 0.75, breakdown: { 'rhythm.note.value': 0.5 } }]);
  return { jar, codeName };
}
const loader = (backend: AccountBackend, jar: CookieJar): LoadDeps => async (): Promise<Deps> => ({ backend, jar });
const body = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe.each(Object.keys(makers))('%s backend: export', (kind) => {
  it('404 when the switch is off, 403 cross-site, 401 signed out; none of them touch the rate limit', async () => {
    const { backend } = makers[kind]!();
    const load = loader(backend, new TestJar());
    delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
    expect((await handleExport(exportReq(), load)).status).toBe(404);
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = '1';
    expect((await handleExport(exportReq({ origin: 'https://evil.example' }), load)).status).toBe(403);
    const signedOut = await handleExport(exportReq(), load);
    expect(signedOut.status).toBe(401);
    expect(await body(signedOut)).toEqual({ error: 'not-signed-in' });
  });

  it('returns a dated JSON download with a README and the learner\'s data, and nothing it must not', async () => {
    const { backend } = makers[kind]!();
    const { jar, codeName } = await learner(backend, 'Export');
    const res = await handleExport(exportReq(), loader(backend, jar), NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="music-theory-now-data-2026-11-23.json"');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    const file = JSON.parse(text) as Record<string, any>;
    expect(Object.keys(file)[0]).toBe('README');
    expect(file.README.what_is_this).toMatch(/everything Music Theory Now keeps/);
    expect(file.profile.code_name).toBe(codeName);
    expect(file.profile.age_band).toBe('under_18');
    expect(file.account.email).toBeNull();
    expect(file.lesson_progress.map((l: { lesson_id: string }) => l.lesson_id)).toEqual(['g1-rhythm-01']);
    expect(file.attempts).toHaveLength(2);
    expect(file.game_scores.map((g: { game_id: string }) => g.game_id)).toEqual(['note-rush']);
    expect(file.mock_results).toHaveLength(1);
    expect(file.account_secrets).toMatchObject({ has_recovery_code: true });
    expect(text).not.toMatch(/accounts\.invalid/i);
    // (The README may use the word "password"; what must be absent is any column that holds one.)
    expect(text).not.toMatch(/"[a-z_]*(hash|password|token|throttle)[a-z_]*":|failed_attempts/i);
    expect(text).not.toMatch(/\$2[aby]\$/);
  });

  it('holds only the signed-in learner\'s rows, never another learner\'s', async () => {
    const { backend } = makers[kind]!();
    const a = await learner(backend, 'ExpA');
    const b = await learner(backend, 'ExpB');
    const text = await (await handleExport(exportReq(), loader(backend, a.jar), NOW)).text();
    expect(text).toContain(a.codeName);
    expect(text).not.toContain(b.codeName);
    const ids = new Set((JSON.parse(text).attempts as { user_id: string }[]).map((r) => r.user_id));
    expect(ids.size).toBe(1);
  });

  it(`allows ${EXPORT_THRESHOLD - 1} downloads, then asks for a wait; another learner is not affected`, async () => {
    const { backend } = makers[kind]!();
    const a = await learner(backend, 'ExpRate');
    const other = await learner(backend, 'ExpOther');
    for (let i = 1; i < EXPORT_THRESHOLD; i++) expect((await handleExport(exportReq(), loader(backend, a.jar), NOW)).status, `download ${i}`).toBe(200);
    const limited = await handleExport(exportReq(), loader(backend, a.jar), NOW);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('30');
    expect(await body(limited)).toMatchObject({ error: 'rate-limited', retryAfterSeconds: 30 });
    // Asking again while waiting is refused without making the wait longer.
    const again = await handleExport(exportReq(), loader(backend, a.jar), NOW);
    expect(again.status).toBe(429);
    expect((await body(again)).retryAfterSeconds as number).toBeLessThanOrEqual(30);
    expect((await handleExport(exportReq(), loader(backend, other.jar), NOW)).status).toBe(200);
  });

  it('a server fault is the fixed error and leaks nothing', async () => {
    const { backend } = makers[kind]!();
    const { jar } = await learner(backend, 'ExpFault');
    const broken = Object.create(backend, { exportData: { value: async () => { throw new Error('secret detail @accounts.invalid'); } } }) as AccountBackend;
    const res = await handleExport(exportReq(), loader(broken, jar), NOW);
    expect(res.status).toBe(500);
    expect(await body(res)).toEqual({ error: 'server-error' });
  });
});

describe('export strips whatever the backend returns', () => {
  it('a backend that wrongly returns the address, hashes and throttle rows still gives a clean file', async () => {
    const { backend } = makers.memory!();
    const { jar } = await learner(backend, 'Poison');
    const poisoned = Object.create(backend, {
      exportData: {
        value: async () => ({
          exported_at: '2026-11-23T09:00:00Z',
          account: { user_id: 'u', email: 'abc@accounts.invalid', created_at: 'c', password_hash: '$2b$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          profile: { user_id: 'u', code_name: 'X', recovery_code_hash: '$2b$10$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
          account_secrets: { recovery_code_hash: '$2b$10$cccc', failed_attempts: 2, locked_until: 'z', created_at: 'a', updated_at: 'b' },
          auth_throttle: [{ key: 'signin:name:x', failures: 3 }],
          lesson_progress: [], attempts: [], game_scores: [], mock_results: [],
        }),
      },
    }) as AccountBackend;
    const text = await (await handleExport(exportReq(), loader(poisoned, jar), NOW)).text();
    expect(text).not.toMatch(/accounts\.invalid|\$2[aby]\$|_hash|throttle|failed_attempts|locked_until|signin:name/);
    expect(JSON.parse(text).account_secrets).toEqual({ has_recovery_code: true, created_at: 'a', updated_at: 'b' });
  });
});

describe.each(Object.keys(makers))('%s backend: delete', (kind) => {
  it('404 when off, 403 cross-site, 401 signed out, 400 for a bad body', async () => {
    const { backend } = makers[kind]!();
    const { jar } = await learner(backend, 'DelGuard');
    const load = loader(backend, jar);
    delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
    expect((await handleDelete(deleteReq('x'), load)).status).toBe(404);
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = '1';
    expect((await handleDelete(deleteReq('x', { origin: 'https://evil.example' }), load)).status).toBe(403);
    expect((await handleDelete(deleteReq('x'), loader(backend, new TestJar()))).status).toBe(401);
    expect((await handleDelete(deleteReq(42), load)).status).toBe(400);
    expect((await handleDelete(post('/api/account/delete', {}), load)).status).toBe(400);
    // None of that deleted anything.
    expect(await backend.currentUser(jar)).not.toBeNull();
  });

  it('a wrong or someone else\'s code name deletes nothing, and five wrong tries ask for a wait', async () => {
    const { backend } = makers[kind]!();
    const a = await learner(backend, 'DelWrong');
    const b = await learner(backend, 'DelOther');
    const load = loader(backend, a.jar);
    for (let i = 0; i < 4; i++) {
      const res = await handleDelete(deleteReq(i === 0 ? b.codeName : 'nope'), load);
      expect(res.status).toBe(400);
      expect(await body(res)).toEqual({ error: 'confirm-mismatch' });
    }
    const fifth = await handleDelete(deleteReq('nope'), load);
    expect(fifth.status).toBe(429);
    // Even the right name is refused while waiting, and nothing was deleted.
    expect((await handleDelete(deleteReq(a.codeName), load)).status).toBe(429);
    expect(await backend.currentUser(a.jar)).toEqual({ codeName: a.codeName, ageBand: 'under_18' });
    expect(await backend.currentUser(b.jar)).not.toBeNull();
    expect((await (await backend.progress(a.jar))!.snapshot()).attempts).toHaveLength(2);
  });

  it('deletes the account: signed out, name free again, cannot sign in, other learner untouched', async () => {
    const { backend } = makers[kind]!();
    const a = await learner(backend, 'DelMe');
    const b = await learner(backend, 'DelKeep');
    const bBefore = JSON.stringify(await (await backend.progress(b.jar))!.snapshot());

    // A different casing and separators still count as the same name.
    const typed = a.codeName.toUpperCase().replace(/^(.{3})/, '$1-');
    const res = await handleDelete(deleteReq(typed), loader(backend, a.jar));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true });
    expect(res.headers.get('cache-control')).toBe('no-store');

    expect(a.jar.getAll()).toEqual([]); // the device's session cookies are cleared
    expect(await backend.currentUser(a.jar)).toBeNull();
    expect(await backend.progress(a.jar)).toBeNull();
    expect((await handleExport(exportReq(), loader(backend, a.jar), NOW)).status).toBe(401);
    expect(await backend.codeNameAvailable(a.codeName)).toBe(true);
    expect(await backend.signIn({ codeName: a.codeName, password: PASSWORD }, new TestJar())).toEqual({ ok: false });
    const signIn = await handleSignIn(post('/api/account/sign-in', { codeName: a.codeName, password: PASSWORD }), loader(backend, new TestJar()));
    expect(signIn.status).toBe(401);
    expect(await body(await handleMe(new Request('http://localhost:3000/api/account/me'), loader(backend, a.jar)))).toEqual({ user: null });

    expect(JSON.stringify(await (await backend.progress(b.jar))!.snapshot())).toBe(bBefore);
    expect(await backend.currentUser(b.jar)).not.toBeNull();
    // A second delete finds nobody signed in.
    expect((await handleDelete(deleteReq(a.codeName), loader(backend, a.jar))).status).toBe(401);
    // The name can be used again, and the new account starts empty.
    const again = await backend.signUp({ codeName: a.codeName, password: PASSWORD, ageBand: 'under_18' }, new TestJar());
    expect(again.ok).toBe(true);
  });

  it('ignores any user id in the request: only the session decides whose account goes', async () => {
    const { backend } = makers[kind]!();
    const a = await learner(backend, 'DelIdA');
    const b = await learner(backend, 'DelIdB');
    const res = await handleDelete(post('/api/account/delete', { confirmCodeName: a.codeName, userId: 'whoever', user_id: 'whoever' }), loader(backend, a.jar));
    expect(res.status).toBe(200);
    expect(await backend.currentUser(b.jar)).not.toBeNull();
  });
});

/** The real tables, under the real SQL. */
describe('supabase backend: delete leaves nothing', () => {
  const make = () => makers.supabase!();
  const rows = async (table: string, uid: string) =>
    Number(await h.asOwner((s) => s.scalar<string>(`select count(*) from public.${table} where user_id = $1`, [uid])));
  const idOf = (codeName: string) =>
    h.asOwner((s) => s.scalar<string>(`select user_id from public.profiles where code_name = $1`, [codeName]));

  it('every table, auth.users and the throttle rows for the account are gone; another account keeps everything', async () => {
    const { backend } = make();
    const a = await learner(backend, 'Sweep');
    const b = await learner(backend, 'SweepKeep');
    const aId = await idOf(a.codeName);
    const bId = await idOf(b.codeName);
    // Leave rate-limit rows that name this account: failed sign-ins, and a download.
    // Keys carry a keyed hash of the name, never the typed name. The name's own keys are forgotten on delete; the
    // (name + address) key expires by itself within a day.
    const hashed = nameHash(a.codeName);
    for (let i = 0; i < 2; i++) {
      await handleSignIn(post('/api/account/sign-in', { codeName: a.codeName, password: 'wrong horse!' }), loader(backend, new TestJar()));
    }
    await handleExport(exportReq(), loader(backend, a.jar), NOW);
    await h.asService((s) => s.run(`select public.auth_throttle_fail($1, 5)`, [`recover:name:${hashed}`]));
    const throttleRows = (like: string) =>
      h.asOwner((s) => s.scalar<string>(`select count(*) from public.auth_throttle where key like $1`, [like])).then(Number);
    expect(await throttleRows(`%:name:${hashed}`)).toBe(2);
    expect(await throttleRows(`%${aId}%`)).toBe(1);

    const before: Record<string, number> = {};
    for (const t of USER_TABLES) before[t] = await rows(t, bId);
    for (const t of ['lesson_progress', 'attempts', 'game_scores', 'mock_results', 'profiles', 'account_secrets']) {
      expect(await rows(t, aId), `${t} before`).toBeGreaterThan(0);
    }

    const res = await handleDelete(deleteReq(a.codeName), loader(backend, a.jar));
    expect(res.status).toBe(200);

    for (const t of USER_TABLES) expect(await rows(t, aId), t).toBe(0);
    expect(Number(await h.asOwner((s) => s.scalar<string>(`select count(*) from auth.users where id = $1`, [aId])))).toBe(0);
    expect(await throttleRows(`%:name:${hashed}`)).toBe(0);
    expect(await throttleRows(`%${aId}%`)).toBe(0);
    for (const t of USER_TABLES) expect(await rows(t, bId), `${t} (other)`).toBe(before[t]);
    expect(Number(await h.asOwner((s) => s.scalar<string>(`select count(*) from auth.users where id = $1`, [bId])))).toBe(1);
  });

  describe('a failure part-way', () => {
    const break_ = (fake: FakeSupabase, over: { rpc?: (name: string, real: () => Promise<unknown>) => Promise<unknown>; deleteUser?: (real: () => Promise<unknown>) => Promise<unknown> }) => {
      const sessionClient = (jar: CookieJar) => {
        const real = fake.sessionClient(jar);
        return new Proxy(real, {
          get: (t, p, r) =>
            p === 'rpc' && over.rpc
              ? (rpcName: string, args?: Record<string, unknown>) => over.rpc!(rpcName, () => (t as any).rpc(rpcName, args))
              : Reflect.get(t, p, r),
        });
      };
      const admin = new Proxy(fake.admin, {
        get: (t, p, r) => {
          if (p === 'auth' && over.deleteUser) {
            const auth = Reflect.get(t, p, r) as any;
            return { admin: { ...auth.admin, getUserById: auth.admin.getUserById, deleteUser: (id: string) => over.deleteUser!(() => auth.admin.deleteUser(id)) } };
          }
          return Reflect.get(t, p, r);
        },
      });
      return new SupabaseAccountBackend({ admin, sessionClient });
    };

    it('delete_my_account() failing changes nothing: still signed in, all data there, and trying again works', async () => {
      const fake = createFakeSupabase(h);
      let failNext = true;
      const backend = break_(fake, {
        rpc: async (rpcName, real) => {
          if (rpcName === 'delete_my_account' && failNext) return { data: null, error: { message: 'connection lost' } };
          return real();
        },
      });
      const a = await learner(backend, 'Part1');
      const id = await idOf(a.codeName);
      const res = await handleDelete(deleteReq(a.codeName), loader(backend, a.jar));
      expect(res.status).toBe(500);
      expect(await body(res)).toEqual({ error: 'server-error' });
      expect(await backend.currentUser(a.jar)).not.toBeNull();
      for (const t of USER_TABLES.filter((x) => x !== 'adult_contacts')) expect(await rows(t, id), t).toBeGreaterThan(0);
      expect(Number(await h.asOwner((s) => s.scalar<string>(`select count(*) from auth.users where id = $1`, [id])))).toBe(1);

      failNext = false;
      expect((await handleDelete(deleteReq(a.codeName), loader(backend, a.jar))).status).toBe(200);
      for (const t of USER_TABLES) expect(await rows(t, id), t).toBe(0);
    });

    it('the admin call failing AFTER the account is gone is still a success (it is already deleted)', async () => {
      const fake = createFakeSupabase(h);
      const backend = break_(fake, { deleteUser: async () => ({ data: null, error: { message: 'bad gateway', status: 502 } }) });
      const a = await learner(backend, 'Part2');
      const id = await idOf(a.codeName);
      const res = await handleDelete(deleteReq(a.codeName), loader(backend, a.jar));
      expect(res.status).toBe(200);
      expect(Number(await h.asOwner((s) => s.scalar<string>(`select count(*) from auth.users where id = $1`, [id])))).toBe(0);
      expect(a.jar.getAll()).toEqual([]);
    });

    it('data gone but the auth user left behind: reported as a fault, the session is kept, and a retry finishes the job', async () => {
      const fake = createFakeSupabase(h);
      let adminBroken = true;
      const backend = break_(fake, {
        // A delete_my_account() that removed the data but not the login (it cannot today: this proves the order copes).
        rpc: async (rpcName, real) => {
          if (rpcName !== 'delete_my_account') return real();
          if (adminBroken) {
            const id = await h.asOwner((s) => s.scalar<string>(`select user_id from public.profiles where code_name = $1`, [lastName]));
            await h.asOwner((s) => s.run(`delete from public.lesson_progress where user_id = $1`, [id]));
            await h.asOwner((s) => s.run(`delete from public.attempts where user_id = $1`, [id]));
            await h.asOwner((s) => s.run(`delete from public.profiles where user_id = $1`, [id]));
            return { data: null, error: null };
          }
          return real();
        },
        deleteUser: async (real) => (adminBroken ? { data: null, error: { message: 'bad gateway', status: 502 } } : real()),
      });
      const a = await learner(backend, 'Part3');
      const lastName = a.codeName;
      const id = await idOf(a.codeName);
      const first = await handleDelete(deleteReq(a.codeName), loader(backend, a.jar));
      expect(first.status).toBe(500);
      // Still signed in (the cookie is only cleared at the very end), so the person can try again.
      expect(a.jar.getAll().length).toBeGreaterThan(0);
      expect(await backend.accountId(a.jar)).toBe(id);
      expect(await rows('profiles', id)).toBe(0);

      adminBroken = false;
      const second = await handleDelete(deleteReq(a.codeName), loader(backend, a.jar));
      expect(second.status).toBe(200);
      expect(Number(await h.asOwner((s) => s.scalar<string>(`select count(*) from auth.users where id = $1`, [id])))).toBe(0);
      for (const t of USER_TABLES) expect(await rows(t, id), t).toBe(0);
      expect(a.jar.getAll()).toEqual([]);
    });
  });

  it('export_my_data() as the route uses it: only this learner, with the address and hash still out of the file', async () => {
    const { backend } = make();
    const a = await learner(backend, 'RealExp');
    const raw = (await backend.exportData(a.jar)) as Record<string, any>;
    // The database function hands back the made-up address as null and no hash; the route would strip it anyway.
    expect(raw.account.email).toBeNull();
    expect(JSON.stringify(raw)).not.toMatch(/\$2[aby]\$/);
    expect(await backend.exportData(new TestJar())).toBeNull();
  });
});

describe('finding 5: a large export stays under the 4.5 MB response cap', () => {
  it('10,000 attempts: compact, no repeated user id, streamed, and under 4.5 MB', async () => {
    const { backend } = makers.memory!();
    const { jar } = await learner(backend, 'BigExport');
    const store = (await backend.progress(jar))!;
    const base = Date.now() - 3_600_000;
    const attempts = Array.from({ length: 10_000 }, (_, i): AttemptWire => ({
      lessonId: 'g1-rhythm-01', step: 'practice', questionId: `question-${i}`, skill: 'rhythm.note.value', type: 'multiple-choice',
      correct: i % 2 === 0, score: 1, msTaken: 1234, seed: 123456789 + i, at: new Date(base + i * 100).toISOString(),
    }));
    await store.recordAttempts(attempts);
    const res = await handleExport(exportReq(), loader(backend, jar), NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBeNull(); // streamed, not one sized body
    const reader = res.body!.getReader();
    let bytes = 0;
    let pieces = 0;
    let text = '';
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pieces++;
      bytes += value.length;
      text += decoder.decode(value, { stream: true });
    }
    expect(pieces).toBeGreaterThan(5);
    // Under the cap even if it were one body (about 3.1 MB); because it is streamed, a bigger file is not limited by it.
    expect(bytes).toBeLessThan(4.5 * 1024 * 1024);
    const parsed = JSON.parse(text);
    expect(parsed.attempts.length).toBeGreaterThanOrEqual(10_000);
    expect(parsed.attempts[0]).not.toHaveProperty('user_id');
    expect(text).not.toContain('\n  ');
    // The account id appears in `account` and `profile`, and in no list row.
    expect(text.split(parsed.account.user_id).length - 1).toBe(2);
  }, 60_000);
});
