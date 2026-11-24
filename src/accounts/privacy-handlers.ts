import { accountsEnabled } from './enabled';
import { exportFileChunks, exportFilename } from './export-file';
import { fail, json, nameKey, readBody, sameSite, type Body, type LoadDeps } from './handlers';
import { normaliseCodeName } from './rules';
import { DELETE_MISMATCH_THRESHOLD, EXPORT_THRESHOLD } from './throttle';

/**
 * /api/account/export and /api/account/delete (P1-16). Like ./handlers.ts: 404 when the switch is off,
 * cross-site posts refused, nothing cached, a fixed error on a fault. Who is acting comes only from the session
 * cookie; no body ever names a user. Both are POST, so a link on another site cannot trigger them.
 */

const MAX_FIELD_CHARS = 200;

const exportKey = (id: string) => `export:user:${id}`;
const deleteKey = (id: string) => `delete:user:${id}`;

function rateLimited(seconds: number): Response {
  return json({ error: 'rate-limited', retryAfterSeconds: seconds }, 429, { 'retry-after': String(seconds) });
}

/** Shared front: switch, same-site, signed in (an id for rate limits). Returns a Response to send instead, or the pieces. */
async function front(req: Request, load: LoadDeps) {
  if (!accountsEnabled()) return new Response(null, { status: 404 });
  if (!sameSite(req)) return fail(403, 'forbidden');
  const deps = await load();
  const id = await deps.backend.accountId(deps.jar);
  if (!id) return fail(401, 'not-signed-in');
  return { ...deps, id };
}

function failed(what: string, err: unknown): Response {
  console.error(`[accounts] ${what} failed:`, err instanceof Error ? err.message : 'unknown error');
  return fail(500, 'server-error');
}

/** POST /api/account/export -> the JSON file as a download */
export async function handleExport(req: Request, load: LoadDeps, now: () => Date = () => new Date()): Promise<Response> {
  try {
    const f = await front(req, load);
    if (f instanceof Response) return f;
    const { backend, jar, id } = f;

    // Look first, so a refused request does not lengthen its own wait; then count this one.
    const waiting = await backend.throttle.check(exportKey(id));
    if (waiting > 0) return rateLimited(waiting);
    const wait = await backend.throttle.fail(exportKey(id), EXPORT_THRESHOLD);
    if (wait > 0) return rateLimited(wait);

    const raw = await backend.exportData(jar);
    if (raw === null) return fail(401, 'not-signed-in');
    const date = now();
    // Streamed piece by piece (a big file must not be one 4.5 MB response body).
    const pieces = exportFileChunks(raw, date);
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = pieces.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      },
    });
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${exportFilename(date)}"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (err) {
    return failed('export', err);
  }
}

/**
 * POST /api/account/delete  { confirmCodeName } -> { ok: true }
 *
 * The order of the steps is in the backend (`deleteAccount`) and in docs/accounts-build.md. Here, after the
 * account is gone, the rate-limit rows that name it are forgotten too.
 */
export async function handleDelete(req: Request, load: LoadDeps): Promise<Response> {
  try {
    const f = await front(req, load);
    if (f instanceof Response) return f;
    const { backend, jar, id } = f;

    const body: Body | Response = await readBody(req);
    if (body instanceof Response) return body;
    const typed = typeof body.confirmCodeName === 'string' && body.confirmCodeName.length <= MAX_FIELD_CHARS ? body.confirmCodeName : null;
    if (typed === null) return fail(400, 'bad-request');

    const waiting = await backend.throttle.check(deleteKey(id));
    if (waiting > 0) return rateLimited(waiting);

    const r = await backend.deleteAccount(jar, typed);
    if (r.status === 'not-signed-in') return fail(401, 'not-signed-in');
    if (r.status === 'name-mismatch') {
      const wait = await backend.throttle.fail(deleteKey(id), DELETE_MISMATCH_THRESHOLD);
      return wait > 0 ? rateLimited(wait) : fail(400, 'confirm-mismatch');
    }

    // Gone. Forget every rate-limit row that names this account (best effort: they are only counters, and any
    // left behind are removed by the database after a day of no use).
    const keys = [exportKey(r.userId), deleteKey(r.userId)];
    if (r.codeNameNorm) {
      const name = normaliseCodeName(r.codeNameNorm);
      keys.push(nameKey('signin', name), nameKey('recover', name));
    }
    for (const key of keys) {
      try {
        await backend.throttle.clear(key);
      } catch (err) {
        console.warn('[accounts] delete: could not clear a rate-limit row:', err instanceof Error ? err.message : 'unknown error');
      }
    }
    return json({ ok: true });
  } catch (err) {
    return failed('delete', err);
  }
}
