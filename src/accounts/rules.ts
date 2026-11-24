/**
 * Code-name, password and recovery-code rules (docs/accounts-and-data.md, "Code names").
 *
 * The database is the final authority on code names (profiles constraints and
 * `code_name_available()`); this file mirrors its FORMAT rules so the browser
 * and the memory backend can explain a refusal without a round trip. The two
 * are held together by a shared corpus tested against both
 * (`test-support/code-name-cases.ts`, `src/db/code-name-parity.test.ts`).
 * The blocked-word list lives only in the database.
 */
export const CODE_NAME_MIN = 3;
export const CODE_NAME_MAX = 20;

/** Lower-case with every non-alphanumeric removed. Mirrors `private.normalise_code_name`. */
export function normaliseCodeName(t: string): string {
  return t.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

export type CodeNameProblem = 'length' | 'characters' | 'too-few-letters' | 'phone-like' | 'email-like';

/** Why the format is refused, or null when it is fine. Mirrors `private.code_name_format_ok`. */
export function codeNameProblem(t: string): CodeNameProblem | null {
  if (t.length < CODE_NAME_MIN || t.length > CODE_NAME_MAX) return 'length';
  if (!/^[A-Za-z0-9_-]+$/.test(t)) return 'characters';
  const n = normaliseCodeName(t);
  if (n.length < CODE_NAME_MIN) return 'too-few-letters';
  if (n.replace(/[^0-9]/g, '').length >= 8) return 'phone-like';
  if (/(gmail|googlemail|hotmail|outlook|yahoo|icloud|protonmail|btinternet|aol|msn)/.test(n)) return 'email-like';
  if (/at[a-z0-9]+(com|couk|net|org|edu|ac)$/.test(n)) return 'email-like';
  return null;
}

export function codeNameFormatOk(t: string): boolean {
  return codeNameProblem(t) === null;
}

/** Plain-English line for a format problem (shown to the person typing). */
export function codeNameProblemText(p: CodeNameProblem): string {
  switch (p) {
    case 'length':
      return `Use ${CODE_NAME_MIN} to ${CODE_NAME_MAX} characters.`;
    case 'characters':
      return 'Use only letters, numbers, _ and -.';
    case 'too-few-letters':
      return 'Use at least 3 letters or numbers.';
    case 'phone-like':
      return "That looks like a phone number. Pick a different name.";
    case 'email-like':
      return "That looks like part of an email address. Pick a different name.";
  }
}

// ---------------------------------------------------------------------------
// Passwords: 8 or more characters, not on the common list, no composition rules. The common list is
// server-side only (`password-policy.server.ts`); `passwordProblem` here is what the browser can check.
// ---------------------------------------------------------------------------
export const PASSWORD_MIN = 8;
/** bcrypt, which Supabase uses, ignores everything after 72 bytes; refuse rather than silently truncate. */
export const PASSWORD_MAX = 72;

export type PasswordProblem = 'too-short' | 'too-long' | 'common' | 'same-as-name';

export function passwordProblem(password: string, codeName?: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN) return 'too-short';
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return 'too-long';
  if (codeName && normaliseCodeName(codeName) !== '' && password.toLowerCase().replace(/[^a-z0-9]/g, '') === normaliseCodeName(codeName)) {
    return 'same-as-name';
  }
  return null;
}

export function passwordProblemText(p: PasswordProblem): string {
  switch (p) {
    case 'too-short':
      return `Use at least ${PASSWORD_MIN} characters.`;
    case 'too-long':
      return `Use ${PASSWORD_MAX} characters or fewer.`;
    case 'common':
      return 'That password is too easy to guess. Try a few words together.';
    case 'same-as-name':
      return "Your password can't be the same as your code name.";
  }
}

// ---------------------------------------------------------------------------
// Recovery codes: 12 characters from an alphabet without look-alikes.
// ---------------------------------------------------------------------------
/** No 0, O, 1, I or L. 31 symbols, so 12 characters is about 59 bits. */
export const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RECOVERY_LENGTH = 12;

/** Draws one symbol with rejection sampling, so every symbol is equally likely. */
function randomSymbol(): string {
  const limit = 256 - (256 % RECOVERY_ALPHABET.length);
  const buf = new Uint8Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0]! < limit) return RECOVERY_ALPHABET[buf[0]! % RECOVERY_ALPHABET.length]!;
  }
}

/** A new recovery code as 12 plain symbols (the form that is hashed). */
export function generateRecoveryCode(): string {
  let s = '';
  for (let i = 0; i < RECOVERY_LENGTH; i++) s += randomSymbol();
  return s;
}

/** Display form: XXXX-XXXX-XXXX. */
export function formatRecoveryCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/**
 * Canonical form of what a person typed: upper case with spaces and dashes removed.
 * Returns null unless the result is exactly 12 symbols from the alphabet.
 */
export function normaliseRecoveryCode(input: string): string | null {
  // Dashes of every kind are ignored: phones and Macs can turn a typed hyphen into a
  // dash (U+2010 to U+2015) or a minus sign (U+2212). Spaces of every kind too.
  const s = input.normalize('NFKC').toUpperCase().replace(/[\s\-\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '');
  if (s.length !== RECOVERY_LENGTH) return null;
  for (const ch of s) if (!RECOVERY_ALPHABET.includes(ch)) return null;
  return s;
}
