import { describe, expect, it } from 'vitest';
import { FORMAT_BAD, FORMAT_OK } from './test-support/code-name-cases';
import {
  codeNameFormatOk, codeNameProblem, formatRecoveryCode, generateRecoveryCode, normaliseCodeName,
  normaliseRecoveryCode, passwordProblem, RECOVERY_ALPHABET, RECOVERY_LENGTH,
} from './rules';

describe('code names', () => {
  it.each(FORMAT_OK)('%s is a good format', (t) => expect(codeNameFormatOk(t)).toBe(true));
  it.each(FORMAT_BAD)('%j is refused', (t) => expect(codeNameFormatOk(t)).toBe(false));

  it('gives the reason in plain terms', () => {
    expect(codeNameProblem('ab')).toBe('length');
    expect(codeNameProblem('a'.repeat(21))).toBe('length');
    expect(codeNameProblem('has space')).toBe('characters');
    expect(codeNameProblem('joe@x.com')).toBe('characters');
    expect(codeNameProblem('1234-5678')).toBe('phone-like');
    expect(codeNameProblem('ab12345678')).toBe('phone-like');
    expect(codeNameProblem('my_gmail')).toBe('email-like');
    expect(codeNameProblem('joe_at_site_com')).toBe('email-like');
    expect(codeNameProblem('Rhythm_Fox')).toBeNull();
  });

  it('normalises so Rhythm_Fox, rhythmfox and RHYTHM-FOX are one name', () => {
    expect(new Set(['Rhythm_Fox', 'rhythmfox', 'RHYTHM-FOX'].map(normaliseCodeName)).size).toBe(1);
  });
});

describe('passwords', () => {
  it('needs 8 or more characters', () => {
    expect(passwordProblem('1aB!xyz')).toBe('too-short');
    expect(passwordProblem('purple elephants')).toBeNull();
  });
  it('has no composition rules: lower case words are fine', () => {
    expect(passwordProblem('onlylowercaseletters')).toBeNull();
    expect(passwordProblem('12 4 56 78 9 00')).toBeNull();
  });
  it('does not carry the common-password list (that is server side only, see password-policy.server.test.ts)', () => {
    expect(passwordProblem('password')).toBeNull();
  });
  it('refuses a password that is the code name', () => {
    expect(passwordProblem('Swift_Cello42', 'SwiftCello42')).toBe('same-as-name');
    expect(passwordProblem('swiftcello42', 'SwiftCello42')).toBe('same-as-name');
  });
  it('refuses more than 72 bytes (bcrypt would cut it)', () => {
    expect(passwordProblem('a b '.repeat(18))).toBeNull();
    expect(passwordProblem('x'.repeat(73))).toBe('too-long');
    expect(passwordProblem('é'.repeat(37))).toBe('too-long');
  });
});

describe('recovery codes', () => {
  it('are 12 symbols from an alphabet with no look-alikes', () => {
    for (const ch of '0O1IL') expect(RECOVERY_ALPHABET).not.toContain(ch);
    expect(new Set(RECOVERY_ALPHABET).size).toBe(RECOVERY_ALPHABET.length);
    for (let i = 0; i < 200; i++) {
      const c = generateRecoveryCode();
      expect(c).toHaveLength(RECOVERY_LENGTH);
      for (const ch of c) expect(RECOVERY_ALPHABET).toContain(ch);
    }
  });
  it('are not repeated and use the whole alphabet', () => {
    const seen = new Set<string>();
    const symbols = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const c = generateRecoveryCode();
      seen.add(c);
      for (const ch of c) symbols.add(ch);
    }
    expect(seen.size).toBe(400);
    expect(symbols.size).toBe(RECOVERY_ALPHABET.length);
  });
  it('display as XXXX-XXXX-XXXX and read back however they were written', () => {
    const c = generateRecoveryCode();
    const shown = formatRecoveryCode(c);
    expect(shown).toMatch(/^.{4}-.{4}-.{4}$/);
    for (const typed of [shown, shown.toLowerCase(), shown.replace(/-/g, ' '), ` ${c} `, c.toLowerCase()]) {
      expect(normaliseRecoveryCode(typed)).toBe(c);
    }
  });
  it('are refused when the wrong length or using a symbol outside the alphabet', () => {
    expect(normaliseRecoveryCode('')).toBeNull();
    // Typographic dashes and minus signs a phone or Mac may substitute for a hyphen.
    expect(normaliseRecoveryCode('AVEF\u20132NF6\u2014392R')).toBe('AVEF2NF6392R');
    expect(normaliseRecoveryCode('avef\u2212 2nf6\u2011392r')).toBe('AVEF2NF6392R');
    expect(normaliseRecoveryCode('\uFF21VEF-2NF6-392R')).toBe('AVEF2NF6392R');
    expect(normaliseRecoveryCode('ABCD-EFGH-JKM')).toBeNull();
    expect(normaliseRecoveryCode('ABCD-EFGH-JKMNP')).toBeNull();
    expect(normaliseRecoveryCode('ABCD-EFGH-JKM0')).toBeNull();
    expect(normaliseRecoveryCode('ABCD-EFGH-JKMO')).toBeNull();
  });
});
