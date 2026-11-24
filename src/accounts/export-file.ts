/**
 * Turns what `export_my_data()` returns into the file a learner downloads (P1-16).
 *
 * The database function already leaves out hashes and the made-up address, but the file is what the
 * person (and anyone they show it to) reads, so this is a second, independent lock, applied on the
 * server whatever the backend returned:
 *
 *  - only the known sections are kept (anything else, such as a throttle table, is dropped);
 *  - `account` keeps three fields and drops an `@accounts.invalid` address;
 *  - `account_secrets` keeps only "a recovery code exists" and two dates (no hash, no failure counters);
 *  - any key that looks like a credential is removed from every row;
 *  - any string that still contains the made-up address is replaced with null.
 *
 * Pure and free of server-only imports, so it is unit-tested directly.
 */

export const EXPORT_SECTIONS = [
  'account', 'profile', 'adult_contact', 'account_secrets', 'lesson_progress', 'attempts', 'game_scores', 'mock_results',
] as const;

const LIST_SECTIONS = ['lesson_progress', 'attempts', 'game_scores', 'mock_results'] as const;
const OBJECT_SECTIONS = ['profile', 'adult_contact'] as const;

const SYNTHETIC = /@accounts\.invalid/i;
/** Column names that hold or look like a credential. None of the real columns match. */
const CREDENTIAL_KEY = /(^|_)(hash|password|passwd|secret|token|throttle)(_|s$|$)|encrypted/i;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A copy of `v` with credential-looking keys removed and the made-up address blanked, at any depth. */
function scrub(v: unknown): Json {
  if (typeof v === 'string') return SYNTHETIC.test(v) ? null : v;
  if (Array.isArray(v)) return v.map(scrub);
  if (isObject(v)) {
    const out: Record<string, Json> = {};
    for (const [k, val] of Object.entries(v)) if (!CREDENTIAL_KEY.test(k)) out[k] = scrub(val);
    return out;
  }
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return v;
  return null;
}

function withoutUserId(row: Json): Json {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return row;
  const { user_id: _omit, ...rest } = row;
  void _omit;
  return rest;
}

export const README = {
  what_is_this:
    'This file has everything Music Theory Now keeps in your account. It belongs to you. You can open it in any text editor, keep it, or show it to a grown-up.',
  how_to_read_it:
    'Each part below has a name. Dates look like 2026-11-23T10:15:00Z, which means year, month, day, then the time in UTC. Scores are between 0 and 1, where 1 is full marks.',
  exported_at: 'When this file was made.',
  account:
    'Your account id and the day you made it. If you are an adult and gave an email address, it is here. A code-name account has no email address of yours.',
  profile: 'Your code name, whether you said you are under 18 or 18 or over, your account settings and the dates it was made and last changed.',
  adult_contact:
    'Only for adults who gave their name: the name, and whether you said yes to news and offers, when you said it, and when (if ever) you took it back. It is empty if you gave nothing.',
  account_secrets:
    'Only a note that a recovery code was made for you, and when. Your password and your recovery code are not in this file or anywhere we can read them: we keep scrambled copies that cannot be turned back into the real thing.',
  lesson_progress: 'One entry for each lesson you have started: how far you got, which step you were on, and your best score.',
  attempts: 'Every answer you gave in a lesson: which question it was, whether it was right, your score, and how many thousandths of a second (milliseconds) you took.',
  game_scores: 'Your best scores in the games.',
  mock_results: 'Your results in practice tests: the grade, your score, and how you did on each skill.',
  not_in_this_file:
    'Settings on the device you are using, such as the theme and sound, belong to that device and not to your account, so they are not here.',
} as const;

export function exportFilename(now: Date): string {
  return `music-theory-now-data-${now.toISOString().slice(0, 10)}.json`;
}

/** The file's content as an object. `raw` is whatever `export_my_data()` returned. */
export function buildExportFile(raw: unknown, now: Date): Record<string, Json> {
  const src = isObject(raw) ? raw : {};
  const out: Record<string, Json> = {
    README: { ...README },
    exported_at: typeof src.exported_at === 'string' && !Number.isNaN(Date.parse(src.exported_at)) ? src.exported_at : now.toISOString(),
  };

  const account = isObject(src.account) ? src.account : null;
  out.account = account
    ? {
        user_id: scrub(account.user_id),
        email: typeof account.email === 'string' && !SYNTHETIC.test(account.email) ? account.email : null,
        created_at: scrub(account.created_at),
      }
    : null;

  for (const k of OBJECT_SECTIONS) out[k] = isObject(src[k]) ? scrub(src[k]) : null;

  const secrets = isObject(src.account_secrets) ? src.account_secrets : null;
  out.account_secrets = secrets
    ? { has_recovery_code: true, created_at: scrub(secrets.created_at), updated_at: scrub(secrets.updated_at) }
    : null;

  // The account's id is in `account` once; repeating it in every row of a large file only adds size.
  for (const k of LIST_SECTIONS) out[k] = Array.isArray(src[k]) ? src[k].map(scrub).map(withoutUserId) : [];
  return out;
}

/** Rows are written this many to a piece, so a big file is produced and sent piece by piece. */
const ROWS_PER_CHUNK = 500;

/**
 * The file as pieces of text, in order. Compact JSON (no indentation) with each row of a list on its own line, so it
 * is small and still readable. Joined, the pieces are one valid JSON document ending in a newline. The route streams
 * the pieces: a file of ten thousand answers is a couple of megabytes, over Vercel's 4.5 MB limit for a response
 * that is not streamed once it grows.
 */
export function* exportFileChunks(raw: unknown, now: Date): Generator<string> {
  const file = buildExportFile(raw, now);
  const entries = Object.entries(file);
  yield '{\n';
  for (const [i, [key, value]] of entries.entries()) {
    const last = i === entries.length - 1;
    if (Array.isArray(value) && value.length > 0) {
      yield `${JSON.stringify(key)}:[\n`;
      for (let at = 0; at < value.length; at += ROWS_PER_CHUNK) {
        const rows = value.slice(at, at + ROWS_PER_CHUNK).map((r) => JSON.stringify(r)).join(',\n');
        yield at + ROWS_PER_CHUNK < value.length ? `${rows},\n` : rows;
      }
      yield last ? '\n]\n' : '\n],\n';
    } else {
      yield `${JSON.stringify(key)}:${JSON.stringify(value)}${last ? '\n' : ',\n'}`;
    }
  }
  yield '}\n';
}

/** The whole file as one string (the pieces joined). */
export function exportFileText(raw: unknown, now: Date): string {
  return [...exportFileChunks(raw, now)].join('');
}
