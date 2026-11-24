// @vitest-environment node
import { serialize } from 'cookie';
import { describe, expect, it } from 'vitest';
import { createSessionClient, finalCookieOptions } from './index';
import { TestJar } from '../test-support/jar';

/** A JWT-shaped token (header.payload.signature) that expires in an hour. */
const jwt = (exp: number) => {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', aud: 'authenticated', role: 'authenticated', exp })}.sig`;
};
const sessionBody = (exp: number) => ({
  access_token: jwt(exp), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r1',
  user: { id: 'u1', aud: 'authenticated', email: 'x@accounts.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
});
const fakeFetch = (exp: number): typeof fetch => async () =>
  new Response(JSON.stringify(sessionBody(exp)), { status: 200, headers: { 'content-type': 'application/json' } });

/** The Set-Cookie headers a jar's writes would produce. */
function setCookieHeaders(jar: TestJar) {
  return jar.everSet.map((c) => serialize(c.name, c.value, c.options as Parameters<typeof serialize>[2]));
}

describe('session cookies end when the browser closes (no 400-day lifetime)', () => {
  it('signing in sets auth cookies with no Max-Age and no Expires, and keeps HttpOnly, SameSite=Lax, Path=/', async () => {
    const jar = new TestJar();
    const client = createSessionClient('https://x.supabase.co', 'sb_publishable_test', jar, {
      fetch: fakeFetch(Math.floor(Date.now() / 1000) + 3600),
    });
    const r = await client.auth.signInWithPassword({ email: 'x@accounts.invalid', password: 'purple elephants' });
    expect(r.error).toBeNull();
    const headers = setCookieHeaders(jar);
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) {
      expect(h, h).toMatch(/^sb-/);
      expect(h, h).not.toMatch(/Max-Age/i);
      expect(h, h).not.toMatch(/Expires/i);
      expect(h, h).toMatch(/HttpOnly/i);
      expect(h, h).toMatch(/SameSite=Lax/i);
      expect(h, h).toMatch(/Path=\//i);
    }
  });

  it('a token refresh rewrites the cookies as session cookies too', async () => {
    const jar = new TestJar();
    const first = createSessionClient('https://x.supabase.co', 'sb_publishable_test', jar, { fetch: fakeFetch(Math.floor(Date.now() / 1000) + 3600) });
    await first.auth.signInWithPassword({ email: 'x@accounts.invalid', password: 'purple elephants' });
    // The browser sends back a session whose access token has already expired, so getSession refreshes it.
    const jar2 = new TestJar();
    const stale = { ...sessionBody(1), access_token: jwt(1), expires_at: 1 };
    jar2.cookies.set('sb-x-auth-token', { value: 'base64-' + Buffer.from(JSON.stringify(stale)).toString('base64url') });
    const second = createSessionClient('https://x.supabase.co', 'sb_publishable_test', jar2, { fetch: fakeFetch(Math.floor(Date.now() / 1000) + 3600) });
    await second.auth.getSession();
    const headers = setCookieHeaders(jar2);
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) {
      expect(h, h).not.toMatch(/Max-Age/i);
      expect(h, h).not.toMatch(/Expires/i);
    }
  });

  it('finalCookieOptions strips lifetimes from a set, and keeps maxAge 0 for a removal', () => {
    const set = finalCookieOptions('value', { maxAge: 34560000, expires: new Date(), httpOnly: false, sameSite: 'none', path: '/x' });
    expect(set).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(set).not.toHaveProperty('maxAge');
    expect(set).not.toHaveProperty('expires');
    const gone = finalCookieOptions('', { maxAge: 0, expires: new Date(0) });
    expect(gone.maxAge).toBe(0);
    expect(gone).not.toHaveProperty('expires');
  });
});
