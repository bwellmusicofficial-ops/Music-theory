/**
 * The browser's side of the progress routes. Maps every kind of answer to something the engine can act on, and
 * never throws. The fetch function is injectable so tests can point it straight at the route handlers.
 */
import type { SendResult } from './syncer';
import type { BatchWire, SnapshotWire } from './wire';

export type SnapshotResult = { kind: 'ok'; snapshot: SnapshotWire } | { kind: 'signed-out' } | { kind: 'retry' };
export type MergeResult = { kind: 'ok' } | { kind: 'signed-out' } | { kind: 'failed' };

export interface Transport {
  snapshot(): Promise<SnapshotResult>;
  send(batch: BatchWire): Promise<SendResult>;
  merge(payload: Pick<BatchWire, 'lessons' | 'attempts'>): Promise<MergeResult>;
}

const BASE = '/api/account/progress';

function isSnapshot(v: unknown): v is SnapshotWire {
  const s = v as Partial<SnapshotWire> | null;
  return !!s && Array.isArray(s.lessons) && Array.isArray(s.attempts) && typeof s.games === 'object' && s.games !== null && Array.isArray(s.mocks);
}

async function retryAfterMs(res: Response): Promise<number> {
  try {
    const body = (await res.json()) as { retryAfterSeconds?: unknown };
    if (typeof body.retryAfterSeconds === 'number' && body.retryAfterSeconds > 0) return Math.min(body.retryAfterSeconds, 900) * 1000;
  } catch {
    /* no body */
  }
  const header = Number(res.headers.get('retry-after'));
  return Number.isFinite(header) && header > 0 ? Math.min(header, 900) * 1000 : 0;
}

export function createFetchTransport(fetchFn: typeof fetch = (...a) => fetch(...a)): Transport {
  const call = (path: string, init: RequestInit) =>
    fetchFn(path, { ...init, credentials: 'same-origin', cache: 'no-store' });
  const post = (path: string, body: unknown) =>
    call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  return {
    async snapshot() {
      try {
        const res = await call(BASE, { method: 'GET' });
        if (res.status === 401) return { kind: 'signed-out' };
        if (!res.ok) return { kind: 'retry' };
        const body: unknown = await res.json();
        return isSnapshot(body) ? { kind: 'ok', snapshot: body } : { kind: 'retry' };
      } catch {
        return { kind: 'retry' };
      }
    },

    async send(batch) {
      try {
        const res = await post(`${BASE}/sync`, batch);
        if (res.ok) return { kind: 'ok' };
        if (res.status === 401) return { kind: 'signed-out' };
        // The server will never take a malformed batch: drop it so it cannot block everything behind it.
        if (res.status === 400 || res.status === 413 || res.status === 415) return { kind: 'drop' };
        if (res.status === 429) return { kind: 'retry', afterMs: await retryAfterMs(res) };
        return { kind: 'retry' };
      } catch {
        return { kind: 'retry' };
      }
    },

    async merge(payload) {
      try {
        const res = await post(`${BASE}/merge`, payload);
        if (res.ok) return { kind: 'ok' };
        return res.status === 401 ? { kind: 'signed-out' } : { kind: 'failed' };
      } catch {
        return { kind: 'failed' };
      }
    },
  };
}
