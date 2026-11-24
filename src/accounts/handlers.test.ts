// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryAccountBackend } from './backend/memory';
import {
  handleAvailability, handleMe, handleRecover, handleSignIn, handleSignOut, handleSignUp, type LoadDeps,
} from './handlers';
import { TestJar } from './test-support/jar';

let backend: MemoryAccountBackend;
let jar: TestJar;
let load: LoadDeps;
const original = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;

beforeEach(() => {
  process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = '1';
  backend = new MemoryAccountBackend();
  jar = new TestJar();
  load = async () => ({ backend, jar });
});
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
  else process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = original;
});

function post(body: unknown, headers: Record<string, string> = {}, raw?: string): Request {
  return new Request('http://localhost:3000/api/account/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...headers },
    body: raw ?? JSON.stringify(body),
  });
}
const get = () => new Request('http://localhost:3000/api/account/me');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: bodies are inspected loosely
const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, any> });

const PW = 'purple elephants';
async function signUp(codeName = 'SwiftCello42', password = PW, ageBand = 'under_18', headers: Record<string, string> = {}) {
  return read(await handleSignUp(post({ codeName, password, ageBand }, headers), load));
}

describe('switch off: every route is a 404 and does nothing', () => {
  it.each([
    ['availability', () => handleAvailability(post({ codeName: 'SwiftCello42' }), load)],
    ['sign-up', () => handleSignUp(post({ codeName: 'SwiftCello42', password: PW, ageBand: 'adult' }), load)],
    ['sign-in', () => handleSignIn(post({ codeName: 'a', password: 'b' }), load)],
    ['recover', () => handleRecover(post({ codeName: 'a', recoveryCode: 'b', newPassword: PW }), load)],
    ['sign-out', () => handleSignOut(post({}), load)],
    ['me', () => handleMe(get(), load)],
  ])('%s', async (_n, call) => {
    for (const value of [undefined, '0', '', 'true']) {
      if (value === undefined) delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
      else process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = value;
      const r = await call();
      expect(r.status).toBe(404);
      expect(await r.text()).toBe('');
    }
    expect(await backend.codeNameAvailable('SwiftCello42')).toBe(true); // nothing was created
  });

  it('does not even load the backend', async () => {
    delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
    const boom: LoadDeps = async () => {
      throw new Error('must not be called');
    };
    expect((await handleMe(get(), boom)).status).toBe(404);
    expect((await handleSignUp(post({}), boom)).status).toBe(404);
  });
});

describe('code-name availability', () => {
  it('answers yes or no only', async () => {
    expect(await read(await handleAvailability(post({ codeName: 'SwiftCello42' }), load))).toEqual({ status: 200, body: { available: true } });
    await signUp();
    expect(await read(await handleAvailability(post({ codeName: 'swift_cello42' }), load))).toEqual({ status: 200, body: { available: false } });
    for (const bad of ['ab', 'admin', 'has space', 'joe_gmail', '12345678']) {
      expect(await read(await handleAvailability(post({ codeName: bad }), load))).toEqual({ status: 200, body: { available: false } });
    }
  });
  it('rejects a body that is not a code name string', async () => {
    for (const body of [{}, { codeName: 5 }, { codeName: 'x'.repeat(201) }, []]) {
      expect((await handleAvailability(post(body), load)).status).toBe(400);
    }
  });
  it('is rate limited per IP, with a Retry-After', async () => {
    let last: Response | undefined;
    for (let i = 0; i < 300; i++) last = await handleAvailability(post({ codeName: 'SwiftCello42' }), load);
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await handleAvailability(post({ codeName: 'SwiftCello42' }, { 'x-forwarded-for': '198.51.100.1' }), load)).status).toBe(200);
  });
});

describe('sign-up', () => {
  it('creates the account, signs in, and returns the recovery code once', async () => {
    const r = await signUp('SwiftCello42', PW, 'adult');
    expect(r.status).toBe(200);
    expect(r.body.user).toEqual({ codeName: 'SwiftCello42', ageBand: 'adult' });
    expect(r.body.recoveryCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(r.body.signedIn).toBe(true);
    expect((await read(await handleMe(get(), load))).body.user).toEqual({ codeName: 'SwiftCello42', ageBand: 'adult' });
    // The password is never echoed.
    expect(JSON.stringify(r.body)).not.toContain(PW);
  });

  it('refuses a name that is taken (any case) or blocked, with the same answer', async () => {
    await signUp('SwiftCello42');
    for (const name of ['swiftcello42', 'SWIFT-CELLO-42', 'Admin']) {
      expect(await signUp(name)).toEqual({ status: 409, body: { error: 'code-name-unavailable' } });
    }
  });

  it.each([
    ['ab', 'code-name-invalid'], ['has space', 'code-name-invalid'], ['joe_gmail', 'code-name-invalid'],
    ['12345678', 'code-name-invalid'], ['a'.repeat(21), 'code-name-invalid'],
  ])('refuses the code name %j', async (name, error) => {
    expect(await signUp(name)).toEqual({ status: 400, body: { error } });
  });

  it.each([
    ['short', 'password-too-short'], ['password123', 'password-common'], ['12345678', 'password-common'],
    ['x'.repeat(73), 'password-too-long'], ['swiftcello42', 'password-same-as-name'],
  ])('refuses the password %j', async (pw, error) => {
    expect(await signUp('SwiftCello42', pw)).toEqual({ status: 400, body: { error } });
    expect(await backend.codeNameAvailable('SwiftCello42')).toBe(true);
  });

  it('needs an age band of under_18 or adult', async () => {
    for (const ageBand of [undefined, 'child', 17, true, 'ADULT']) {
      const r = await read(await handleSignUp(post({ codeName: 'SwiftCello42', password: PW, ageBand }), load));
      expect(r.status).toBe(400);
    }
  });

  it('is rate limited per IP: a school can make 60 accounts, the 61st waits', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 62; i++) codes.push((await signUp(`Quaver${String(i).padStart(2, '0')}x`)).status);
    expect(codes.slice(0, 60).every((c) => c === 200)).toBe(true);
    expect(codes[60]).toBe(429);
    expect(codes[61]).toBe(429);
  });
});

describe('sign-in', () => {
  beforeEach(async () => {
    await signUp();
    await handleSignOut(post({}), load);
  });

  it('signs in with the password; name matched without case or separators', async () => {
    const r = await read(await handleSignIn(post({ codeName: 'swift_cello42', password: PW }), load));
    expect(r).toEqual({ status: 200, body: { user: { codeName: 'SwiftCello42', ageBand: 'under_18' } } });
    expect((await read(await handleMe(get(), load))).body.user.codeName).toBe('SwiftCello42');
  });

  it('a wrong password and an unknown name get the identical answer', async () => {
    const wrong = await read(await handleSignIn(post({ codeName: 'SwiftCello42', password: 'wrong horse!' }), load));
    const unknown = await read(await handleSignIn(post({ codeName: 'NobodyHere99', password: PW }), load));
    expect(wrong).toEqual({ status: 401, body: { error: 'invalid-credentials' } });
    expect(unknown).toEqual(wrong);
    expect((await read(await handleMe(get(), load))).body.user).toBeNull();
  });

  it('after 5 wrong tries for one name, locks that name: even the right password waits', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await handleSignIn(post({ codeName: 'SwiftCello42', password: `wrong password ${i}` }), load)).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401]); // five tries are made; the sixth waits
    const locked = await handleSignIn(post({ codeName: 'SwiftCello42', password: PW }), load);
    expect(locked.status).toBe(429);
    const body = (await locked.json()) as { retryAfterSeconds: number };
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(locked.headers.get('retry-after')).toBe(String(body.retryAfterSeconds));
    // Another name from the same address is not locked.
    await signUp('QuietHarp11');
    await handleSignOut(post({}), load);
    expect((await handleSignIn(post({ codeName: 'QuietHarp11', password: PW }), load)).status).toBe(200);
  });

  it('the delay grows with more failures, and ends after it passes', async () => {
    let now = 1_000_000;
    backend = new MemoryAccountBackend({ now: () => now });
    await signUp();
    const t = async () => (await read(await handleSignIn(post({ codeName: 'SwiftCello42', password: 'wrong password' }), load))).body.retryAfterSeconds as number | undefined;
    for (let i = 0; i < 5; i++) await t(); // five tries are made (the fifth starts the wait)
    expect(await t()).toBe(30);
    now += 31_000;
    expect(await t()).toBeUndefined(); // the wait is over: this one is tried (and fails)
    expect(await t()).toBe(60);
    now += 61_000;
    expect(await t()).toBeUndefined();
    expect(await t()).toBe(120);
    now += 121_000;
    expect((await handleSignIn(post({ codeName: 'SwiftCello42', password: PW }), load)).status).toBe(200);
  });

  it('a success clears the name counter', async () => {
    for (let i = 0; i < 4; i++) await handleSignIn(post({ codeName: 'SwiftCello42', password: 'wrong password' }), load);
    expect((await handleSignIn(post({ codeName: 'SwiftCello42', password: PW }), load)).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await handleSignIn(post({ codeName: 'SwiftCello42', password: 'wrong password' }), load)).status).toBe(401);
  });

  it('limits one IP across many names (200 failures), but not a different IP', async () => {
    let last = 0;
    for (let i = 0; i < 200; i++) last = (await handleSignIn(post({ codeName: `Nobody${i}x`, password: PW }), load)).status;
    expect(last).toBe(429);
    expect((await handleSignIn(post({ codeName: 'SwiftCello42', password: PW }), load)).status).toBe(429);
    expect((await handleSignIn(post({ codeName: 'SwiftCello42', password: PW }, { 'x-forwarded-for': '198.51.100.9' }), load)).status).toBe(200);
  });

  it('an unknown name is throttled too, so existence cannot be probed by lock-out', async () => {
    const s: number[] = [];
    for (let i = 0; i < 7; i++) s.push((await handleSignIn(post({ codeName: 'NobodyHere99', password: PW }), load)).status);
    expect(s).toEqual([401, 401, 401, 401, 401, 429, 429]);
  });

  it('rejects malformed bodies', async () => {
    for (const body of [{}, { codeName: 'x' }, { codeName: 1, password: 'y' }, { codeName: 'x', password: ['y'] }]) {
      expect((await handleSignIn(post(body), load)).status).toBe(400);
    }
  });
});

describe('recovery', () => {
  let code: string;
  beforeEach(async () => {
    code = (await signUp()).body.recoveryCode;
    await handleSignOut(post({}), load);
  });
  const recover = (over: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    handleRecover(post({ codeName: 'SwiftCello42', recoveryCode: code, newPassword: 'a brand new one', ...over }, headers), load);

  it('sets a new password, issues a new code, signs in', async () => {
    const r = await read(await recover({ recoveryCode: code.toLowerCase().replace(/-/g, ' ') }));
    expect(r.status).toBe(200);
    expect(r.body.user).toEqual({ codeName: 'SwiftCello42', ageBand: 'under_18' });
    expect(r.body.recoveryCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(r.body.recoveryCode).not.toBe(code);
    expect(r.body.signedIn).toBe(true);
    expect((await read(await handleMe(get(), load))).body.user.codeName).toBe('SwiftCello42');
    await handleSignOut(post({}), load);
    expect((await handleSignIn(post({ codeName: 'SwiftCello42', password: PW }), load)).status).toBe(401);
    expect((await handleSignIn(post({ codeName: 'SwiftCello42', password: 'a brand new one' }), load)).status).toBe(200);
    expect((await recover()).status).toBe(401); // the old code is spent
  });

  it('refuses a wrong code, a malformed code and an unknown name with one answer', async () => {
    const answers = [
      await read(await recover({ recoveryCode: 'ABCDEFGHJKMN' })),
      await read(await recover({ recoveryCode: 'too short' })),
      await read(await recover({ codeName: 'NobodyHere99' })),
    ];
    for (const a of answers) expect(a).toEqual({ status: 401, body: { error: 'invalid-recovery' } });
  });

  it('checks the new password first, without spending a try', async () => {
    for (let i = 0; i < 10; i++) expect(await read(await recover({ newPassword: 'short' }))).toEqual({ status: 400, body: { error: 'password-too-short' } });
    expect((await recover()).status).toBe(200);
  });

  it('is rate limited per name: guessing codes locks after 5 tries', async () => {
    const s: number[] = [];
    for (let i = 0; i < 7; i++) s.push((await recover({ recoveryCode: 'ABCDEFGHJKMN' })).status);
    expect(s).toEqual([401, 401, 401, 401, 401, 429, 429]);
    expect((await recover()).status).toBe(429);
  });

  it('shares no counter with sign-in', async () => {
    for (let i = 0; i < 5; i++) await handleSignIn(post({ codeName: 'SwiftCello42', password: 'wrong password' }, { 'x-forwarded-for': '198.51.100.20' }), load);
    expect((await recover({}, { 'x-forwarded-for': '198.51.100.20' })).status).toBe(200);
  });
});

describe('sign-out and who-am-i', () => {
  it('signed out, who-am-i is null; after sign-up it names the code name and age band only', async () => {
    expect((await read(await handleMe(get(), load))).body).toEqual({ user: null });
    await signUp('SwiftCello42', PW, 'adult');
    expect((await read(await handleMe(get(), load))).body).toEqual({ user: { codeName: 'SwiftCello42', ageBand: 'adult' } });
    expect(await read(await handleSignOut(post({}), load))).toEqual({ status: 200, body: { ok: true } });
    expect((await read(await handleMe(get(), load))).body).toEqual({ user: null });
  });
  it('responses are never cached', async () => {
    expect((await handleMe(get(), load)).headers.get('cache-control')).toBe('no-store');
    expect((await handleSignIn(post({ codeName: 'a', password: 'b' }), load)).headers.get('cache-control')).toBe('no-store');
  });
});

describe('request safety', () => {
  it('refuses a cross-site POST, accepts same-origin and no Origin', async () => {
    const body = { codeName: 'SwiftCello42' };
    expect((await handleAvailability(post(body, { origin: 'https://evil.example' }), load)).status).toBe(403);
    expect((await handleAvailability(post(body, { origin: 'not a url' }), load)).status).toBe(403);
    expect((await handleAvailability(post(body, { origin: 'http://localhost:3000' }), load)).status).toBe(200);
    expect((await handleAvailability(post(body, { origin: 'https://site.example', 'x-forwarded-host': 'site.example' }), load)).status).toBe(200);
    expect((await handleAvailability(post(body), load)).status).toBe(200);
  });
  it('refuses anything that is not a small JSON object', async () => {
    const wrongType = new Request('http://localhost:3000/x', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"codeName":"abc"}' });
    expect((await handleAvailability(wrongType, load)).status).toBe(415);
    expect((await handleAvailability(post(null, {}, '{not json'), load)).status).toBe(400);
    expect((await handleAvailability(post(null, {}, '"a string"'), load)).status).toBe(400);
    expect((await handleAvailability(post(null, {}, 'x'.repeat(5000)), load)).status).toBe(413);
  });
  it('a backend fault is a plain 500 that leaks nothing', async () => {
    const broken: LoadDeps = async () => ({
      backend: { ...backend, throttle: backend.throttle, codeNameAvailable: async () => { throw new Error('secret=abc123 db at 10.0.0.1'); } } as never,
      jar,
    });
    const r = await handleAvailability(post({ codeName: 'SwiftCello42' }), broken);
    expect(r.status).toBe(500);
    expect(await r.text()).toBe('{"error":"server-error"}');
  });
});

describe('no synthetic address in any response', () => {
  it('through a whole journey', async () => {
    const seen: string[] = [];
    const keep = async (r: Response) => {
      const text = await r.clone().text();
      seen.push(text, JSON.stringify([...r.headers]));
      return r;
    };
    const up = await read(await keep(await handleSignUp(post({ codeName: 'SwiftCello42', password: PW, ageBand: 'under_18' }), load)));
    await keep(await handleMe(get(), load));
    await keep(await handleSignOut(post({}), load));
    await keep(await handleSignIn(post({ codeName: 'SwiftCello42', password: 'nope nope nope' }), load));
    await keep(await handleSignIn(post({ codeName: 'SwiftCello42', password: PW }), load));
    await keep(await handleRecover(post({ codeName: 'SwiftCello42', recoveryCode: up.body.recoveryCode, newPassword: 'a brand new one' }), load));
    await keep(await handleAvailability(post({ codeName: 'SwiftCello42' }), load));
    for (const text of seen) expect(text).not.toMatch(/accounts\.invalid|@/);
  });
});

describe('session cookie', () => {
  it('is httpOnly', async () => {
    await signUp();
    expect([...jar.cookies.values()].every((c) => c.options?.httpOnly === true)).toBe(true);
    expect(jar.cookies.size).toBe(1);
  });
});
