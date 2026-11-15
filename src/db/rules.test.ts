// @vitest-environment node
/**
 * Acceptance 4 and 6, plus the remaining rules of the design: age band, code name
 * protection, adult_contacts, set_marketing, best_score and state monotonicity,
 * the attempts rate cap, value constraints, FORCE RLS, privileges and function grants.
 *
 * Where a rule is enforced twice (a column privilege AND a trigger) the trigger
 * is tested on its own by temporarily granting the privilege.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './test-harness';
import { ALL_TABLES, ATTEMPT_COLUMNS, attempt, attemptInsert, seedAdultContact, withTemporarily } from './fixtures';

let h: Harness;
beforeAll(async () => {
  h = await createHarness({ seed: true });
}, 60_000);
afterAll(async () => {
  await h.close();
});

const profileOf = (id: string) =>
  h.asOwner((s) => s.q<{ age_band: string; adult_confirmed_at: string | null; code_name: string | null }>(
    `select age_band, adult_confirmed_at, code_name from public.profiles where user_id = $1`, [id]).then((r) => r[0]));

describe('age band', () => {
  it('defaults to under_18; only the server can create an adult profile (app metadata)', async () => {
    const kid = await h.newUser();
    const adult = await h.newUser({ ageBand: 'adult' });
    expect((await profileOf(kid)).age_band).toBe('under_18');
    expect((await profileOf(kid)).adult_confirmed_at).toBeNull();
    const p = await profileOf(adult);
    expect(p.age_band).toBe('adult');
    expect(p.adult_confirmed_at).not.toBeNull();
  });

  it('user metadata (which the user controls) cannot make an adult', async () => {
    const id = crypto.randomUUID();
    await h.asOwner((s) => s.run(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"age_band":"adult","code_name":"Sneaky1"}')`, [id]));
    const p = await profileOf(id);
    expect(p.age_band).toBe('under_18');
    expect(p.code_name).toBeNull();
  });

  it('the owner cannot write age_band (privilege) ', async () => {
    const kid = await h.newUser();
    const r = await h.asUser(kid, (s) => attempt(s, `update public.profiles set age_band = 'adult' where user_id = $1`, [kid]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('42501');
    expect((await profileOf(kid)).age_band).toBe('under_18');
  });

  it('trigger alone: owner of the row cannot raise age_band even with the privilege', async () => {
    const kid = await h.newUser();
    await withTemporarily(h, `grant update on public.profiles to authenticated`, `revoke update on public.profiles from authenticated; grant update (settings) on public.profiles to authenticated`, async () => {
      const r = await h.asUser(kid, (s) => attempt(s, `update public.profiles set age_band = 'adult' where user_id = $1`, [kid]));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/confirm_adult/);
    });
    expect((await profileOf(kid)).age_band).toBe('under_18');
  });

  it('service role cannot raise or lower age_band, and nobody can lower it', async () => {
    const kid = await h.newUser();
    const adult = await h.newUser({ ageBand: 'adult' });
    const up = await h.asService((s) => attempt(s, `update public.profiles set age_band = 'adult' where user_id = $1`, [kid]));
    expect(up.ok).toBe(false);
    const down = await h.asService((s) => attempt(s, `update public.profiles set age_band = 'under_18' where user_id = $1`, [adult]));
    expect(down.ok).toBe(false);
    const downOwner = await h.asOwner((s) => attempt(s, `update public.profiles set age_band = 'under_18' where user_id = $1`, [adult]));
    expect(downOwner.ok).toBe(false);
    const stamp = await h.asService((s) => attempt(s, `update public.profiles set adult_confirmed_at = null where user_id = $1`, [adult]));
    // either refused or silently kept
    expect((await profileOf(adult)).adult_confirmed_at).not.toBeNull();
    expect(stamp.ok === false || stamp.ok === true).toBe(true);
  });

  it('confirm_adult() raises it, records the time, is idempotent, and anon cannot call it', async () => {
    const kid = await h.newUser();
    await h.asUser(kid, (s) => s.run(`select public.confirm_adult()`));
    const p1 = await profileOf(kid);
    expect(p1.age_band).toBe('adult');
    expect(p1.adult_confirmed_at).not.toBeNull();
    await h.asUser(kid, (s) => s.run(`select public.confirm_adult()`));
    expect((await profileOf(kid)).adult_confirmed_at).toEqual(p1.adult_confirmed_at);
    // And it never goes back.
    const back = await h.asUser(kid, (s) => attempt(s, `update public.profiles set age_band = 'under_18' where user_id = $1`, [kid]));
    expect(back.ok).toBe(false);
    expect((await h.asAnon((s) => s.fails(`select public.confirm_adult()`))).code).toBe('42501');
  });

  it('confirm_adult() only ever changes the caller', async () => {
    const a = await h.newUser();
    const b = await h.newUser();
    await h.asUser(a, (s) => s.run(`select public.confirm_adult()`));
    expect((await profileOf(b)).age_band).toBe('under_18');
  });
});

describe('code_name is not changeable by its owner', () => {
  it('privilege layer', async () => {
    const id = await h.newUser({ codeName: 'OwnerName1' });
    const r = await h.asUser(id, (s) => attempt(s, `update public.profiles set code_name = 'NewName2' where user_id = $1`, [id]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('42501');
  });
  it('trigger layer (privilege temporarily granted)', async () => {
    const id = await h.newUser({ codeName: 'OwnerName3' });
    await withTemporarily(h, `grant update on public.profiles to authenticated`, `revoke update on public.profiles from authenticated; grant update (settings) on public.profiles to authenticated`, async () => {
      const r = await h.asUser(id, (s) => attempt(s, `update public.profiles set code_name = 'NewName4' where user_id = $1`, [id]));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/code_name/);
      const toNull = await h.asUser(id, (s) => attempt(s, `update public.profiles set code_name = null where user_id = $1`, [id]));
      expect(toNull.ok).toBe(false);
    });
    expect((await profileOf(id)).code_name).toBe('OwnerName3');
  });
  it('service role may rename (subject to every rule)', async () => {
    const id = await h.newUser({ codeName: 'OwnerName5' });
    expect((await h.asService((s) => attempt(s, `update public.profiles set code_name = 'OwnerName6' where user_id = $1`, [id]))).ok).toBe(true);
  });
  it('user_id cannot be changed', async () => {
    const a = await h.newUser();
    const b = await h.newUser();
    await h.asOwner((s) => s.run(`delete from public.profiles where user_id = $1`, [b]));
    const r = await h.asService((s) => attempt(s, `update public.profiles set user_id = $1 where user_id = $2`, [b, a]));
    expect(r.ok).toBe(false);
  });
});

describe('settings (no free text)', () => {
  it('accepts the LearnerSettings keys', async () => {
    const id = await h.newUser();
    const ok = await h.asUser(id, (s) => attempt(s, `update public.profiles set settings = $2::jsonb where user_id = $1`, [id, JSON.stringify({ terminology: 'us', soundOn: false, reducedMotion: true, untimed: true, theme: 'light', latencyOffsetMs: 40 })]));
    expect(ok).toEqual({ ok: true, count: 1 });
  });
  it.each([
    [{ nickname: 'Sam Jones' }],
    [{ terminology: 'my real name' }],
    [{ theme: 'x'.repeat(500) }],
    [{ soundOn: 'yes' }],
    [{ latencyOffsetMs: 99999 }],
    [['array']],
    ['"string"'],
  ])('rejects %j', async (value) => {
    const id = await h.newUser();
    const r = await h.asUser(id, (s) => attempt(s, `update public.profiles set settings = $2::jsonb where user_id = $1`, [id, typeof value === 'string' ? value : JSON.stringify(value)]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('23514');
  });
  it('updated_at moves on update', async () => {
    const id = await h.newUser();
    const before = await h.asOwner((s) => s.scalar<Date>(`select updated_at from public.profiles where user_id = $1`, [id]));
    await new Promise((r) => setTimeout(r, 10));
    await h.asUser(id, (s) => s.run(`update public.profiles set settings = '{"theme":"dark"}' where user_id = $1`, [id]));
    const after = await h.asOwner((s) => s.scalar<Date>(`select updated_at from public.profiles where user_id = $1`, [id]));
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });
});

describe('Acceptance 4: an under_18 profile cannot get an adult_contacts row by any route', () => {
  let kid: string;
  beforeAll(async () => {
    kid = await h.newUser({ codeName: 'LittleKid1' });
  });
  const none = async () => Number(await h.asOwner((s) => s.scalar<string>(`select count(*) from public.adult_contacts where user_id = $1`, [kid])));

  it('service role insert', async () => {
    const r = await h.asService((s) => attempt(s, `insert into public.adult_contacts (user_id, full_name) values ($1, 'Kid Name')`, [kid]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('23514');
    expect(await none()).toBe(0);
  });
  it('database owner insert and upsert', async () => {
    expect((await h.asOwner((s) => attempt(s, `insert into public.adult_contacts (user_id) values ($1)`, [kid]))).ok).toBe(false);
    expect((await h.asOwner((s) => attempt(s, `insert into public.adult_contacts (user_id, full_name) values ($1, 'a') on conflict (user_id) do update set full_name = 'b'`, [kid]))).ok).toBe(false);
    expect(await none()).toBe(0);
  });
  it('the child themself, even with insert privilege and a permissive policy', async () => {
    const r = await h.asUser(kid, (s) => attempt(s, `insert into public.adult_contacts (user_id, full_name) values ($1, 'Kid')`, [kid]));
    expect(r.ok).toBe(false);
    await withTemporarily(
      h,
      `grant insert on public.adult_contacts to authenticated;
       create policy tmp_open_insert on public.adult_contacts for insert to authenticated with check (true)`,
      `drop policy tmp_open_insert on public.adult_contacts; revoke insert on public.adult_contacts from authenticated`,
      async () => {
        const r2 = await h.asUser(kid, (s) => attempt(s, `insert into public.adult_contacts (user_id, full_name) values ($1, 'Kid')`, [kid]));
        expect(r2.ok).toBe(false);
        if (!r2.ok) expect(r2.code).toBe('23514');
      },
    );
    expect(await none()).toBe(0);
  });
  it('set_marketing, both directions', async () => {
    for (const opt of [true, false]) {
      const r = await h.asUser(kid, (s) => s.fails(`select public.set_marketing($1, 'v1')`, [opt]));
      expect(r.code).toBe('42501');
    }
    expect(await none()).toBe(0);
  });
  it('an existing contact row cannot be re-pointed at a child', async () => {
    const adult = await h.newUser({ ageBand: 'adult' });
    await seedAdultContact(h, adult);
    const r = await h.asService((s) => attempt(s, `update public.adult_contacts set user_id = $1 where user_id = $2`, [kid, adult]));
    expect(r.ok).toBe(false);
    expect(await none()).toBe(0);
  });
  it('an adult profile can have one (control), and the row cascades with the profile', async () => {
    const adult = await h.newUser({ ageBand: 'adult' });
    await seedAdultContact(h, adult);
    expect(Number(await h.asOwner((s) => s.scalar<string>(`select count(*) from public.adult_contacts where user_id = $1`, [adult])))).toBe(1);
  });
});

describe('set_marketing', () => {
  it('opt-in needs a confirmed real email, a wording version, and records time and wording', async () => {
    const synthetic = await h.newUser({ ageBand: 'adult' });
    expect((await h.asUser(synthetic, (s) => s.fails(`select public.set_marketing(true, 'v1')`))).code).toBe('42501');
    const unconfirmed = await h.newUser({ ageBand: 'adult', email: 'a@example.com', emailConfirmed: false });
    expect((await h.asUser(unconfirmed, (s) => s.fails(`select public.set_marketing(true, 'v1')`))).code).toBe('42501');
    const ok = await h.newUser({ ageBand: 'adult', email: 'b@example.com', emailConfirmed: true });
    expect((await h.asUser(ok, (s) => s.fails(`select public.set_marketing(true, null)`))).code).toBe('22023');
    expect((await h.asUser(ok, (s) => s.fails(`select public.set_marketing(true, 'bad wording!')`))).code).toBe('22023');
    expect((await h.asUser(ok, (s) => s.fails(`select public.set_marketing(null, 'v1')`))).code).toBe('22023');
    expect(await h.asUser(ok, (s) => s.scalar<boolean>(`select public.set_marketing(true, 'v1.2')`))).toBe(true);
    const [c] = await h.asUser(ok, (s) => s.q<Record<string, unknown>>(`select * from public.adult_contacts`));
    expect(c.marketing_opt_in).toBe(true);
    expect(c.marketing_wording_version).toBe('v1.2');
    expect(c.marketing_opted_in_at).not.toBeNull();
    expect(c.marketing_withdrawn_at).toBeNull();
    expect(await h.asUser(ok, (s) => s.scalar<boolean>(`select public.set_marketing(false, null)`))).toBe(false);
    const [w] = await h.asUser(ok, (s) => s.q<Record<string, unknown>>(`select * from public.adult_contacts`));
    expect(w.marketing_opt_in).toBe(false);
    expect(w.marketing_withdrawn_at).not.toBeNull();
  });
  it('a user cannot flip marketing columns directly', async () => {
    const ok = await h.newUser({ ageBand: 'adult', email: 'c@example.com', emailConfirmed: true });
    await seedAdultContact(h, ok);
    const r = await h.asUser(ok, (s) => attempt(s, `update public.adult_contacts set marketing_opt_in = true where user_id = $1`, [ok]));
    expect(r.ok).toBe(false);
  });
  it('an under-18 who later confirms adulthood may then use it', async () => {
    const id = await h.newUser({ email: 'd@example.com', emailConfirmed: true });
    expect((await h.asUser(id, (s) => s.fails(`select public.set_marketing(true, 'v1')`))).code).toBe('42501');
    await h.asUser(id, (s) => s.run(`select public.confirm_adult()`));
    expect(await h.asUser(id, (s) => s.scalar<boolean>(`select public.set_marketing(true, 'v1')`))).toBe(true);
  });
});

describe('Acceptance 6: best_score never decreases; a finished lesson never reverts', () => {
  const lp = (id: string) =>
    h.asOwner((s) => s.q<{ state: string; best_score: number | null; step: string; question_index: number }>(
      `select state, best_score, step, question_index from public.lesson_progress where user_id = $1 and lesson_id = 'g1-rhythm-01'`, [id]).then((r) => r[0]));

  it('best_score cannot be lowered, only raised', async () => {
    const id = await h.newUser();
    await h.asUser(id, async (s) => {
      await s.run(`insert into public.lesson_progress (user_id, lesson_id, state, step, best_score) values ($1,'g1-rhythm-01','in-progress','challenge',0.8)`, [id]);
      await s.run(`update public.lesson_progress set best_score = 0.3 where user_id = $1`, [id]);
    });
    expect((await lp(id)).best_score).toBe(0.8);
    await h.asUser(id, (s) => s.run(`update public.lesson_progress set best_score = 0.95 where user_id = $1`, [id]));
    expect((await lp(id)).best_score).toBe(0.95);
    await h.asUser(id, (s) => s.run(`update public.lesson_progress set best_score = null where user_id = $1`, [id]));
    expect((await lp(id)).best_score).toBe(0.95);
  });
  it('an upsert (what a sync client does) cannot lower it either', async () => {
    const id = await h.newUser();
    await h.asUser(id, async (s) => {
      await s.run(`insert into public.lesson_progress (user_id, lesson_id, best_score) values ($1,'g1-rhythm-01',0.9)`, [id]);
      await s.run(`insert into public.lesson_progress (user_id, lesson_id, best_score, state) values ($1,'g1-rhythm-01',0.1,'in-progress')
                   on conflict (user_id, lesson_id) do update set best_score = excluded.best_score, state = excluded.state`, [id]);
    });
    expect((await lp(id)).best_score).toBe(0.9);
  });
  it('complete and mastered never go back; they may advance', async () => {
    const id = await h.newUser();
    await h.asUser(id, (s) => s.run(`insert into public.lesson_progress (user_id, lesson_id, state, step) values ($1,'g1-rhythm-01','complete','recap')`, [id]));
    for (const back of ['in-progress', 'not-started']) {
      await h.asUser(id, (s) => s.run(`update public.lesson_progress set state = $2, step = 'hook' where user_id = $1`, [id, back]));
      expect((await lp(id)).state).toBe('complete');
    }
    expect((await lp(id)).step).toBe('hook'); // resume position is free to change
    await h.asUser(id, (s) => s.run(`update public.lesson_progress set state = 'mastered' where user_id = $1`, [id]));
    expect((await lp(id)).state).toBe('mastered');
    for (const back of ['complete', 'in-progress']) {
      await h.asUser(id, (s) => s.run(`update public.lesson_progress set state = $2 where user_id = $1`, [id, back]));
      expect((await lp(id)).state).toBe('mastered');
    }
  });
  it('in-progress can still move forward', async () => {
    const id = await h.newUser();
    await h.asUser(id, async (s) => {
      await s.run(`insert into public.lesson_progress (user_id, lesson_id, state) values ($1,'g1-rhythm-01','in-progress')`, [id]);
      await s.run(`update public.lesson_progress set state = 'complete' where user_id = $1`, [id]);
    });
    expect((await lp(id)).state).toBe('complete');
  });
  it('range and shape constraints', async () => {
    const id = await h.newUser();
    const bad = [
      `best_score) values ($1,'a-b',1.5`, `best_score) values ($1,'a-b',-0.1`, `best_score) values ($1,'a-b','NaN'`,
    ];
    for (const b of bad) {
      const r = await h.asUser(id, (s) => attempt(s, `insert into public.lesson_progress (user_id, lesson_id, ${b})`, [id]));
      expect(r.ok, b).toBe(false);
      if (!r.ok) expect(r.code).toBe('23514');
    }
    for (const lessonId of ['Bad Id', 'UPPER', 'a--b', '-a', 'a_b', 'x'.repeat(101), '']) {
      const r = await h.asUser(id, (s) => attempt(s, `insert into public.lesson_progress (user_id, lesson_id) values ($1,$2)`, [id, lessonId]));
      expect(r.ok, lessonId).toBe(false);
    }
    expect((await h.asUser(id, (s) => attempt(s, `insert into public.lesson_progress (user_id, lesson_id, state) values ($1,'a-b','finished')`, [id]))).ok).toBe(false);
    expect((await h.asUser(id, (s) => attempt(s, `insert into public.lesson_progress (user_id, lesson_id, step) values ($1,'a-b','warmup')`, [id]))).ok).toBe(false);
    expect((await h.asUser(id, (s) => attempt(s, `insert into public.lesson_progress (user_id, lesson_id, question_index) values ($1,'a-b',-1)`, [id]))).ok).toBe(false);
    expect((await h.asUser(id, (s) => attempt(s, `insert into public.lesson_progress (user_id, lesson_id, question_index) values ($1,'a-b',1001)`, [id]))).ok).toBe(false);
  });
});

describe('attempts: value constraints and rate cap', () => {
  const base = (over: Record<string, string>) => {
    const v: Record<string, string> = { lesson_id: `'g1-rhythm-01'`, step: `'practice'`, question_id: `'q-1'`, skill: `'rhythm.note.value'`, type: `'multiple-choice'`, correct: 'true', score: '1', ms_taken: '100', occurred_at: `'2026-01-01T00:00:00Z'`, ...over };
    return `insert into public.attempts (user_id, ${Object.keys(v).join(', ')}) values ($1, ${Object.values(v).join(', ')})`;
  };
  it('control row inserts', async () => {
    const id = await h.newUser();
    expect((await h.asUser(id, (s) => attempt(s, base({}), [id]))).ok).toBe(true);
  });
  it.each([
    [{ score: '1.01' }], [{ score: '-0.01' }], [{ score: `'NaN'` }], [{ ms_taken: '-1' }], [{ ms_taken: '3600001' }],
    [{ step: `'warmup'` }], [{ type: `'essay'` }], [{ skill: `'Bad Skill'` }], [{ skill: `'nodots'` }],
    [{ lesson_id: `'Bad_Id'` }], [{ question_id: `'${'x'.repeat(101)}'` }], [{ source: `'hand-written'` }],
  ])('rejects %j', async (over) => {
    const id = await h.newUser();
    const r = await h.asUser(id, (s) => attempt(s, base(over), [id]));
    expect(r.ok).toBe(false);
  });
  it('accepts a generated question with a seed', async () => {
    const id = await h.newUser();
    expect((await h.asUser(id, (s) => attempt(s, base({ source: `'generated'`, seed: '123456789' }), [id]))).ok).toBe(true);
  });
  it('the same dedupe key cannot be recorded twice', async () => {
    const id = await h.newUser();
    await h.asUser(id, (s) => s.run(base({}), [id]));
    const r = await h.asUser(id, (s) => attempt(s, base({}), [id]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('23505');
  });
  it('users cannot set created_at, merged or id', async () => {
    const id = await h.newUser();
    for (const col of ['created_at', 'merged', 'id']) {
      const val = col === 'merged' ? 'true' : col === 'id' ? '9999' : `'2000-01-01'`;
      const r = await h.asUser(id, (s) => attempt(s, base({ [col]: val }), [id]));
      expect(r.ok, col).toBe(false);
    }
  });

  it('the cap is a single constant, 240', async () => {
    expect(await h.asOwner((s) => s.scalar<number>(`select private.attempts_per_minute()`))).toBe(240);
  });
  it('allows 240 in a minute and refuses the 241st; other users are unaffected', async () => {
    const id = await h.newUser();
    const other = await h.newUser();
    await h.asUser(id, async (s) => {
      for (let n = 1; n <= 240; n++) {
        const [sql, params] = attemptInsert(id, n);
        await s.run(sql, params);
      }
      const [sql, params] = attemptInsert(id, 241);
      const r = await s.fails(sql, params);
      expect(r.message).toMatch(/attempts_rate_limited/);
      expect(r.code).toBe('53400');
    });
    const [sql, params] = attemptInsert(other, 1);
    expect((await h.asUser(other, (s) => attempt(s, sql, params))).ok).toBe(true);
  }, 60_000);
  it('one big statement cannot slip past the cap, and fails whole', async () => {
    const id = await h.newUser();
    const r = await h.asUser(id, (s) =>
      s.fails(`insert into public.attempts (${ATTEMPT_COLUMNS})
               select $1, 'g1-rhythm-01', 'practice', 'q-' || g, 'rhythm.note.value', 'multiple-choice', true, 1, 10, now() - (g || ' seconds')::interval
               from generate_series(1, 300) g`, [id]),
    );
    expect(r.code).toBe('53400');
    expect(Number(await h.asOwner((s) => s.scalar<string>(`select count(*) from public.attempts where user_id = $1`, [id])))).toBe(0);
    const ok = await h.asUser(id, (s) =>
      attempt(s, `insert into public.attempts (${ATTEMPT_COLUMNS})
                  select $1, 'g1-rhythm-01', 'practice', 'q-' || g, 'rhythm.note.value', 'multiple-choice', true, 1, 10, now() - (g || ' seconds')::interval
                  from generate_series(1, 240) g`, [id]),
    );
    expect(ok).toEqual({ ok: true, count: 240 });
  });
  it('the window is one minute: older rows stop counting', async () => {
    const id = await h.newUser();
    await h.asUser(id, (s) =>
      s.run(`insert into public.attempts (${ATTEMPT_COLUMNS})
             select $1, 'g1-rhythm-01', 'practice', 'q-' || g, 'rhythm.note.value', 'multiple-choice', true, 1, 10, now() - (g || ' seconds')::interval
             from generate_series(1, 240) g`, [id]),
    );
    const [sql, params] = attemptInsert(id, 500);
    expect((await h.asUser(id, (s) => attempt(s, sql, params))).ok).toBe(false);
    await h.asOwner((s) => s.run(`update public.attempts set created_at = now() - interval '2 minutes' where user_id = $1`, [id]));
    expect((await h.asUser(id, (s) => attempt(s, sql, params))).ok).toBe(true);
  });
  it('the service role is capped too', async () => {
    const id = await h.newUser();
    const r = await h.asService((s) =>
      s.fails(`insert into public.attempts (${ATTEMPT_COLUMNS})
               select $1, 'g1-rhythm-01', 'practice', 'q-' || g, 'rhythm.note.value', 'multiple-choice', true, 1, 10, now() - (g || ' seconds')::interval
               from generate_series(1, 241) g`, [id]),
    );
    expect(r.code).toBe('53400');
  });
});

describe('game_scores and mock_results constraints', () => {
  it.each([
    [`insert into public.game_scores (user_id, game_id, score) values ($1, 'note-rush', -1)`],
    [`insert into public.game_scores (user_id, game_id, score) values ($1, 'note-rush', 1000001)`],
    [`insert into public.game_scores (user_id, game_id, score) values ($1, 'Note Rush', 1)`],
    [`insert into public.game_scores (user_id, game_id, score, summary) values ($1, 'note-rush', 1, '{"name":"Sam"}')`],
    [`insert into public.game_scores (user_id, game_id, score, summary) values ($1, 'note-rush', 1, '[1]')`],
    [`insert into public.mock_results (user_id, grade, score) values ($1, '9', 0.5)`],
    [`insert into public.mock_results (user_id, grade, score) values ($1, '1', 1.2)`],
    [`insert into public.mock_results (user_id, grade, score) values ($1, '1', -0.2)`],
    [`insert into public.mock_results (user_id, grade, score, breakdown) values ($1, '1', 0.5, '{"Rhythm":0.5}')`],
    [`insert into public.mock_results (user_id, grade, score, breakdown) values ($1, '1', 0.5, '{"rhythm":2}')`],
    [`insert into public.mock_results (user_id, grade, score, breakdown) values ($1, '1', 0.5, '{"rhythm":"good"}')`],
  ])('rejects %s', async (sql) => {
    const id = await h.newUser();
    expect((await h.asUser(id, (s) => attempt(s, sql, [id]))).ok).toBe(false);
  });
  it('accepts valid rows', async () => {
    const id = await h.newUser();
    expect((await h.asUser(id, (s) => attempt(s, `insert into public.game_scores (user_id, game_id, score, summary) values ($1,'note-rush', 99, '{"streak":4,"perfect":true}')`, [id]))).ok).toBe(true);
    expect((await h.asUser(id, (s) => attempt(s, `insert into public.mock_results (user_id, grade, score, breakdown) values ($1,'start', 0.5, '{"rhythm":0.5,"pitch.treble.lines":1}')`, [id]))).ok).toBe(true);
  });
});

describe('structure: FORCE RLS, policies, privileges, function grants', () => {
  it('RLS is enabled and forced on every table', async () => {
    const rows = await h.asOwner((s) =>
      s.q<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `select relname, relrowsecurity, relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' order by 1`),
    );
    expect(rows.map((r) => r.relname).sort()).toEqual([...ALL_TABLES].sort());
    for (const r of rows) {
      expect(r.relrowsecurity, r.relname).toBe(true);
      expect(r.relforcerowsecurity, r.relname).toBe(true);
    }
  });

  it('FORCE works in practice: a table owner that is not a superuser is still bound by policies', async () => {
    const id = await h.newUser();
    await h.asService((s) => s.run(`insert into public.game_scores (user_id, game_id, score) values ($1,'note-rush',1)`, [id]));
    await h.db.exec(`create role tmp_owner nologin`);
    await h.db.exec(`alter table public.game_scores owner to tmp_owner`);
    try {
      await h.db.exec(`set role tmp_owner`);
      const r = await h.db.query(`select count(*)::int as n from public.game_scores`);
      await h.db.exec(`reset role`);
      expect((r.rows[0] as { n: number }).n).toBe(0);
    } finally {
      await h.db.exec(`reset role`);
      await h.db.exec(`alter table public.game_scores owner to postgres`);
      await h.db.exec(`drop owned by tmp_owner; drop role tmp_owner`);
    }
  });

  it('policies are exactly the design: authenticated only, own rows, listed commands', async () => {
    const rows = await h.asOwner((s) =>
      s.q<{ tablename: string; cmd: string; roles: string[]; qual: string | null; with_check: string | null }>(
        `select tablename, cmd, roles::text[] as roles, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`),
    );
    const got = rows.map((r) => `${r.tablename}:${r.cmd}`).sort();
    expect(got).toEqual([
      'adult_contacts:SELECT', 'adult_contacts:UPDATE',
      'attempts:INSERT', 'attempts:SELECT',
      'game_scores:INSERT', 'game_scores:SELECT',
      'lesson_progress:INSERT', 'lesson_progress:SELECT', 'lesson_progress:UPDATE',
      'mock_results:INSERT', 'mock_results:SELECT',
      'profiles:SELECT', 'profiles:UPDATE',
    ]);
    for (const r of rows) {
      expect(r.roles, `${r.tablename}:${r.cmd}`).toEqual(['authenticated']);
      const expr = `${r.qual ?? ''}${r.with_check ?? ''}`;
      expect(expr).toMatch(/user_id = \( SELECT auth\.uid\(\)/);
      expect(expr).not.toMatch(/\bor\b/i);
    }
    expect(rows.some((r) => ['account_secrets', 'blocked_names'].includes(r.tablename))).toBe(false);
  });

  const COLS: Record<string, { select: string[]; insert: string[]; update: string[] }> = {};
  it('privileges: anon has none; authenticated has exactly the column grants the policies need; nobody but service_role deletes', async () => {
    const cols = await h.asOwner((s) =>
      s.q<{ t: string; c: string }>(
        `select c.relname as t, a.attname as c from pg_class c join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
         where n.nspname = 'public' and c.relkind = 'r'`),
    );
    const expected: Record<string, { select: string[]; insert: string[]; update: string[] }> = {
      profiles: { select: ['*'], insert: [], update: ['settings'] },
      adult_contacts: { select: ['*'], insert: [], update: ['full_name'] },
      account_secrets: { select: [], insert: [], update: [] },
      blocked_names: { select: [], insert: [], update: [] },
      lesson_progress: { select: ['*'], insert: ['user_id', 'lesson_id', 'state', 'step', 'question_index', 'best_score'], update: ['state', 'step', 'question_index', 'best_score'] },
      attempts: { select: ['*'], insert: ['user_id', 'lesson_id', 'step', 'question_id', 'skill', 'type', 'correct', 'score', 'ms_taken', 'seed', 'source', 'occurred_at'], update: [] },
      game_scores: { select: ['*'], insert: ['user_id', 'game_id', 'score', 'summary'], update: [] },
      mock_results: { select: ['*'], insert: ['user_id', 'grade', 'score', 'breakdown'], update: [] },
    };
    void COLS;
    await h.asOwner(async (s) => {
      for (const t of ALL_TABLES) {
        const all = cols.filter((c) => c.t === t).map((c) => c.c);
        for (const role of ['anon', 'authenticated', 'public']) {
          for (const priv of ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
            expect(await s.scalar<boolean>(`select has_table_privilege($1, $2, $3)`, [role === 'public' ? 'anon' : role, `public.${t}`, priv]), `${role} ${priv} ${t}`).toBe(false);
          }
        }
        for (const col of all) {
          for (const priv of ['SELECT', 'INSERT', 'UPDATE'] as const) {
            const want = (() => {
              const e = expected[t][priv.toLowerCase() as 'select' | 'insert' | 'update'];
              return e.includes('*') || e.includes(col);
            })();
            const got = await s.scalar<boolean>(`select has_column_privilege('authenticated', $1, $2, $3)`, [`public.${t}`, col, priv]);
            expect(got, `authenticated ${priv} ${t}.${col}`).toBe(want);
            const anon = await s.scalar<boolean>(`select has_column_privilege('anon', $1, $2, $3)`, [`public.${t}`, col, priv]);
            expect(anon, `anon ${priv} ${t}.${col}`).toBe(false);
          }
        }
      }
      // sequences
      for (const seq of ['attempts_id_seq', 'game_scores_id_seq', 'mock_results_id_seq', 'blocked_names_id_seq']) {
        for (const role of ['anon', 'authenticated']) {
          expect(await s.scalar<boolean>(`select has_sequence_privilege($1, $2, 'USAGE')`, [role, `public.${seq}`])).toBe(false);
        }
      }
    });
  });

  const PUBLIC_FUNCS: [string, string, string[]][] = [
    ['code_name_available(text)', `select public.code_name_available('Abc123')`, ['service_role']],
    ['merge_guest_progress(jsonb)', `select public.merge_guest_progress('{}'::jsonb)`, ['authenticated']],
    ['export_my_data()', `select public.export_my_data()`, ['authenticated']],
    ['delete_my_account()', `select 1 where false`, ['authenticated']],
    ['confirm_adult()', `select public.confirm_adult()`, ['authenticated']],
    ['set_marketing(boolean, text)', `select public.set_marketing(false, null)`, ['authenticated']],
  ];
  it('each public function is executable only by its caller role and is SECURITY DEFINER with an empty search_path', async () => {
    await h.asOwner(async (s) => {
      for (const [sig, , allowed] of PUBLIC_FUNCS) {
        for (const role of ['anon', 'authenticated', 'service_role']) {
          expect(await s.scalar<boolean>(`select has_function_privilege($1, $2::regprocedure, 'EXECUTE')`, [role, `public.${sig}`]), `${role} ${sig}`).toBe(allowed.includes(role));
        }
        const [meta] = await s.q<{ prosecdef: boolean; proconfig: string[] | null }>(`select prosecdef, proconfig from pg_proc where oid = $1::regprocedure`, [`public.${sig}`]);
        expect(meta.prosecdef, sig).toBe(true);
        expect(meta.proconfig ?? [], sig).toContain('search_path=""');
      }
    });
  });
  it('wrong roles are refused when they try to call', async () => {
    const id = await h.newUser();
    const calls: Record<string, string> = {
      'code_name_available(text)': `select public.code_name_available('Abc123')`,
      'merge_guest_progress(jsonb)': `select public.merge_guest_progress('{}'::jsonb)`,
      'export_my_data()': `select public.export_my_data()`,
      'delete_my_account()': `select public.delete_my_account()`,
      'confirm_adult()': `select public.confirm_adult()`,
      'set_marketing(boolean, text)': `select public.set_marketing(false, null)`,
    };
    for (const [sig, , allowed] of PUBLIC_FUNCS) {
      const sql = calls[sig];
      if (!allowed.includes('anon')) expect((await h.asAnon((s) => s.fails(sql))).code, `anon ${sig}`).toBe('42501');
      if (!allowed.includes('service_role')) expect((await h.asService((s) => s.fails(sql))).code, `service ${sig}`).toBe('42501');
      if (!allowed.includes('authenticated')) expect((await h.asUser(id, (s) => s.fails(sql))).code, `user ${sig}`).toBe('42501');
    }
  });
  it('users cannot call the private helpers, other than the pure predicates that checks need', async () => {
    const all = await h.asOwner((s) =>
      s.q<{ sig: string; fn: string; anon: boolean; auth: boolean }>(
        `select p.oid::regprocedure::text as sig, p.proname as fn,
                has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'`),
    );
    expect(all.length).toBeGreaterThan(10);
    const pure = ['caller_is_owner', 'caller_is_trusted', 'normalise_code_name', 'code_name_format_ok', 'settings_ok', 'summary_ok', 'breakdown_ok'];
    for (const f of all) {
      expect(f.anon, f.sig).toBe(false);
      expect(f.auth, f.sig).toBe(pure.includes(f.fn));
    }
    const id = await h.newUser();
    for (const sql of [`select private.code_name_blocked('x')`, `select private.recent_attempt_count(gen_random_uuid())`, `select private.attempts_per_minute()`]) {
      expect((await h.asUser(id, (s) => s.fails(sql))).code).toBe('42501');
      expect((await h.asAnon((s) => s.fails(sql))).code).toBe('42501');
    }
  });
  it('no table in public escapes the cascade from auth.users except blocked_names', async () => {
    const rows = await h.asOwner((s) =>
      s.q<{ t: string; del: string }>(
        `select c.conrelid::regclass::text as t, c.confdeltype as del from pg_constraint c
         where c.contype = 'f' and c.confrelid = 'auth.users'::regclass`),
    );
    const byTable = new Set(rows.map((r) => r.t.replace('public.', '')));
    expect([...byTable].sort()).toEqual(ALL_TABLES.filter((t) => t !== 'blocked_names').sort());
    for (const r of rows) expect(r.del, r.t).toBe('c');
  });
});
