import { createHmac } from 'node:crypto';
import { accountsEnabled } from './enabled';
import { passwordProblem } from './password-policy.server';
import type { AccountBackend, AgeBand, CookieJar } from './backend/types';
import {
  codeNameProblem, normaliseCodeName, normaliseRecoveryCode, type PasswordProblem,
} from './rules';
import { AVAILABILITY_THRESHOLD, IP_THRESHOLD, NAME_PAIR_THRESHOLD, NAME_THRESHOLD, SIGN_UP_THRESHOLD } from './throttle';

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

export function rateLimited(seconds: number): Response {
  return json({ error: 'rate-limited', retryAfterSeconds: seconds }, 429, { 'retry-after': String(seconds) });
}

/**
 * An IP address as one rate-limit bucket: an IPv4 address as it is; an IPv6 address by its /64 (the block a single
 * home or school network is given, so one machine cannot dodge a limit by rotating through its own addresses);
 * an IPv4-mapped IPv6 address as the IPv4 address inside it.
 */
export function ipBucket(ip: string): string {
  const v = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]!;
  if (!v.includes(':')) return v;
  const mapped = /^(?:0{0,4}:){2,5}(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v);
  if (mapped) return mapped[1]!;
  const [head = '', tail] = v.split('::');
  const h = head === '' ? [] : head.split(':');
  const t = tail === undefined || tail === '' ? [] : tail.split(':');
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  const first4 = groups.slice(0, 4).map((g) => (g || '0').padStart(4, '0'));
  while (first4.length < 4) first4.push('0000');
  return first4.join(':') + '::/64';
}

const keyed = (domain: string, value: string): string =>
  createHmac('sha256', process.env.SUPABASE_SECRET_KEY ?? 'local-development-only').update(`${domain}:${value}`).digest('hex').slice(0, 32);

/**
 * The address as the platform reports it, bucketed (IPv6 by /64) and keyed-hashed before it is used, so no address is
 * stored. A plain hash of an IPv4 address can be reversed by trying all four billion; keying it with the
 * server secret prevents that.
 */
export function clientKey(req: Request): string {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  return keyed('ip', ipBucket(ip));
}

/** A typed code name as a rate-limit key part: normalised, then keyed-hashed. A typed name is never stored. */
export const nameHash = (codeName: string) => keyed('name', normaliseCodeName(codeName).slice(0, 40));

/** Throttle keys for one code name, shared with account deletion (which forgets them). */
export const nameKey = (kind: string, codeName: string) => `${kind}:name:${nameHash(codeName)}`;
const pairKey = (kind: string, codeName: string, req: Request) => `${kind}:pair:${nameHash(codeName).slice(0, 24)}:${clientKey(req).slice(0, 24)}`;
const ipKey = (kind: string, req: Request) => `${kind}:ip:${clientKey(req)}`;

/**
 * Guess limiting for sign-in and recovery. Counts the attempt BEFORE it is tried (atomic, so parallel guesses
 * cannot slip through) against the name on its own and the name from this address; returns the wait, 0 to go ahead.
 * The per-address ceiling on FAILURES (`ipKey`) is checked first and counted by `recordFailure`.
 */
async function admitGuess(kind: string, codeName: string, req: Request, backend: AccountBackend): Promise<number> {
  const ipWait = await backend.throttle.check(ipKey(kind, req));
  if (ipWait > 0) return ipWait;
  const waits = await Promise.all([
    backend.throttle.hit(pairKey(kind, codeName, req), NAME_PAIR_THRESHOLD),
    backend.throttle.hit(nameKey(kind, codeName), NAME_THRESHOLD),
  ]);
  return Math.max(...waits);
}
const recordFailure = (kind: string, req: Request, backend: AccountBackend) => backend.throttle.fail(ipKey(kind, req), IP_THRESHOLD);
async function forgiveGuesses(kind: string, codeName: string, req: Request, backend: AccountBackend) {
  // Both counters of THIS name: only someone who knows the password or code reaches here. The address's failure
  // counter is not touched, so an account of one's own cannot reset it between guesses at others.
  await Promise.all([backend.throttle.clear(pairKey(kind, codeName, req)), backend.throttle.clear(nameKey(kind, codeName))]);
}

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
  // A declared size far over the limit is refused before the body is read (a UTF-8 character is up to 4 bytes).
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxChars * 4) return fail(413, 'bad-request');
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

    // Look first; only an account that was really made counts toward the address's volume (a refused name,
    // or a slip, does not use up the class's allowance).
    const waiting = await backend.throttle.check(ipKey('signup', req));
    if (waiting > 0) return rateLimited(waiting);

    const r = await backend.signUp({ codeName, password, ageBand: ageBand as AgeBand }, jar);
    if (!r.ok) return fail(409, 'code-name-unavailable');
    await backend.throttle.fail(ipKey('signup', req), SIGN_UP_THRESHOLD);
    return json({ user: r.user, recoveryCode: r.recoveryCode, signedIn: r.signedIn });
  });
}

/** POST /api/account/sign-in  { codeName, password } -> { user } */
export function handleSignIn(req: Request, load: LoadDeps): Promise<Response> {
  return guarded(req, load, async (body, { backend, jar }) => {
    const codeName = str(body.codeName);
    const password = str(body.password);
    if (codeName === null || password === null) return fail(400, 'bad-request');
    const wait = await admitGuess('signin', codeName, req, backend);
    if (wait > 0) return rateLimited(wait);

    const r = await backend.signIn({ codeName, password }, jar);
    if (!r.ok) {
      const after = await recordFailure('signin', req, backend);
      return after > 0 ? rateLimited(after) : fail(401, 'invalid-credentials');
    }
    await forgiveGuesses('signin', codeName, req, backend);
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
    const wait = await admitGuess('recover', codeName, req, backend);
    if (wait > 0) return rateLimited(wait);

    // A malformed code is counted and answered exactly like a wrong one.
    const code = normaliseRecoveryCode(typed);
    if (!code) console.warn(`[accounts] recover refused: code is not 12 valid symbols (typed ${typed.length} characters)`);
    const r = code ? await backend.recover({ codeName, recoveryCode: code, newPassword }, jar) : ({ ok: false } as const);
    if (!r.ok) {
      const after = await recordFailure('recover', req, backend);
      return after > 0 ? rateLimited(after) : fail(401, 'invalid-recovery');
    }
    await forgiveGuesses('recover', codeName, req, backend);
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
