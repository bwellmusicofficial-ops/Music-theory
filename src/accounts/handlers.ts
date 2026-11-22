import { createHmac } from 'node:crypto';
import { accountsEnabled } from './enabled';
import type { AccountBackend, AgeBand, CookieJar } from './backend/types';
import {
  codeNameProblem, normaliseCodeName, normaliseRecoveryCode, passwordProblem,
  type PasswordProblem,
} from './rules';
import { AVAILABILITY_THRESHOLD, IP_THRESHOLD, NAME_THRESHOLD, SIGN_UP_THRESHOLD } from './throttle';

/**
 * Request handling for /api/account/*, separate from Next so it can be tested with plain
 * `Request` objects and the memory backend. The route files only wire these to Next.
 *
 * Every handler: 404 when the switch is off, refuses cross-site posts, never puts the
 * synthetic address (or any reason a sign-in failed) in a response.
 */

export interface Deps {
  backend: AccountBackend;
  jar: CookieJar;
}
export type LoadDeps = () => Promise<Deps>;

const MAX_BODY_CHARS = 4096;
const MAX_FIELD_CHARS = 200;

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  });
}

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

function rateLimited(seconds: number): Response {
  return json({ error: 'rate-limited', retryAfterSeconds: seconds }, 429, { 'retry-after': String(seconds) });
}

/**
 * The address as the platform reports it, keyed-hashed before it is used, so no address is stored.
 * A plain hash of an IPv4 address can be reversed by trying all four billion; keying it with the
 * server secret prevents that.
 */
export function clientKey(req: Request): string {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const pepper = process.env.SUPABASE_SECRET_KEY ?? 'local-development-only';
  return createHmac('sha256', pepper).update(ip).digest('hex').slice(0, 32);
}

const nameKey = (kind: string, codeName: string) => `${kind}:name:${normaliseCodeName(codeName).slice(0, 40)}`;
const ipKey = (kind: string, req: Request) => `${kind}:ip:${clientKey(req)}`;

/** Cross-site requests are refused: a browser always sends Origin on a cross-site POST. */
export function sameSite(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = [req.headers.get('x-forwarded-host'), req.headers.get('host'), new URL(req.url).host];
  return allowed.includes(host);
}

export type Body = Record<string, unknown>;

/** Reads a small JSON object body. Returns a Response when the request is not acceptable. */
export async function readBody(req: Request, maxChars: number = MAX_BODY_CHARS): Promise<Body | Response> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return fail(415, 'bad-request');
  const text = await req.text();
  if (text.length > maxChars) return fail(413, 'bad-request');
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Body) : fail(400, 'bad-request');
  } catch {
    return fail(400, 'bad-request');
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length <= MAX_FIELD_CHARS ? v : null);

const PASSWORD_ERROR: Record<PasswordProblem, string> = {
  'too-short': 'password-too-short',
  'too-long': 'password-too-long',
  common: 'password-common',
  'same-as-name': 'password-same-as-name',
};

/** Shared front of every POST handler. */
async function guarded(
  req: Request,
  load: LoadDeps,
  run: (body: Body, deps: Deps) => Promise<Response>,
  needsBody = true,
): Promise<Response> {
  if (!accountsEnabled()) return new Response(null, { status: 404 });
  if (!sameSite(req)) return fail(403, 'forbidden');
  try {
    let body: Body = {};
    if (needsBody) {
      const b = await readBody(req);
      if (b instanceof Response) return b;
      body = b;
    }
    return await run(body, await load());
  } catch (err) {
    // Never echo the cause: it can name internals. Log the message only (no request data).
    console.error('[accounts] request failed:', err instanceof Error ? err.message : 'unknown error');
    return fail(500, 'server-error');
  }
}

/** POST /api/account/code-name-available  { codeName } -> { available } */
export function handleAvailability(req: Request, load: LoadDeps): Promise<Response> {
  return guarded(req, load, async (body, { backend }) => {
    const codeName = str(body.codeName);
    if (codeName === null) return fail(400, 'bad-request');
    const wait = await backend.throttle.fail(ipKey('avail', req), AVAILABILITY_THRESHOLD);
    if (wait > 0) return rateLimited(wait);
    return json({ available: codeNameProblem(codeName) === null && (await backend.codeNameAvailable(codeName)) });
  });
}

/** POST /api/account/sign-up  { codeName, password, ageBand } -> { user, recoveryCode, signedIn } */
export function handleSignUp(req: Request, load: LoadDeps): Promise<Response> {
  return guarded(req, load, async (body, { backend, jar }) => {
    const codeName = str(body.codeName);
    const password = str(body.password);
    const ageBand = body.ageBand;
    if (codeName === null || password === null || (ageBand !== 'under_18' && ageBand !== 'adult')) return fail(400, 'bad-request');
    if (codeNameProblem(codeName)) return fail(400, 'code-name-invalid');
    const pw = passwordProblem(password, codeName);
    if (pw) return fail(400, PASSWORD_ERROR[pw]);

    const wait = await backend.throttle.fail(ipKey('signup', req), SIGN_UP_THRESHOLD);
    if (wait > 0) return rateLimited(wait);

    const r = await backend.signUp({ codeName, password, ageBand: ageBand as AgeBand }, jar);
    if (!r.ok) return fail(409, 'code-name-unavailable');
    return json({ user: r.user, recoveryCode: r.recoveryCode, signedIn: r.signedIn });
  });
}

/** POST /api/account/sign-in  { codeName, password } -> { user } */
export function handleSignIn(req: Request, load: LoadDeps): Promise<Response> {
  return guarded(req, load, async (body, { backend, jar }) => {
    const codeName = str(body.codeName);
    const password = str(body.password);
    if (codeName === null || password === null) return fail(400, 'bad-request');
    const keys = [nameKey('signin', codeName), ipKey('signin', req)];

    const waits = await Promise.all(keys.map((k) => backend.throttle.check(k)));
    if (Math.max(...waits) > 0) return rateLimited(Math.max(...waits));

    const r = await backend.signIn({ codeName, password }, jar);
    if (!r.ok) {
      const after = [
        await backend.throttle.fail(keys[0]!, NAME_THRESHOLD),
        await backend.throttle.fail(keys[1]!, IP_THRESHOLD),
      ];
      return Math.max(...after) > 0 ? rateLimited(Math.max(...after)) : fail(401, 'invalid-credentials');
    }
    // Only the name's counter is cleared: someone with an account of their own must not be able to
    // reset the address's counter by signing in between guesses.
    await backend.throttle.clear(keys[0]!);
    return json({ user: r.user });
  });
}

/** POST /api/account/recover  { codeName, recoveryCode, newPassword } -> { user, recoveryCode, signedIn } */
export function handleRecover(req: Request, load: LoadDeps): Promise<Response> {
  return guarded(req, load, async (body, { backend, jar }) => {
    const codeName = str(body.codeName);
    const typed = str(body.recoveryCode);
    const newPassword = str(body.newPassword);
    if (codeName === null || typed === null || newPassword === null) return fail(400, 'bad-request');
    const pw = passwordProblem(newPassword, codeName);
    if (pw) return fail(400, PASSWORD_ERROR[pw]);
    const keys = [nameKey('recover', codeName), ipKey('recover', req)];

    const waits = await Promise.all(keys.map((k) => backend.throttle.check(k)));
    if (Math.max(...waits) > 0) return rateLimited(Math.max(...waits));

    // A malformed code is counted and answered exactly like a wrong one.
    const code = normaliseRecoveryCode(typed);
    if (!code) console.warn(`[accounts] recover refused: code is not 12 valid symbols (typed ${typed.length} characters)`);
    const r = code ? await backend.recover({ codeName, recoveryCode: code, newPassword }, jar) : ({ ok: false } as const);
    if (!r.ok) {
      const after = [
        await backend.throttle.fail(keys[0]!, NAME_THRESHOLD),
        await backend.throttle.fail(keys[1]!, IP_THRESHOLD),
      ];
      return Math.max(...after) > 0 ? rateLimited(Math.max(...after)) : fail(401, 'invalid-recovery');
    }
    await backend.throttle.clear(keys[0]!);
    return json({ user: r.user, recoveryCode: r.recoveryCode, signedIn: r.signedIn });
  });
}

/** POST /api/account/sign-out -> { ok } */
export function handleSignOut(req: Request, load: LoadDeps): Promise<Response> {
  return guarded(
    req,
    load,
    async (_body, { backend, jar }) => {
      await backend.signOut(jar);
      return json({ ok: true });
    },
    false,
  );
}

/** GET /api/account/me -> { user: { codeName, ageBand } | null } */
export async function handleMe(req: Request, load: LoadDeps): Promise<Response> {
  if (!accountsEnabled()) return new Response(null, { status: 404 });
  try {
    const { backend, jar } = await load();
    return json({ user: await backend.currentUser(jar) });
  } catch (err) {
    console.error('[accounts] who-am-i failed:', err instanceof Error ? err.message : 'unknown error');
    return fail(500, 'server-error');
  }
}
