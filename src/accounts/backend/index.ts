import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { MemoryAccountBackend } from './memory';
import { SupabaseAccountBackend } from './supabase';
import type { AccountBackend, CookieJar } from './types';

const KEY = Symbol.for('mtn.accounts.backend');
type Holder = { [KEY]?: AccountBackend };

/** Cookie options for the session. httpOnly: only our server routes ever read the session. */
export function sessionCookieOptions(): Record<string, unknown> {
  return { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' };
}

function createSupabaseBackend(): AccountBackend {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishable || !secret) {
    throw new Error('Accounts are switched on but NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_SECRET_KEY is missing.');
  }
  const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  return new SupabaseAccountBackend({
    admin,
    sessionClient: (jar: CookieJar) =>
      createServerClient(url, publishable, {
        cookieOptions: sessionCookieOptions(),
        cookies: {
          getAll: () => jar.getAll(),
          setAll: (list) =>
            jar.setAll(list.map((c) => ({ name: c.name, value: c.value, options: { ...c.options, ...sessionCookieOptions() } }))),
        },
      }),
  });
}

/**
 * The backend for this process. The in-memory one is for tests and the end-to-end run
 * only, and is refused unless the dev harness switch is on (it is '0' in any normal build).
 */
export function getBackend(): AccountBackend {
  const holder = globalThis as Holder;
  if (holder[KEY]) return holder[KEY];
  let backend: AccountBackend;
  if (process.env.ACCOUNTS_FAKE_BACKEND === '1') {
    if (process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES !== '1') {
      throw new Error('ACCOUNTS_FAKE_BACKEND=1 is only allowed together with NEXT_PUBLIC_ENABLE_DEV_ROUTES=1 (tests).');
    }
    backend = new MemoryAccountBackend();
  } else {
    backend = createSupabaseBackend();
  }
  holder[KEY] = backend;
  return backend;
}
