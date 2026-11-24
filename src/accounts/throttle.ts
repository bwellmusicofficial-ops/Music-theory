/**
 * Sign-in throttling schedule (docs/accounts-and-data.md: "5 failed attempts, then an
 * increasing delay", per IP address and per code name).
 *
 * The database keeps the counters (supabase/migrations/0002_auth_throttle.sql) so the
 * limit holds across serverless instances. This file is the same schedule in
 * TypeScript for the memory backend; `src/db/auth-throttle.test.ts` proves the two agree.
 */

/**
 * Sign-in and recovery guesses, counted BEFORE the password or code is tried (atomic `hit`, so parallel guesses
 * cannot slip past), in a fixed one-hour window per key:
 *  - per (code name + IP address): the first 5 attempts in an hour are tried, then 30 s, 60 s ... 15 min waits;
 *  - per code name alone: 50 an hour, a ceiling for guessing spread over many addresses. It is high on purpose: one
 *    guess every 15 minutes (4 an hour) from a classmate never reaches it, so a pupil cannot lock another out.
 * A successful sign-in clears both.
 */
export const NAME_PAIR_THRESHOLD = 5;
export const NAME_THRESHOLD = 50;
/**
 * Failed sign-ins or recoveries one IP address (an IPv6 address by its /64) may make across all names, per hour of
 * quiet. A school shares one address between a whole class, so this is a ceiling for a script, not for slips.
 */
export const IP_THRESHOLD = 200;
/** Availability checks (live typing check) per IP before the delay starts. */
export const AVAILABILITY_THRESHOLD = 300;
/** Accounts created per IP (a school class, 60 an hour) before the delay starts. Only successful creations count. */
export const SIGN_UP_THRESHOLD = 60;
/** Progress sync requests per signed-in learner per hour (one every two seconds, round the clock), and guest merges. */
export const SYNC_REQUESTS_PER_HOUR = 1800;
export const MERGE_REQUESTS_PER_HOUR = 10;

export const BASE_DELAY_SECONDS = 30;
export const MAX_DELAY_SECONDS = 900;
/** A key that has had no failure for this long starts again from zero. */
export const WINDOW_SECONDS = 3600;

/** Seconds to wait after the `failures`th failure: 0 below the threshold, then 30, 60, 120, 240, 480, 900. */
export function throttleDelaySeconds(failures: number, threshold: number): number {
  if (failures < threshold) return 0;
  return Math.min(MAX_DELAY_SECONDS, BASE_DELAY_SECONDS * 2 ** Math.min(failures - threshold, 5));
}

/**
 * Data downloads per signed-in learner (P1-16). The count of requests at which the wait starts: the first five
 * downloads in a stretch go through, the sixth is refused for 30 seconds, and each further try while over the
 * limit lengthens the wait (up to 15 minutes). An hour with no requests starts again.
 */
export const EXPORT_THRESHOLD = 6;
/** Wrong typed confirmations when deleting an account, per signed-in learner, before the wait starts. */
export const DELETE_MISMATCH_THRESHOLD = 5;

