import type { AccountUser, AgeBand } from '../backend/types';

/** What the browser learns from the account routes. Never an email address, never why a sign-in failed. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; retryAfterSeconds?: number };

async function call<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { ...init, credentials: 'same-origin', cache: 'no-store' });
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      /* no body */
    }
    if (res.ok) return { ok: true, data: body as T };
    return {
      ok: false,
      error: typeof body.error === 'string' ? body.error : res.status === 404 ? 'not-found' : 'server-error',
      retryAfterSeconds: typeof body.retryAfterSeconds === 'number' ? body.retryAfterSeconds : undefined,
    };
  } catch {
    return { ok: false, error: 'network' };
  }
}

const postJson = <T,>(path: string, body: unknown, signal?: AbortSignal) =>
  call<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });

export type ExportResult =
  | { ok: true; blob: Blob; filename: string }
  | { ok: false; error: string; retryAfterSeconds?: number };

/** POSTs for the data file and returns it as a Blob. An error comes back in the same shape as every other call. */
async function downloadData(): Promise<ExportResult> {
  try {
    const res = await fetch('/api/account/export', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    if (res.ok) {
      const named = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1];
      return { ok: true, blob: await res.blob(), filename: named ?? `music-theory-now-data-${new Date().toISOString().slice(0, 10)}.json` };
    }
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      /* no body */
    }
    return {
      ok: false,
      error: typeof body.error === 'string' ? body.error : 'server-error',
      retryAfterSeconds: typeof body.retryAfterSeconds === 'number' ? body.retryAfterSeconds : undefined,
    };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export const accountApi = {
  me: () => call<{ user: AccountUser | null }>('/api/account/me', { method: 'GET' }),
  codeNameAvailable: (codeName: string, signal?: AbortSignal) =>
    postJson<{ available: boolean }>('/api/account/code-name-available', { codeName }, signal),
  signUp: (input: { codeName: string; password: string; ageBand: AgeBand }) =>
    postJson<{ user: AccountUser; recoveryCode: string; signedIn: boolean }>('/api/account/sign-up', input),
  signIn: (input: { codeName: string; password: string }) =>
    postJson<{ user: AccountUser }>('/api/account/sign-in', input),
  recover: (input: { codeName: string; recoveryCode: string; newPassword: string }) =>
    postJson<{ user: AccountUser; recoveryCode: string; signedIn: boolean }>('/api/account/recover', input),
  signOut: () => postJson<{ ok: true }>('/api/account/sign-out', {}),
  exportData: downloadData,
  deleteAccount: (confirmCodeName: string) => postJson<{ ok: true }>('/api/account/delete', { confirmCodeName }),
};
