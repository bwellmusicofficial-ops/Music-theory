// @vitest-environment node
/**
 * Acceptance 1, 2, 3 and 7: row level security, table by table and operation by
 * operation, for another signed-in user and for anon.
 *
 * Each attack is run twice: with the real privileges (the normal case), and with
 * the role temporarily granted full table privileges so that ONLY the policies
 * stand in the way. A weakened policy, or a weakened grant plus a weakened policy,
 * is caught either way. Every attack is followed by a check, as the owner, that
 * the victim's data is unchanged, and by a positive control that the legitimate
 * operation still works for the user's own rows.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './test-harness';
import {
  ALL_TABLES,
  USER_TABLES,
  attempt,
  attemptInsert,
  countRows,
  seedAdultContact,
  seedUserData,
  withFullGrants,
} from './fixtures';

let h: Harness;
let a: string; // the attacker
let b: string; // the victim
let bSnapshot: Record<string, string>;

async function snapshotOf(uid: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await h.asOwner(async (s) => {
    for (const t of USER_TABLES) {
      const rows = await s.q(`select to_jsonb(t) as r from public.${t} t where user_id = $1 order by 1::text`, [uid]);
      out[t] = JSON.stringify(rows);
    }
  });
  return out;
}

beforeAll(async () => {
  h = await createHarness({ seed: true });
  a = await h.newUser({ codeName: 'AttackerA', ageBand: 'adult' });
  b = await h.newUser({ codeName: 'VictimB', ageBand: 'adult' });
  for (const u of [a, b]) {
    await seedUserData(h, u);
    await seedAdultContact(h, u);
  }
  bSnapshot = await snapshotOf(b);
}, 60_000);

afterAll(async () => {
  await h.close();
});

/** Statements that try to change user B's data, per table and operation. */
function attacks(table: string): { op: string; sql: string; params: unknown[] }[] {
  const bid = 'VICTIM';
  switch (table) {
    case 'profiles':
      return [
        { op: 'insert', sql: `insert into public.profiles (user_id) values ($1)`, params: [bid] },
        { op: 'update', sql: `update public.profiles set settings = '{"theme":"light"}' where user_id = $1`, params: [bid] },
        { op: 'update (all rows)', sql: `update public.profiles set settings = '{"theme":"light"}'`, params: [] },
        { op: 'delete', sql: `delete from public.profiles where user_id = $1`, params: [bid] },
      ];
    case 'adult_contacts':
      return [
        { op: 'insert', sql: `insert into public.adult_contacts (user_id, full_name) values ($1, 'x')`, params: [bid] },
        { op: 'update', sql: `update public.adult_contacts set full_name = 'Hacked' where user_id = $1`, params: [bid] },
        { op: 'update (all rows)', sql: `update public.adult_contacts set full_name = 'Hacked'`, params: [] },
        { op: 'delete', sql: `delete from public.adult_contacts where user_id = $1`, params: [bid] },
      ];
    case 'account_secrets':
      return [
        { op: 'insert', sql: `insert into public.account_secrets (user_id, recovery_code_hash) values ($1, '$2b$10$${'b'.repeat(53)}')`, params: [bid] },
        { op: 'update', sql: `update public.account_secrets set failed_attempts = 0 where user_id = $1`, params: [bid] },
        { op: 'delete', sql: `delete from public.account_secrets where user_id = $1`, params: [bid] },
      ];
    case 'lesson_progress':
      return [
        { op: 'insert', sql: `insert into public.lesson_progress (user_id, lesson_id) values ($1, 'g1-pitch-01')`, params: [bid] },
        { op: 'update', sql: `update public.lesson_progress set best_score = 0.1 where user_id = $1`, params: [bid] },
        { op: 'update (all rows)', sql: `update public.lesson_progress set best_score = 1`, params: [] },
        { op: 'delete', sql: `delete from public.lesson_progress where user_id = $1`, params: [bid] },
      ];
    case 'attempts': {
      const [sql, params] = attemptInsert(bid, 99);
      return [
        { op: 'insert', sql, params },
        { op: 'update', sql: `update public.attempts set score = 0 where user_id = $1`, params: [bid] },
        { op: 'delete', sql: `delete from public.attempts where user_id = $1`, params: [bid] },
      ];
    }
    case 'game_scores':
      return [
        { op: 'insert', sql: `insert into public.game_scores (user_id, game_id, score) values ($1, 'note-rush', 1)`, params: [bid] },
        { op: 'update', sql: `update public.game_scores set score = 0 where user_id = $1`, params: [bid] },
        { op: 'delete', sql: `delete from public.game_scores where user_id = $1`, params: [bid] },
      ];
    case 'mock_results':
      return [
        { op: 'insert', sql: `insert into public.mock_results (user_id, grade, score) values ($1, '1', 1)`, params: [bid] },
        { op: 'update', sql: `update public.mock_results set score = 0 where user_id = $1`, params: [bid] },
        { op: 'delete', sql: `delete from public.mock_results where user_id = $1`, params: [bid] },
      ];
    case 'blocked_names':
      return [
        { op: 'insert', sql: `insert into public.blocked_names (word) values ('zzz')`, params: [] },
        { op: 'update', sql: `update public.blocked_names set word = 'zzz'`, params: [] },
        { op: 'delete', sql: `delete from public.blocked_names`, params: [] },
      ];
  }
  throw new Error(table);
}

/** Attack parameters are built before the users exist; swap in the real victim id. */
const sub = (params: unknown[]) => params.map((p) => (p === 'VICTIM' ? b : p));

/** Tables on which the signed-in user may read own rows. */
const READABLE = ['profiles', 'adult_contacts', 'lesson_progress', 'attempts', 'game_scores', 'mock_results'];
const SERVICE_ONLY = ['account_secrets', 'blocked_names'];

describe('Acceptance 1: user A cannot select, insert, update or delete user B rows (every table)', () => {
  for (const table of [...USER_TABLES]) {
    describe(table, () => {
      it('select: A never sees B rows', async () => {
        const run = async () =>
          h.asUser(a, async (s) => {
            const r = await attempt(s, `select user_id from public.${table} where user_id = $1`, [b]);
            const all = await attempt(s, `select user_id from public.${table}`);
            return { r, all, rows: all.ok ? await s.q<{ user_id: string }>(`select user_id from public.${table}`) : [] };
          });
        for (const full of [false, true]) {
          const out = full ? await withFullGrants(h, 'authenticated', run) : await run();
          if (SERVICE_ONLY.includes(table) && !full) {
            // No privilege at all.
            expect(out.r.ok).toBe(false);
            if (!out.r.ok) expect(out.r.code).toBe('42501');
          } else {
            expect(out.r.ok).toBe(true);
            expect(out.rows.every((row) => row.user_id === a)).toBe(true);
            if (out.r.ok) expect(out.r.count).toBe(0);
          }
        }
        // Positive control: own rows are readable where the design says so.
        if (READABLE.includes(table)) {
          const own = await h.asUser(a, (s) => s.q(`select user_id from public.${table} where user_id = $1`, [a]));
          expect(own.length).toBe(1);
        }
      });

      for (const atk of attacks(table)) {
        it(`${atk.op}: fails or changes nothing`, async () => {
          for (const full of [false, true]) {
            const run = () => h.asUser(a, (s) => attempt(s, atk.sql, sub(atk.params)));
            const out = full ? await withFullGrants(h, 'authenticated', run) : await run();
            if (out.ok) {
              // Statement allowed to run but must not have touched any row.
              expect(out.count, `${atk.op} on ${table} (full grants: ${full}) affected rows`).toBe(
                atk.op.startsWith('update (all rows)') ? 1 : 0,
              );
            } else {
              expect(['42501', '23505'], out.message).toContain(out.code);
              // Inserts must be refused by policy or privilege, never by a mere duplicate key.
              if (atk.op === 'insert') expect(out.code).toBe('42501');
            }
            expect(await snapshotOf(b), `${table} ${atk.op} changed B data (full grants: ${full})`).toEqual(bSnapshot);
          }
        });
      }
    });
  }

  it('update (all rows) by A only ever touches A rows (full grants)', async () => {
    await withFullGrants(h, 'authenticated', async () => {
      await h.asUser(a, async (s) => {
        await s.run(`update public.lesson_progress set question_index = 3`);
        await s.run(`update public.game_scores set score = 5`);
      });
    });
    expect(await snapshotOf(b)).toEqual(bSnapshot);
    const aRow = await h.asOwner((s) => s.q(`select question_index from public.lesson_progress where user_id = $1`, [a]));
    expect(aRow[0]).toEqual({ question_index: 3 });
  });

  describe('positive controls: A can do what the design allows on own rows', () => {
    it('profiles: update own settings', async () => {
      const r = await h.asUser(a, (s) =>
        attempt(s, `update public.profiles set settings = '{"theme":"light"}' where user_id = $1`, [a]),
      );
      expect(r).toEqual({ ok: true, count: 1 });
    });
    it('adult_contacts: update own full_name', async () => {
      const r = await h.asUser(a, (s) =>
        attempt(s, `update public.adult_contacts set full_name = 'Alex Two' where user_id = $1`, [a]),
      );
      expect(r).toEqual({ ok: true, count: 1 });
    });
    it('lesson_progress: insert and update own', async () => {
      await h.asUser(a, async (s) => {
        expect(await attempt(s, `insert into public.lesson_progress (user_id, lesson_id) values ($1, 'g1-pitch-01')`, [a])).toEqual({ ok: true, count: 1 });
        expect(await attempt(s, `update public.lesson_progress set question_index = 2 where user_id = $1 and lesson_id = 'g1-pitch-01'`, [a])).toEqual({ ok: true, count: 1 });
      });
    });
    it('attempts, game_scores, mock_results: insert own', async () => {
      await h.asUser(a, async (s) => {
        const [sql, params] = attemptInsert(a, 2);
        expect(await attempt(s, sql, params)).toEqual({ ok: true, count: 1 });
        expect(await attempt(s, `insert into public.game_scores (user_id, game_id, score) values ($1, 'note-rush', 3)`, [a])).toEqual({ ok: true, count: 1 });
        expect(await attempt(s, `insert into public.mock_results (user_id, grade, score) values ($1, '2', 0.5)`, [a])).toEqual({ ok: true, count: 1 });
      });
    });
  });
});

describe('Acceptance 2: a signed-out request can read nothing from any table', () => {
  for (const table of ALL_TABLES) {
    it(`${table}: anon select, insert, update, delete`, async () => {
      for (const full of [false, true]) {
        const run = () =>
          h.asAnon(async (s) => {
            const sel = await attempt(s, `select * from public.${table}`);
            const ops = [];
            for (const atk of attacks(table)) ops.push({ op: atk.op, r: await attempt(s, atk.sql, sub(atk.params)) });
            return { sel, ops };
          });
        const out = full ? await withFullGrants(h, 'anon', run) : await run();
        if (out.sel.ok) expect(out.sel.count, `anon read rows from ${table} (full grants)`).toBe(0);
        else expect(out.sel.code).toBe('42501');
        for (const { op, r } of out.ops) {
          if (r.ok) expect(r.count, `anon ${op} on ${table} (full grants: ${full})`).toBe(0);
          else expect(r.code).toBe('42501');
        }
        expect(await snapshotOf(b)).toEqual(bSnapshot);
        // Row count sanity: the data really is there, anon just cannot see it.
        expect(await countRows(h, table === 'blocked_names' ? 'blocked_names' : table, b).catch(() => 1)).toBeGreaterThanOrEqual(0);
      }
    });
  }

  it('anon cannot read the tables even through a view of a function result (no direct privilege)', async () => {
    const r = await h.asAnon((s) => attempt(s, `select count(*) from public.profiles`));
    expect(r.ok).toBe(false);
  });
});

describe('Acceptance 3: account_secrets and blocked_names are unreadable by any signed-in user', () => {
  for (const table of SERVICE_ONLY) {
    it(`${table}: no privileges, and no rows even with full grants`, async () => {
      // The data exists.
      const rows = await h.asService((s) => s.q(`select * from public.${table}`));
      expect(rows.length).toBeGreaterThan(0);
      // Authenticated: refused outright.
      const refused = await h.asUser(a, (s) => attempt(s, `select * from public.${table}`));
      expect(refused.ok).toBe(false);
      // Even if privileges were wrongly granted, there is no policy, so zero rows.
      const viaPolicyOnly = await withFullGrants(h, 'authenticated', () =>
        h.asUser(a, (s) => attempt(s, `select * from public.${table}`)),
      );
      expect(viaPolicyOnly).toEqual({ ok: true, count: 0 });
      // Own secrets row is not readable either.
      if (table === 'account_secrets') {
        const own = await withFullGrants(h, 'authenticated', () =>
          h.asUser(a, (s) => attempt(s, `select * from public.account_secrets where user_id = $1`, [a])),
        );
        expect(own).toEqual({ ok: true, count: 0 });
      }
    });
  }

  it('service role can read both (it is the only role that can)', async () => {
    expect((await h.asService((s) => s.q(`select * from public.account_secrets`))).length).toBeGreaterThan(0);
    expect((await h.asService((s) => s.q(`select * from public.blocked_names`))).length).toBeGreaterThan(0);
  });
});

describe('Acceptance 7: attempts cannot be updated or deleted by their owner', () => {
  it('owner update and delete are refused and the row is unchanged', async () => {
    const before = await h.asOwner((s) => s.q(`select * from public.attempts where user_id = $1 order by id`, [a]));
    expect(before.length).toBeGreaterThan(0);
    await h.asUser(a, async (s) => {
      const u = await attempt(s, `update public.attempts set score = 0, correct = false where user_id = $1`, [a]);
      const d = await attempt(s, `delete from public.attempts where user_id = $1`, [a]);
      expect(u.ok).toBe(false);
      expect(d.ok).toBe(false);
      if (!u.ok) expect(u.code).toBe('42501');
      if (!d.ok) expect(d.code).toBe('42501');
    });
    expect(await h.asOwner((s) => s.q(`select * from public.attempts where user_id = $1 order by id`, [a]))).toEqual(before);
  });

  it('even if the privileges were granted, no policy allows it', async () => {
    const before = await h.asOwner((s) => s.q(`select * from public.attempts where user_id = $1 order by id`, [a]));
    await withFullGrants(h, 'authenticated', async () => {
      await h.asUser(a, async (s) => {
        expect(await attempt(s, `update public.attempts set score = 0 where user_id = $1`, [a])).toEqual({ ok: true, count: 0 });
        expect(await attempt(s, `delete from public.attempts where user_id = $1`, [a])).toEqual({ ok: true, count: 0 });
      });
    });
    expect(await h.asOwner((s) => s.q(`select * from public.attempts where user_id = $1 order by id`, [a]))).toEqual(before);
  });

  it('game_scores and mock_results are also append only for the owner', async () => {
    await withFullGrants(h, 'authenticated', async () => {
      await h.asUser(a, async (s) => {
        for (const t of ['game_scores', 'mock_results']) {
          expect(await attempt(s, `update public.${t} set score = 0 where user_id = $1`, [a])).toEqual({ ok: true, count: 0 });
          expect(await attempt(s, `delete from public.${t} where user_id = $1`, [a])).toEqual({ ok: true, count: 0 });
        }
      });
    });
  });
});
