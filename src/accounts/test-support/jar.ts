import type { CookieJar } from '../backend/types';

/** A browser's cookie jar for tests: keeps what was set, forgets what was expired. */
export class TestJar implements CookieJar {
  readonly cookies = new Map<string, { value: string; options?: Record<string, unknown> }>();
  readonly everSet: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  getAll() {
    return [...this.cookies].map(([name, c]) => ({ name, value: c.value }));
  }

  setAll(list: { name: string; value: string; options?: Record<string, unknown> }[]) {
    for (const c of list) {
      this.everSet.push(c);
      if (c.value === '' || c.options?.maxAge === 0) this.cookies.delete(c.name);
      else this.cookies.set(c.name, { value: c.value, options: c.options });
    }
  }
}
