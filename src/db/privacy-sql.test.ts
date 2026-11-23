// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- these tests read untyped JSON and wrap untyped Supabase clients */
/**
 * P1-16: what the export and delete routes assume about export_my_data() and delete_my_account(), checked on
 * the real SQL in PGlite as the signed-in user (role `authenticated`, auth.uid() from the token).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXPORT_SECTIONS, buildExportFile, exportFileText } from '@/accounts/export-file';
import { ALL_TABLES, USER_TABLES, countRows, seedAdultContact, seedUserData } from './fixtures';
import { createHarness, type Harness } from './test-harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness({ seed: true, throttle: true });
}, 60_000);
afterAll(async () => {
  await h.close();
});

const exportAs = (uid: string) => h.asUser(uid, (s) => s.scalar<Record<string, unknown>>(`select public.export_my_data()`));
const NOW = new Date('2026-11-23T10:00:00Z');

describe('export_my_data() as the route uses it', () => {
  it('returns only sections the route knows. A new table makes this fail, so the file and its README get updated', async () => {
    const u = await h.newUser({ codeName: 'SqlKeys', ageBand: 'adult', email: 'keys@example.com' });
    await seedUserData(h, u);
    await seedAdultContact(h, u);
    const out = await exportAs(u);
    expect(Object.keys(out).sort()).toEqual(['exported_at', ...EXPORT_SECTIONS].sort());
  });

  it('for a code-name learner: no address, no hash; the cleaned file keeps their rows only', async () => {
    const a = await h.newUser({ codeName: 'SqlCleanA' });
    const b = await h.newUser({ codeName: 'SqlCleanB' });
    await seedUserData(h, a);
    await seedUserData(h, b);
    const raw = await exportAs(a);
    expect(JSON.stringify(raw)).not.toMatch(/accounts\.invalid|\$2[aby]\$/);
    const file = exportFileText(raw, NOW);
    expect(file).not.toMatch(/accounts\.invalid|\$2[aby]\$|failed_attempts|locked_until/);
    const parsed = JSON.parse(file) as Record<string, any>;
    expect(parsed.profile.code_name).toBe('SqlCleanA');
    expect(file).not.toContain(b);
    expect(file).not.toContain('SqlCleanB');
    expect(parsed.lesson_progress).toHaveLength(1);
    expect(parsed.attempts).toHaveLength(1);
    expect(parsed.game_scores).toHaveLength(1);
    expect(parsed.mock_results).toHaveLength(1);
    expect(parsed.account_secrets).toMatchObject({ has_recovery_code: true });
  });

  it('keeps an adult\'s real email and name, which are theirs', async () => {
    const u = await h.newUser({ codeName: 'SqlAdult', ageBand: 'adult', email: 'adult@example.com' });
    await seedAdultContact(h, u, 'Alex Example');
    const parsed = buildExportFile(await exportAs(u), NOW) as Record<string, any>;
    expect(parsed.account.email).toBe('adult@example.com');
    expect(parsed.adult_contact.full_name).toBe('Alex Example');
  });

  it('is not callable without a signed-in user', async () => {
    expect((await h.asAnon((s) => s.fails(`select public.export_my_data()`))).code).toBe('42501');
  });
});

describe('delete_my_account() as the route uses it', () => {
  it('removes the login and every table in one call, and a profile lookup by the old id finds nothing', async () => {
    const u = await h.newUser({ codeName: 'SqlGone', ageBand: 'adult', email: 'gone@example.com' });
    const other = await h.newUser({ codeName: 'SqlStays' });
    await seedUserData(h, u);
    await seedAdultContact(h, u);
    await seedUserData(h, other);
    const kept = Object.fromEntries(await Promise.all(USER_TABLES.map(async (t) => [t, await countRows(h, t, other)] as const)));

    await h.asUser(u, (s) => s.run(`select public.delete_my_account()`));

    for (const t of USER_TABLES) expect(await countRows(h, t, u), t).toBe(0);
    expect(await h.asService((s) => s.q(`select 1 from public.profiles where user_id = $1`, [u]))).toEqual([]);
    expect(Number(await h.asOwner((s) => s.scalar<string>(`select count(*) from auth.users where id = $1`, [u])))).toBe(0);
    for (const t of USER_TABLES) expect(await countRows(h, t, other), `${t} (other)`).toBe(kept[t]);
    // Nothing in public holds the id any more (a table added without a cascade would show up here).
    await h.asOwner(async (s) => {
      for (const t of ALL_TABLES.filter((x) => x !== 'blocked_names')) {
        expect(Number(await s.scalar<string>(`select count(*) from public.${t} where user_id = $1`, [u])), t).toBe(0);
      }
    });
    expect(await h.asService((s) => s.scalar<boolean>(`select public.code_name_available('SqlGone')`))).toBe(true);
  });

  it('can be repeated: the second call changes nothing (the route relies on this when it retries)', async () => {
    const u = await h.newUser({ codeName: 'SqlTwice' });
    await h.asUser(u, (s) => s.run(`select public.delete_my_account()`));
    await h.asUser(u, (s) => s.run(`select public.delete_my_account()`));
  });

  it('does NOT clear rate-limit rows, so the route must: they are keyed by name and by user id with no foreign key', async () => {
    const u = await h.newUser({ codeName: 'SqlThrottle' });
    const keys = [`signin:name:sqlthrottle`, `recover:name:sqlthrottle`, `export:user:${u}`, `delete:user:${u}`];
    for (const k of keys) await h.asService((s) => s.run(`select public.auth_throttle_fail($1, 5)`, [k]));
    await h.asUser(u, (s) => s.run(`select public.delete_my_account()`));
    const left = () => h.asOwner((s) => s.scalar<string>(`select count(*) from public.auth_throttle where key = any($1)`, [keys])).then(Number);
    expect(await left()).toBe(4);
    for (const k of keys) await h.asService((s) => s.run(`select public.auth_throttle_clear($1)`, [k]));
    expect(await left()).toBe(0);
  });

  it('is not callable without a signed-in user', async () => {
    expect((await h.asAnon((s) => s.fails(`select public.delete_my_account()`))).code).toBe('42501');
  });
});
