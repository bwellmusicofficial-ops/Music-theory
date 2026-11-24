import 'server-only';
import { COMMON_PASSWORDS } from './common-passwords.server';
import { passwordProblem as shapeProblem, type PasswordProblem } from './rules';

/** The refusal list as a set. Built once per server process; never sent to the browser. */
const COMMON = new Set(COMMON_PASSWORDS);

export function isCommonPassword(password: string): boolean {
  return COMMON.has(password.toLowerCase());
}

/**
 * The full password policy, applied by the sign-up and recovery routes: the browser's checks (length, same as the
 * code name) plus the common-password list, which stays on the server.
 */
export function passwordProblem(password: string, codeName?: string): PasswordProblem | null {
  const shape = shapeProblem(password, codeName);
  if (shape === 'too-short' || shape === 'too-long') return shape;
  if (isCommonPassword(password)) return 'common';
  return shape;
}
