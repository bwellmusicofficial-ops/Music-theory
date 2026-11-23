import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, PROFILE_METADATA_MIGRATION_PATH, type Harness } from './test-harness';

// Real Supabase Auth inserts the user, then writes app_metadata in a later UPDATE (found 23 Nov 2026).
const insertThenMeta = async (h: Harness, meta: Record<string, string>) => {
  const id = crypto.randomUUID();
  await h.asOwner((s) => s.run(`insert into auth.users (id, raw_app_meta_data) values ($1, '{"provider":"email"}'::jsonb)`, [id]));
  await h.asOwner((s) => s.run(`update auth.users set raw_app_meta_data = raw_app_meta_data || $2::jsonb where id = $1`, [id, JSON.stringify(meta)]));
  return id;
};
const profile = (h: Harness, id: string) =>
  h.asOwner((s) => s.q<{ code_name: string | null; age_band: string }>('select code_name, age_band from public.profiles where user_id = $1', [id])).then((r) => r[0]);

describe('without 0004 (the bug)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness({ seed: true, profileMetadata: false });
  }, 60_000);
  afterAll(async () => h?.db.close());

  it('leaves the profile with no code name and the default age band, then 0004 repairs it', async () => {
    const id = await insertThenMeta(h, { code_name: 'LateName7', age_band: 'adult' });
    expect(await profile(h, id)).toEqual({ code_name: null, age_band: 'under_18' });
    const sql = readFileSync(PROFILE_METADATA_MIGRATION_PATH, 'utf8');
    await h.db.exec(sql);
    await h.db.exec(sql); // safe to run twice
    expect(await profile(h, id)).toEqual({ code_name: 'LateName7', age_band: 'adult' });
  });
});

describe('with 0004', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness({ seed: true });
  }, 60_000);
  afterAll(async () => h?.db.close());

  it('fills the code name and age band when the metadata arrives after the insert', async () => {
    expect(await profile(h, await insertThenMeta(h, { code_name: 'Under18Name', age_band: 'under_18' }))).toEqual({ code_name: 'Under18Name', age_band: 'under_18' });
    expect(await profile(h, await insertThenMeta(h, { code_name: 'AdultName', age_band: 'adult' }))).toEqual({ code_name: 'AdultName', age_band: 'adult' });
  });

  it('still refuses a taken name when the metadata arrives', async () => {
    await insertThenMeta(h, { code_name: 'TakenOnce', age_band: 'under_18' });
    await expect(insertThenMeta(h, { code_name: 'takenonce', age_band: 'under_18' })).rejects.toThrow();
  });

  it('does not change a profile that already has a code name', async () => {
    const id = await insertThenMeta(h, { code_name: 'FirstName1', age_band: 'under_18' });
    await h.asOwner((s) => s.run(`update auth.users set raw_app_meta_data = raw_app_meta_data || '{"code_name":"Other2","age_band":"adult"}'::jsonb where id = $1`, [id]));
    expect(await profile(h, id)).toEqual({ code_name: 'FirstName1', age_band: 'under_18' });
  });
});
