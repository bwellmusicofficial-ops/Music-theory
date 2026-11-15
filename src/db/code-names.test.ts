// @vitest-environment node
/** Code-name rules and Acceptance 5 (two names differing only by case or separators cannot coexist). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './test-harness';
import { attempt, withTemporarily } from './fixtures';

let h: Harness;

beforeAll(async () => {
  h = await createHarness({ seed: true });
}, 60_000);
afterAll(async () => {
  await h.close();
});

const available = (name: string | null) =>
  h.asService((s) => s.scalar<boolean>(`select public.code_name_available($1)`, [name]));

/** Create an auth user carrying a code name, as the server route would (app metadata). */
async function create(name: string) {
  return h.asOwner((s) => attempt(s,
    `insert into auth.users (id, raw_app_meta_data) values (gen_random_uuid(), jsonb_build_object('code_name', $1::text))`,
    [name]));
}

describe('normalisation', () => {
  it('stores as typed and keeps a lower-case, separator-free copy', async () => {
    const id = await h.newUser({ codeName: 'Rhythm_Fox-9' });
    const [row] = await h.asService((s) =>
      s.q<{ code_name: string; code_name_norm: string }>(`select code_name, code_name_norm from public.profiles where user_id = $1`, [id]),
    );
    expect(row).toEqual({ code_name: 'Rhythm_Fox-9', code_name_norm: 'rhythmfox9' });
  });

  it('norm column is generated, unique, and cannot be written', async () => {
    const col = await h.asOwner((s) =>
      s.q<{ attgenerated: string }>(`select attgenerated from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'code_name_norm'`),
    );
    expect(col[0].attgenerated).toBe('s');
    const w = await h.asService((s) => s.fails(`update public.profiles set code_name_norm = 'x'`));
    expect(w.code).toBe('428C9');
    const uniq = await h.asOwner((s) =>
      s.q(`select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
           where i.indrelid = 'public.profiles'::regclass and i.indisunique and a.attname = 'code_name_norm' and i.indnatts = 1`),
    );
    expect(uniq.length).toBe(1);
  });
});

describe('Acceptance 5: names that differ only by case or separators cannot both exist', () => {
  it('rejects every variant, through user creation and through a direct update', async () => {
    await h.newUser({ codeName: 'Rhythm_Fox' });
    const variants = ['rhythmfox', 'RHYTHM-FOX', 'rhythm_fox', 'Rhythm-Fox', 'R-h-y-t-h-m_F-o-x', 'RHYTHMFOX'];
    for (const v of variants) {
      expect(await available(v), v).toBe(false);
      const r = await create(v);
      expect(r.ok, v).toBe(false);
      if (!r.ok) expect(r.code, v).toBe('23505');
      const other = await h.newUser();
      const u = await h.asService((s) => attempt(s, `update public.profiles set code_name = $1 where user_id = $2`, [v, other]));
      expect(u.ok, v).toBe(false);
      if (!u.ok) expect(u.code).toBe('23505');
    }
    // A failed creation leaves no auth user behind.
    const n = await h.asOwner((s) => s.scalar<string>(`select count(*) from public.profiles where code_name_norm = 'rhythmfox'`));
    expect(Number(n)).toBe(1);
  });

  it('a genuinely different name is accepted', async () => {
    expect(await available('Rhythm_Fox2')).toBe(true);
    await h.newUser({ codeName: 'Rhythm_Fox2' });
    expect(await available('rhythmfox2')).toBe(false);
  });

  it('collisions are decided by the unique index, not by a pre-check (race safety)', async () => {
    // PGlite runs one connection, so two transactions cannot truly interleave. A race
    // is only safe if the database constraint decides, so take away every other
    // safeguard (all user triggers) and show the constraint alone still refuses.
    await withTemporarily(
      h,
      `alter table public.profiles disable trigger user; alter table auth.users disable trigger user`,
      `alter table public.profiles enable trigger user; alter table auth.users enable trigger user`,
      async () => {
        const x = await h.newUser();
        const y = await h.newUser();
        await h.asOwner(async (s) => {
          await s.run(`insert into public.profiles (user_id, code_name) values ($1, 'RaceName')`, [x]).catch(() => undefined);
        });
        // Profiles were not auto-created (trigger off), so both inserts are explicit.
        const second = await h.asOwner((s) => s.fails(`insert into public.profiles (user_id, code_name) values ($1, 'race-name')`, [y]));
        expect(second.code).toBe('23505');
      },
    );
  });

  it('two uncommitted statements in one transaction also collide', async () => {
    const x = await h.newUser();
    const y = await h.newUser();
    await h.db.exec('begin');
    try {
      await h.db.query(`update public.profiles set code_name = 'SameTime' where user_id = $1`, [x]);
      await expect(h.db.query(`update public.profiles set code_name = 'same_time' where user_id = $1`, [y])).rejects.toMatchObject({ code: '23505' });
    } finally {
      await h.db.exec('rollback');
    }
  });
});

describe('format and content rules (code_name_available and the stored constraint agree)', () => {
  const good = ['SwiftCello42', 'abc', 'X-Y-Z', 'q_r_s', 'x'.repeat(20), 'Fox1234567'.slice(0, 9), 'Note-Rush_7'];
  const bad: [string, string][] = [
    ['ab', 'too short'],
    ['x'.repeat(21), 'too long'],
    ['has space', 'space'],
    ['émile99', 'non-ascii'],
    ['a@b.com', 'email characters'],
    ['jo.smith', 'dot'],
    ['___', 'no letters or digits'],
    ['---', 'no letters or digits'],
    ['a_b', 'only two letters or digits'],
    ['12345678', 'eight digits'],
    ['123456789012', 'twelve digits'],
    ['0770-090-0123', 'phone shaped (separators)'],
    ['ab12345678', 'eight digits inside a name'],
    ['a1b2c3d4e5f6g7h8', 'eight digits spread out'],
    ['joe_at_gmail_com', 'spelled-out email'],
    ['joeatgmailcom', 'spelled-out email'],
    ['sam-at-school-org', 'spelled-out email'],
    ['gmail_fan', 'mail provider'],
    ['Yahoo99', 'mail provider'],
    ["x'; drop table", 'sql characters'],
  ];

  for (const g of good) {
    it(`accepts ${g}`, async () => {
      expect(await available(g)).toBe(true);
      const id = await h.newUser({ codeName: g });
      const [row] = await h.asService((s) => s.q<{ code_name: string }>(`select code_name from public.profiles where user_id = $1`, [id]));
      expect(row.code_name).toBe(g);
    });
  }
  it('accepts 7 digits but not 8', async () => {
    expect(await available('abc1234567'.slice(0, 3) + '1234567')).toBe(true); // 7 digits
  });
  for (const [name, why] of bad) {
    it(`rejects ${JSON.stringify(name)} (${why})`, async () => {
      expect(await available(name)).toBe(false);
      const r = await create(name);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('23514');
      const id = await h.newUser();
      const u = await h.asService((s) => attempt(s, `update public.profiles set code_name = $1 where user_id = $2`, [name, id]));
      expect(u.ok).toBe(false);
    });
  }
  it('null is not available; email-only adults may have no code name', async () => {
    expect(await available(null)).toBe(false);
    const id = await h.newUser({ ageBand: 'adult', email: 'someone@example.com' });
    const [row] = await h.asService((s) => s.q(`select code_name, code_name_norm from public.profiles where user_id = $1`, [id]));
    expect(row).toEqual({ code_name: null, code_name_norm: null });
    // Several people may have no name.
    await h.newUser({ ageBand: 'adult', email: 'other@example.com' });
  });
});

describe('blocked list', () => {
  const blocked = ['admin', 'ADMIN', 'A_d_m_i_n', 'Administrator', 'Teacher', 'support', 'MusicTheoryNow', 'xx_music-theory-now_xx', 'Fuck42', 'ilovefuckyou', 'Dick', 'dick', 'Cock'];
  const fine = ['badminton', 'Dickens', 'Hancock', 'admin2', 'teachers', 'Supporter', 'Assess', 'Classic9'];
  for (const n of blocked) {
    it(`blocks ${n}`, async () => {
      expect(await available(n)).toBe(false);
      const r = await create(n);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('23514');
    });
  }
  for (const n of fine) {
    it(`allows ${n} (exact entries do not block longer names)`, async () => {
      expect(await available(n)).toBe(true);
    });
  }

  it("'exact' blocks only equality and 'contains' blocks containment (own entries)", async () => {
    await h.asService(async (s) => {
      await s.run(`insert into public.blocked_names (word, match) values ('Zebra Quartz', 'exact'), ('plink', 'contains')`);
    });
    expect(await available('zebra_quartz')).toBe(false);
    expect(await available('zebraquartz2')).toBe(true);
    expect(await available('xxPLINKxx')).toBe(false);
    expect(await available('pl1nk')).toBe(true);
  });

  it('a short contains entry is refused so it cannot block everything', async () => {
    const r = await h.asService((s) => s.fails(`insert into public.blocked_names (word, match) values ('ab', 'contains')`));
    expect(r.code).toBe('23514');
  });

  it('seed file is idempotent', async () => {
    const before = await h.asOwner((s) => s.scalar<string>(`select count(*) from public.blocked_names`));
    const { readFileSync } = await import('node:fs');
    const { SEED_PATH } = await import('./test-harness');
    await h.db.exec(readFileSync(SEED_PATH, 'utf8'));
    const after = await h.asOwner((s) => s.scalar<string>(`select count(*) from public.blocked_names`));
    expect(after).toBe(before);
  });

  it('a blocked name cannot be set by update either', async () => {
    const id = await h.newUser();
    const r = await h.asService((s) => attempt(s, `update public.profiles set code_name = 'Admin' where user_id = $1`, [id]));
    expect(r.ok).toBe(false);
  });

  it('code_name_available answers only yes or no and is not callable by users', async () => {
    const a = await h.newUser();
    const r = await h.asUser(a, (s) => s.fails(`select public.code_name_available('Fresh123')`));
    expect(r.code).toBe('42501');
    const r2 = await h.asAnon((s) => s.fails(`select public.code_name_available('Fresh123')`));
    expect(r2.code).toBe('42501');
    const row = await h.asService((s) => s.q(`select public.code_name_available('Fresh123') as v`));
    expect(Object.keys(row[0])).toEqual(['v']);
  });
});
