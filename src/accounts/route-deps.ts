import 'server-only';
import { cookies } from 'next/headers';
import { getBackend } from './backend';
import type { Deps } from './handlers';

/** Real dependencies for the route files: the chosen backend and the request's cookies. */
export async function routeDeps(): Promise<Deps> {
  const store = await cookies();
  return {
    backend: getBackend(),
    jar: {
      getAll: () => store.getAll().map((c) => ({ name: c.name, value: c.value })),
      setAll: (list) => {
        for (const c of list) store.set(c.name, c.value, c.options as Parameters<typeof store.set>[2]);
      },
    },
  };
}
