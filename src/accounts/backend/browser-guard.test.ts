// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

describe('the secret-key backend in a browser', () => {
  it('refuses to load where there is a window', async () => {
    await expect(import('./supabase')).rejects.toThrow(/never be imported in the browser/);
  });
});
