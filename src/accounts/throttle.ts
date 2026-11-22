/**
 * Sign-in throttling schedule (docs/accounts-and-data.md: "5 failed attempts, then an
 * increasing delay", per IP address and per code name).
 *
 * The database keeps the counters (supabase/migrations/0002_auth_throttle.sql) so the
 * limit holds across serverless instances. This file is the same schedule in
 * TypeScript for the memory backend; `src/db/auth-throttle.test.ts` proves the two agree.
 */

/** Failures a single code name may make before the delay starts. */
export const NAME_THRESHOLD = 5;
/**
 * Failures one IP address may make across all names. Higher than the per-name figure on
 * purpose: a school shares one address between a whole class, and five slips in a room
 * of thirty must not lock everyone out.
 */
export const IP_THRESHOLD = 20;
/** Availability checks (live typing check) per IP before the delay starts. */
export const AVAILABILITY_THRESHOLD = 300;
/** Account creations per IP before the delay starts. */
export const SIGN_UP_THRESHOLD = 30;

export const BASE_DELAY_SECONDS = 30;
export const MAX_DELAY_SECONDS = 900;
/** A key that has had no failure for this long starts again from zero. */
export const WINDOW_SECONDS = 3600;

/** Seconds to wait after the `failures`th failure: 0 below the threshold, then 30, 60, 120, 240, 480, 900. */
export function throttleDelaySeconds(failures: number, threshold: number): number {
  if (failures < threshold) return 0;
  return Math.min(MAX_DELAY_SECONDS, BASE_DELAY_SECONDS * 2 ** Math.min(failures - threshold, 5));
}
