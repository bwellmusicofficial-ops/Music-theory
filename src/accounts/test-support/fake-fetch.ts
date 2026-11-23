import { MemoryAccountBackend } from '../backend/memory';
import {
  handleAvailability, handleMe, handleRecover, handleSignIn, handleSignOut, handleSignUp, type LoadDeps,
} from '../handlers';
import { handleDelete, handleExport } from '../privacy-handlers';
import { TestJar } from './jar';

/**
 * A `fetch` that answers /api/account/* with the REAL route handlers over a memory backend, so component
 * tests exercise the same request and response shapes as the site. Test code only.
 */
export function createFakeFetch(backend = new MemoryAccountBackend()) {
  const jar = new TestJar();
  const load: LoadDeps = async () => ({ backend, jar });
  const calls: { path: string; body: unknown }[] = [];
  const table: Record<string, (r: Request, l: LoadDeps) => Promise<Response>> = {
    '/api/account/code-name-available': handleAvailability,
    '/api/account/sign-up': handleSignUp,
    '/api/account/sign-in': handleSignIn,
    '/api/account/recover': handleRecover,
    '/api/account/sign-out': handleSignOut,
    '/api/account/me': handleMe,
    '/api/account/export': handleExport,
    '/api/account/delete': handleDelete,
  };
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = String(input);
    const handler = table[path];
    if (!handler) throw new Error(`unexpected fetch ${path}`);
    const headers = new Headers(init?.headers);
    headers.set('x-forwarded-for', '203.0.113.50');
    const body = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ path, body: body ? JSON.parse(body) : undefined });
    return handler(new Request(`http://localhost:3000${path}`, { method: init?.method ?? 'GET', headers, body, signal: init?.signal ?? undefined }), load);
  };
  return { fetch: fetchFn, backend, jar, calls };
}
