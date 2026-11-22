// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = Symbol.for('mtn.accounts.backend');
const NAMES = ['ACCOUNTS_FAKE_BACKEND', 'NEXT_PUBLIC_ENABLE_DEV_ROUTES', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const n of NAMES) {
    saved[n] = process.env[n];
    delete process.env[n];
  }
  delete (globalThis as Record<symbol, unknown>)[KEY];
  vi.resetModules();
});
afterEach(() => {
  for (const n of NAMES) {
    if (saved[n] === undefined) delete process.env[n];
    else process.env[n] = saved[n];
  }
  delete (globalThis as Record<symbol, unknown>)[KEY];
});

describe('getBackend', () => {
  it('refuses the in-memory backend unless the test harness switch is on (never in a production build)', async () => {
    process.env.ACCOUNTS_FAKE_BACKEND = '1';
    const { getBackend } = await import('./index');
    expect(() => getBackend()).toThrow(/only allowed together with NEXT_PUBLIC_ENABLE_DEV_ROUTES=1/);
    process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES = '0'; // what a normal build bakes in
    expect(() => getBackend()).toThrow(/only allowed/);
  });

  it('gives the in-memory backend under the harness switch, and the same instance each time', async () => {
    process.env.ACCOUNTS_FAKE_BACKEND = '1';
    process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES = '1';
    const { getBackend } = await import('./index');
    const { MemoryAccountBackend } = await import('./memory');
    const a = getBackend();
    expect(a).toBeInstanceOf(MemoryAccountBackend);
    expect(getBackend()).toBe(a);
  });

  it('is shared even when the module is loaded twice (routes may be bundled apart)', async () => {
    process.env.ACCOUNTS_FAKE_BACKEND = '1';
    process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES = '1';
    const first = (await import('./index')).getBackend();
    vi.resetModules();
    expect((await import('./index')).getBackend()).toBe(first);
  });

  it('says which setting is missing when Supabase is not configured, without a secret in the message', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    const { getBackend } = await import('./index');
    expect(() => getBackend()).toThrow(/NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_SECRET_KEY is missing/);
  });

  it('builds the Supabase backend from the three settings (no network at construction)', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
    const { getBackend } = await import('./index');
    const { SupabaseAccountBackend } = await import('./supabase');
    expect(getBackend()).toBeInstanceOf(SupabaseAccountBackend);
  });

  it('session cookies are httpOnly and lax', async () => {
    const { sessionCookieOptions } = await import('./index');
    expect(sessionCookieOptions()).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });
});
