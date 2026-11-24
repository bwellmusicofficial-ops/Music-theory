// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMON_PASSWORDS } from './common-passwords.server';
import { isCommonPassword, passwordProblem } from './password-policy.server';

describe('server-side password policy', () => {
  it('refuses the common ones, whatever the case', () => {
    expect(passwordProblem('password')).toBe('common');
    expect(passwordProblem('PassWord123')).toBe('common');
    expect(passwordProblem('12345678')).toBe('common');
    expect(passwordProblem('qwertyuiop')).toBe('common');
    expect(isCommonPassword('iloveyou')).toBe(true);
  });
  it('knows far more than the old 119-entry list, including entries from the SecLists top 10,000', () => {
    expect(COMMON_PASSWORDS.length).toBeGreaterThan(2000);
    for (const p of ['trustno1', 'baseball', 'mustang1', 'superman', 'princess', 'starwars', 'whatever', 'computer', 'michelle', 'jennifer']) {
      expect(isCommonPassword(p), p).toBe(true);
    }
  });
  it('every entry is 8 or more characters and lower case', () => {
    for (const p of COMMON_PASSWORDS) {
      expect(p.length).toBeGreaterThanOrEqual(8);
      expect(p).toBe(p.toLowerCase());
    }
  });
  it('still applies length and same-as-name, and lets a good passphrase through', () => {
    expect(passwordProblem('short')).toBe('too-short');
    expect(passwordProblem('x'.repeat(73))).toBe('too-long');
    expect(passwordProblem('swiftcello42', 'SwiftCello42')).toBe('same-as-name');
    expect(passwordProblem('purple elephants')).toBeNull();
  });
  it('is only imported by server code: the list file says server-only and the browser-facing files do not import it', () => {
    expect(readFileSync(new URL('./common-passwords.server.ts', import.meta.url), 'utf8')).toMatch(/^import 'server-only';/);
    expect(readFileSync(new URL('./password-policy.server.ts', import.meta.url), 'utf8')).toMatch(/^import 'server-only';/);
    for (const f of ['rules.ts', 'ui/sign-up-flow.tsx', 'ui/recover-form.tsx']) {
      expect(readFileSync(new URL(`./${f}`, import.meta.url), 'utf8'), f).not.toMatch(/from '[^']*(common-passwords|password-policy)/);
    }
  });
});
