// @vitest-environment node
/** The TypeScript code-name format rules (src/accounts/rules.ts) must agree with the database function. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FORMAT_BAD, FORMAT_OK } from '@/accounts/test-support/code-name-cases';
import { codeNameFormatOk, normaliseCodeName } from '@/accounts/rules';
import { createHarness, type Harness } from './test-harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 60_000);
afterAll(async () => {
  await h.close();
});

const sqlOk = (t: string) => h.asOwner((s) => s.scalar<boolean>(`select private.code_name_format_ok($1)`, [t]));
const sqlNorm = (t: string) => h.asOwner((s) => s.scalar<string>(`select private.normalise_code_name($1)`, [t]));

describe('TypeScript mirror of the database format rules', () => {
  it.each(FORMAT_OK)('accepts %s in both', async (t) => {
    expect(await sqlOk(t)).toBe(true);
    expect(codeNameFormatOk(t)).toBe(true);
  });
  it.each(FORMAT_BAD)('refuses %j in both', async (t) => {
    expect(await sqlOk(t)).toBe(false);
    expect(codeNameFormatOk(t)).toBe(false);
  });
  it('normalises the same way', async () => {
    for (const t of ['Rhythm_Fox-9', 'RHYTHM-FOX', 'a_b-c', 'X1y2']) expect(normaliseCodeName(t)).toBe(await sqlNorm(t));
  });
  it('agrees on random strings from the allowed alphabet', async () => {
    const chars = 'abcXYZ019_-gmailatcom';
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 300; i++) {
      const len = 1 + Math.floor(rnd() * 24);
      let t = '';
      for (let j = 0; j < len; j++) t += chars[Math.floor(rnd() * chars.length)];
      expect(codeNameFormatOk(t), t).toBe(await sqlOk(t));
    }
  });
});
