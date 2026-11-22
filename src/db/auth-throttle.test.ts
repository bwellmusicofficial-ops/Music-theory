// @vitest-environment node
/** 0002_auth_throttle.sql: the counters behind sign-in rate limiting. */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AVAILABILITY_THRESHOLD, IP_THRESHOLD, NAME_THRESHOLD, SIGN_UP_THRESHOLD, throttleDelaySeconds } from '@/accounts/throttle';
import { createHarness, MIGRATION_PATH, THROTTLE_MIGRATION_PATH, type Harness } from './test-harness';
import { attempt } from './fixtures';

let h: Harness;
beforeAll(async () => {
  h = await createHarness({ throttle: true });
}, 60_000);
afterAll(async () => {
  await h.close();
});

const fail = (key: string, threshold = 5) => h.asService((s) => s.scalar<number>(`select public.auth_throttle_fail($1, $2)`, [key, threshold]));
const check = (key: string) => h.asService((s) => s.scalar<number>(`select public.auth_throttle_check($1)`, [key]));
const clear = (key: string) => h.asService((s) => s.run(`select public.auth_throttle_clear($1)`, [key]));

describe('schedule', () => {
  it('allows 5 failures, then 30, 60, 120, 240, 480, then 900 seconds', async () => {
    const waits: number[] = [];
    for (let i = 0; i < 12; i++) waits.push(await fail('t:schedule'));
    expect(waits).toEqual([0, 0, 0, 0, 30, 60, 120, 240, 480, 900, 900, 900]);
  });

  it('check reports the wait after a failure, and 0 for an unknown key', async () => {
    expect(await check('t:never-seen')).toBe(0);
    for (let i = 0; i < 5; i++) await fail('t:check');
    const w = await check('t:check');
    expect(w).toBeGreaterThan(25);
    expect(w).toBeLessThanOrEqual(30);
  });

  it('agrees with the TypeScript schedule for every count and every threshold in use', async () => {
    for (const threshold of [NAME_THRESHOLD, IP_THRESHOLD, AVAILABILITY_THRESHOLD, SIGN_UP_THRESHOLD, 1]) {
      for (let n = 1; n <= threshold + 9; n++) {
        const sql = await h.asOwner((s) => s.scalar<number>(`select private.auth_throttle_delay($1, $2)`, [n, threshold]));
        expect(sql, `n=${n} threshold=${threshold}`).toBe(throttleDelaySeconds(n, threshold));
      }
    }
  });

  it('keys are independent, and a threshold per call is honoured', async () => {
    expect(await fail('t:a', 1)).toBe(30);
    expect(await check('t:b')).toBe(0);
    expect(await fail('t:b', 3)).toBe(0);
  });

  it('clear forgets the key', async () => {
    for (let i = 0; i < 6; i++) await fail('t:clear');
    expect(await check('t:clear')).toBeGreaterThan(0);
    await clear('t:clear');
    expect(await check('t:clear')).toBe(0);
    expect(await fail('t:clear')).toBe(0);
  });

  it('starts again after an hour with no failure, and idle rows are deleted after a day', async () => {
    for (let i = 0; i < 6; i++) await fail('t:window');
    await h.asOwner((s) => s.run(`update public.auth_throttle set last_failed_at = now() - interval '61 minutes', locked_until = now() - interval '30 minutes' where key = 't:window'`));
    expect(await check('t:window')).toBe(0);
    expect(await fail('t:window')).toBe(0); // count restarted at 1
    expect(await h.asOwner((s) => s.scalar<number>(`select failures from public.auth_throttle where key = 't:window'`))).toBe(1);

    await fail('t:old');
    await h.asOwner((s) => s.run(`update public.auth_throttle set updated_at = now() - interval '25 hours' where key = 't:old'`));
    await fail('t:trigger-cleanup');
    expect(await h.asOwner((s) => s.scalar<number>(`select count(*)::int from public.auth_throttle where key = 't:old'`))).toBe(0);
  });

  it('refuses a bad key or threshold', async () => {
    for (const [k, t] of [['', 5], ['x'.repeat(101), 5], ['ok', 0]] as const) {
      const r = await h.asService((s) => attempt(s, `select public.auth_throttle_fail($1, $2)`, [k, t]));
      expect(r.ok).toBe(false);
    }
  });

  it('stores no more than the key, a count and times', async () => {
    const cols = await h.asOwner((s) => s.q<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'auth_throttle' order by ordinal_position`));
    expect(cols.map((c) => c.column_name)).toEqual(['key', 'failures', 'last_failed_at', 'locked_until', 'updated_at']);
  });
});

describe('security: service role only', () => {
  it('RLS is enabled and forced, and there is no policy', async () => {
    const [t] = await h.asOwner((s) => s.q<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(`select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.auth_throttle'::regclass`));
    expect(t).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    expect(await h.asOwner((s) => s.scalar<number>(`select count(*)::int from pg_policies where tablename = 'auth_throttle'`))).toBe(0);
  });

  it('anon and authenticated can neither read nor write the table', async () => {
    await fail('t:secret');
    const uid = await h.newUser();
    for (const run of [h.asAnon, ((f) => h.asUser(uid, f)) as typeof h.asAnon]) {
      for (const sql of [
        `select * from public.auth_throttle`,
        `insert into public.auth_throttle (key) values ('x')`,
        `update public.auth_throttle set failures = 0`,
        `delete from public.auth_throttle`,
      ]) {
        const r = await run((s) => attempt(s, sql));
        expect(r.ok, sql).toBe(false);
        if (!r.ok) expect(r.code).toBe('42501');
      }
    }
  });

  it('anon and authenticated cannot run any of the functions', async () => {
    const uid = await h.newUser();
    for (const run of [h.asAnon, ((f) => h.asUser(uid, f)) as typeof h.asAnon]) {
      for (const sql of [
        `select public.auth_throttle_check('k')`,
        `select public.auth_throttle_fail('k', 5)`,
        `select public.auth_throttle_clear('k')`,
        `select private.auth_throttle_delay(5, 5)`,
      ]) {
        const r = await run((s) => attempt(s, sql));
        expect(r.ok, sql).toBe(false);
        if (!r.ok) expect(r.code).toBe('42501');
      }
    }
  });

  it('the service role can run the three functions but still sees nothing it should not by other means', async () => {
    expect(await check('k')).toBe(0);
  });
});

describe('re-running', () => {
  it('0002 is idempotent and keeps existing counters', async () => {
    for (let i = 0; i < 6; i++) await fail('t:rerun');
    const before = await check('t:rerun');
    await h.db.exec(readFileSync(THROTTLE_MIGRATION_PATH, 'utf8'));
    await h.db.exec(readFileSync(THROTTLE_MIGRATION_PATH, 'utf8'));
    expect(await check('t:rerun')).toBeGreaterThan(0);
    expect(before).toBeGreaterThan(0);
  });

  it('refuses to run before 0001, and as an ordinary role', async () => {
    const sql = readFileSync(THROTTLE_MIGRATION_PATH, 'utf8');
    const bare = await createHarness({ migrationSql: 'select 1' });
    await expect(bare.db.exec(sql)).rejects.toThrow(/0001_init/);
    await bare.db.exec('create schema private; set role anon');
    await expect(bare.db.exec(sql)).rejects.toThrow(/BYPASSRLS/);
    await bare.db.exec('reset role');
    await bare.close();
  });

  it('0001 can still be re-run on top of 0002', async () => {
    await h.db.exec(readFileSync(MIGRATION_PATH, 'utf8'));
    expect(await check('t:rerun')).toBeGreaterThan(0);
  });
});

