# Code-name accounts: how P1-02 is built

Task P1-02. Specification: `docs/accounts-and-data.md` (read "Code names" and "Sign-in mechanics"). This file
says how that was built, how the switch works, how to test it, and where the next tasks plug in.

Status: built and tested against an in-memory backend and against the real SQL in PGlite. **Not yet tried
against the real Supabase project** (the build workspace cannot reach it). The owner tests on Preview first.

## The switch

Everything is behind `NEXT_PUBLIC_ACCOUNTS_ENABLED=1`, read **at build time**.

| Switch | Account UI (header, Settings) | `/account/*` pages | `/api/account/*` |
| --- | --- | --- | --- |
| unset or `0` (default, production) | not in the bundle at all | not routes (404) | not routes (404) |
| `1` | shown | exist | exist |

How it holds: `next.config.ts` always defines the variable, adds the `account.tsx` / `account.ts` page
extensions only when it is `1` (so `page.account.tsx` and `route.account.ts` are routes only then, the same trick
as the `*.dev.tsx` test pages), and the header and Settings load their account components with a
build-time-constant `import()` that the bundler removes when it is `0`. The handlers also answer 404 at request
time when it is off (unit-tested), as a second lock. Prove a normal build is clean:

```bash
rm -rf .next && npm run build && node scripts/check-no-account-ui.mjs
```

The script fails if any account string, account route or the `/api/account/` path appears in the build.

## How a sign-up works

1. The browser asks `POST /api/account/code-name-available` as the person types (after a 400 ms pause, and only
   when the local format rules pass). The answer is `{ "available": true|false }` and nothing else.
2. `POST /api/account/sign-up` with `{ codeName, password, ageBand }`. The handler checks the format
   (`src/accounts/rules.ts`), the password (8 to 72 characters, not on the common list, not the code name),
   the per-IP limit, then calls the backend.
3. The Supabase backend makes a recovery code, bcrypt-hashes it (cost 10), and creates the auth user with the
   secret key: a synthetic `<random-uuid>@accounts.invalid` address, `email_confirm: true`, and
   `app_metadata: { code_name, age_band }`. The database trigger from 0001 turns that into the profile row and
   refuses a taken, blocked or badly formed name (that is what decides a race: the unique index). A refusal
   comes back as "unavailable" after re-asking `code_name_available()`. Then `account_secrets` gets the hash
   (if that fails the user is deleted again, so no account exists without a recovery code), then the server signs
   in with the synthetic address through `@supabase/ssr`, which sets the session cookies.
4. The response is `{ user: { codeName, ageBand }, recoveryCode, signedIn }`. The code is shown once
   (`XXXX-XXXX-XXXX`, 12 symbols from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, no 0 O 1 I L). The screen has a copy
   button and a required "I've written it down" tick, warns before the page is left, and keeps the code in memory
   only.

Sign-in looks up the profile by normalised code name, reads the synthetic address with the admin API, and signs
in with the password. Wrong password and unknown name give the identical answer. Recovery checks the code against
the bcrypt hash, sets the new password (admin API), stores a **new** code hash, signs in, and ends the person's
other sessions. Password is changed first, so a failure part-way leaves the old code still working.

Sign-out ends this device's session (`scope: 'local'`) and clears the cookies. "Who am I" returns the code name
and age band only.

## What the browser never sees

The synthetic address is never in a response body or UI. Known limit: Supabase puts the session user (and an
`email` claim in the access token) inside the session cookie. The cookie is `httpOnly`, so page scripts cannot
read it, but the address is visible to the person in their own browser's cookie storage. It is random, not
personal and cannot receive mail. If this matters, a Supabase "custom access token hook" can strip the claim; not
done.

Session cookies are `httpOnly`, `sameSite=lax`, `secure` in production, and end when the browser closes. No `proxy.ts` (middleware) is used:
`getUser()` in the "who am I" route refreshes the session when needed and writes the cookies back.

## Security fixes from the P1-17 review

An independent review of the accounts code found nine problems; all are fixed here and in migration
`supabase/migrations/0005_security_hardening.sql` (the owner applies it; see `supabase/README.md`, "Apply 0005").
Until it is applied the server **fails closed**: sign-in, recovery and progress saving answer "server error" and log
`migration 0005_security_hardening.sql has not been applied (function ... is missing)`.

### Sessions end when the browser closes

`@supabase/ssr` gives auth cookies a 400-day life unless told otherwise. `finalCookieOptions` in
`src/accounts/backend/index.ts` removes `maxAge` and `expires` from every cookie the session client writes (sign-in,
refresh), so they are session cookies; a removal keeps `maxAge: 0`. `httpOnly`, `sameSite=lax`, `path=/` and `secure`
(production) are kept. There is deliberately no "keep me signed in". Test: `src/accounts/backend/session-cookies.test.ts`
reads the real Set-Cookie text. The Supabase dashboard's own session limits (below) are a second layer.

### Rate limiting

Counters live in Postgres (`0002_auth_throttle.sql` and `0005`) so they work on serverless. Rules are in
`src/accounts/throttle.ts` (the schedule is mirrored in SQL and a test proves the two agree).

| What | Key | Limit | Why |
| --- | --- | --- | --- |
| Sign-in and recovery attempts | code name + IP | first 5 attempts in an hour are tried, then 30 s, 60 s ... 15 min | stops quick guessing of one name from one place |
| Sign-in and recovery attempts | code name alone | 50 an hour | a ceiling for guessing spread over many addresses. Far above what one classmate can reach (one guess every 15 minutes is 4 an hour), so a pupil cannot lock another out |
| Failed sign-ins and recoveries | IP, all names | 200 failures | a ceiling for a script. A school shares one address between a class, so 20 slips must not lock everyone out (the review's first finding) |
| Account creation | IP | 60 an hour | a class. Checked before the account is made; only accounts really made count (a taken name, a typo or a weak password does not use the allowance) |
| Availability checks | IP | 300 | the live "is this name free" check |
| Progress sync requests | learner | 1800 an hour | counted before the body is read, so empty, duplicate and invalid requests cost the same |
| Guest merge requests | learner | 10 an hour | same |
| Data downloads, delete confirmations | learner | 6 and 5 | P1-16 |

How the guess limit works: `throttle.hit` (SQL `auth_throttle_hit`) counts the attempt and answers in one step,
BEFORE the password or code is tried, under the row's lock, so 100 parallel guesses get 5 tries, not 100 (the review's
check-then-record race; tests in `src/accounts/security.test.ts` run 100 at once on both backends). Windows are fixed
(an hour from the first attempt), so a slow trickle cannot build up. Attempts refused during a wait are not counted,
so they cannot lengthen their own wait. A successful sign-in or recovery clears that name's two counters, but never the
address's failure counter (an account of one's own cannot reset it between guesses at others).

Keys never hold a typed name or an address: both are keyed-hashed (HMAC-SHA-256 with `SUPABASE_SECRET_KEY`) and
shortened. An IPv6 address is counted by its /64 (one network), an IPv4-mapped address as its IPv4 address. The address
comes from `x-real-ip`, then the first `x-forwarded-for` entry (Vercel sets both; behind any other proxy check the
header cannot be spoofed). Rows idle for a day are deleted. Deleting an account forgets its name key; its
name-and-address key expires within a day.

### Progress writes

- `/progress/sync` and `/progress/merge` keep only lesson ids that are real lessons (read from `content/lessons`; the
  route traces those files, see `outputFileTracingIncludes` in `next.config.ts`) and game ids that are a registered
  game (`src/components/site/games.ts`) plus its variant. Others count as skipped. If the lesson list comes back empty
  (content not deployed) the request fails rather than silently dropping everything.
- Bodies: sync 512 KB, merge 2 MiB (5000 attempts and 500 lessons are about 1.3 MB); a declared size far above the
  limit is refused before reading; the database refuses a merge over 2 MiB too.
- Database caps (0005, triggers like 0001's `attempts_rate_cap`), so a learner's own token cannot fill the tables:
  lesson progress 1000 rows (a lesson count above about 900 would need a new migration) and 1500 writes an hour;
  game scores the best 10 per game id kept, 1000 rows, 200 inserts an hour; mock results 500 rows, 30 an hour;
  attempts 5000 an hour direct and 30000 a day including merge (merge counts 250 rows at a time, because updating one
  counter 5000 times in one transaction is slow). A real learner is far below all of these; the numbers are functions
  named `private.cap_*` in 0005. An over-limit write inside merge is counted as skipped (merge never fails on one
  row); elsewhere the route answers 429 "try later".

### Export

The download is compact JSON (each row of a list on its own line, no indentation), the account id is not repeated in
every row, and the response is streamed (`exportFileChunks`), so a file of ten thousand answers (about 3 MB) cannot hit
Vercel's 4.5 MB response limit. Test: 10,000 attempts in `privacy-handlers.test.ts`.

### Recovery signs everyone out

After a correct code, recovery calls `revoke_user_sessions` (deletes the user's `auth.sessions` and refresh tokens)
BEFORE changing anything (this also proves 0005 is there, so a missing 0005 refuses recovery while the old password and
code still work), changes the password, calls it again (a session opened with the old password in between dies too),
rotates the code, and only then opens the new session. It no longer depends on the new sign-in succeeding. The server
asks the auth server about the session on every request (`getUser`), so a deleted session stops working at once.

### Smaller fixes

- Sign-up asks `code_name_available` before `createUser` (no orphan auth user for a refused name). If `createUser`
  fails, the half-made user is found by its made-up address (`auth_user_id_by_synthetic_email`) and deleted.
- The recovery log no longer includes any part of the stored hash.
- Security headers on every route (`next.config.ts`): `X-Frame-Options: DENY`, `Content-Security-Policy:
  frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()` (nothing in the site uses them; a test greps for it).
  There is no script CSP yet.
- Common passwords: the 10,000 most common passwords from SecLists
  (`Passwords/Common-Credentials/10k-most-common.txt`, https://github.com/danielmiessler/SecLists, MIT licence,
  Copyright (c) 2018 Daniel Miessler), the 2,000 of them with 8 or more characters, plus the project's earlier short list
  (2,139 in all), in `src/accounts/common-passwords.server.ts`. It is `server-only`: the browser form checks length and
  "same as your code name"; the common-list check runs in the route (`password-policy.server.ts`), so a weak password
  is explained after the request is sent. The build was checked for the list (`scripts/check-no-account-ui.mjs`).

### What only the real Supabase can prove

- That `postgres` may delete from `auth.sessions` and `auth.refresh_tokens` (it normally can in Supabase). Recovery
  shows "server error" and logs the SQL error if not; the old password and code still work then.
- That a deleted session stops the access token being accepted by `getUser()` (documented Supabase behaviour; the fake
  mimics it).
- The dashboard settings in `docs/handover.md` ("Dashboard settings to check").

## The fake backend

`MemoryAccountBackend` (`src/accounts/backend/memory.ts`) has the same rules in process memory. It is chosen when
`ACCOUNTS_FAKE_BACKEND=1`, and `getBackend()` **refuses it unless `NEXT_PUBLIC_ENABLE_DEV_ROUTES=1`** (which a
normal build bakes in as `0`); `next.config.ts` also refuses to build with it otherwise. Only the Playwright
server sets it (`playwright.config.ts`: switch on, fake backend on, dev routes on). Its blocked list is a tiny
stand-in; the real list is the seed file.

## Tests

| Where | What |
| --- | --- |
| `src/accounts/rules.test.ts`, `suggestions.test.ts` | code-name, password, recovery-code rules; every suggestion checked against the seed blocked list |
| `src/db/code-name-parity.test.ts` | the TypeScript format rules agree with `private.code_name_format_ok` on a shared corpus and on random strings |
| `src/db/auth-throttle.test.ts` | 0002: schedule, window, clean-up, RLS, privileges, idempotence |
| `src/accounts/handlers.test.ts` | every route on the memory backend: happy paths, refusals, rate limits, 404 when off, no address in any response |
| `src/accounts/backend/contract.test.ts` | the same scenarios against both backends; the Supabase one runs the real SQL under a fake Supabase Auth (`test-support/fake-supabase.ts`) |
| `src/accounts/ui/forms.test.tsx` | forms, recovery screen, header and Settings state, over the real handlers |
| `e2e/accounts.spec.ts` | phone and desktop in a real browser: sign up (under 18 and adult), recovery-code gate, sign out, sign in, wrong password, lock-out, recovery, keyboard, axe in both themes |

**What none of this proves:** that Supabase Auth itself behaves as the fake assumes (error codes, `createUser`
refusing through the trigger, cookie handling of `@supabase/ssr`, `signOut(jwt, 'others')`, the new key formats).
That is what the owner's Preview test is for.

## How the owner tests on Preview

1. Apply `supabase/migrations/0002_auth_throttle.sql` in the SQL Editor (README: "Apply 0002").
2. In Vercel, Project Settings, Environment Variables: add `NEXT_PUBLIC_ACCOUNTS_ENABLED` = `1` for the
   **Preview** environment only. Check the three Supabase variables exist for Preview too (the secret key as
   `SUPABASE_SECRET_KEY`). Redeploy the preview (the switch is read at build time).
3. On the Preview URL: Settings now has "Your account". Make an account both ways (under 18 and adult), copy the
   recovery code, sign out, sign in, try a wrong password five times, recover with the code, check Supabase's
   Authentication, Users list (you will see only `@accounts.invalid` addresses) and the `profiles` table.
4. Never set the switch on Production until the privacy pages have had their legal check (handover item 24).

## Saving progress to an account (P1-03)

Task P1-03. When a learner is signed in, their progress is saved to their account and follows them to another
device. Signed out, everything works exactly as before (localStorage only). All of it sits behind the same switch:
with `NEXT_PUBLIC_ACCOUNTS_ENABLED` not `1` none of this code is in the build and none of these routes exist
(`scripts/check-no-account-ui.mjs` now also looks for the sync words and storage keys).

### The idea in one paragraph

The device's own `mtn:v1:*` keys stay the source the app reads, so no screen changed. When an account is signed
in, those keys hold a **cache of the account**. Every save goes to localStorage at once (as now) and into an
**outbox** that is sent to the account when online. When the app looks at the account it **folds the account's
copy into the device's** without ever lowering anything. The browser talks only to our own routes, never to
Supabase and never with a secret.

### Pieces

| Piece | Where | What it does |
| --- | --- | --- |
| Routes | `GET /api/account/progress`, `POST /api/account/progress/sync`, `POST /api/account/progress/merge` (`src/app/api/account/progress/**/route.account.ts`, logic in `src/accounts/progress-handlers.ts`) | Session cookie decides who; no body ever names a user. 401 signed out, 404 when the switch is off, cross-site posts refused, bodies bounded, items that fail validation are counted and skipped, never fatal |
| Server store | `src/accounts/progress/` (`types.ts`, `supabase.ts`, `memory.ts`), reached by `AccountBackend.progress(jar)` | `SupabaseProgressStore` uses the **signed-in user's own session client** (publishable key + their cookie), so row level security applies. `MemoryProgressStore` has the same rules for tests and the e2e run |
| Wire format and limits | `src/sync/wire.ts` | zod validators that mirror 0001's enums, id patterns and ranges; game-id encoding; request bounds |
| Outbox | `src/sync/outbox.ts` | Persistent log in `mtn:v1:outbox` (cleared by "Clear everything on this device"), shared by tabs, coalesces a lesson's newer save and a game's higher score, capped at 6000 entries (oldest attempts go first) |
| Sender | `src/sync/syncer.ts` | One batch at a time, in order. Failure waits 2 s, 4 s, 8 s ... up to 5 min (jittered down only), honours a 429's wait, resets on success, on the `online` event and when the page comes back |
| Merge rules | `src/sync/merge.ts` | Pure functions. See below |
| Device cache | `src/sync/local-cache.ts` | Reads and writes the progress keys: fold in the account's copy, guest payload, set aside, wipe |
| Engine | `src/sync/engine.ts` | Decides what happens at sign-in, sign-out, offline; owns the outbox and the sender |
| UI | `src/sync/ui/` | `MergePrompt`, `SyncStatusLine` (Settings), `SyncProvider` (mounted once in the root layout through `src/sync/mount.tsx`) |
| Hooks into the app | `src/sync/index.ts` | `withAccountSync` wraps the lesson `ProgressSink` and the mock result sink; the four game runners call `syncGameBest` |

The `ProgressSink` interface in `src/lesson/contracts.ts` is **unchanged**. The "Supabase `ProgressSink`" is the
local sink wrapped by `withAccountSync` (local write first, then queue), plus the pull that fills the cache.

### What is stored where (existing tables only, no migration)

| App data | Table | How it is written |
| --- | --- | --- |
| Lesson progress | `lesson_progress` | `merge_guest_progress` with lessons only: the one place that keeps the more advanced state, the greater best score and the furthest position **atomically**, so a device that was offline for a week cannot move a learner backwards |
| Answers | `attempts` | `INSERT ... ON CONFLICT (user_id, lesson_id, step, question_id, occurred_at) DO NOTHING` (the table's own dedupe key), so a replay stores nothing twice. Subject to 0001's 240-a-minute cap: a refusal (53400) becomes a 429 and the sender waits |
| Game best scores | `game_scores` | A row only when the score beats the best already stored for that game id (so a replay is a no-op). The game id is the game plus its variant, e.g. `key-hunt-grade-1-colon-sig-to-key-colon-timed` (the table's `summary` cannot hold text) |
| Mock results | `mock_results` | A row unless that grade already has one with exactly this score and breakdown. Stores grade, score and per-skill fractions only |
| Guest merge | `merge_guest_progress(payload)` | Called through `/progress/merge`, only after the learner says Add |

### Merge rules

- A lesson never loses a completed or mastered state or a best score. The resume position comes from whichever
  side was saved more recently (the account's `updated_at` is server time); a lesson with a save still waiting in
  the outbox always keeps its own position. On the server the furthest position wins.
- Attempts are a set keyed like the database keys them. Game bests are a maximum. Nothing is ever lowered.
- After each look at the account, whatever the device has that the account lacks (progress made before the page
  knew who was signed in, a lost write) is queued, so the two end up the same.

### Guest progress, sign-in and sign-out

1. A signed-in device with **no** progress on it just starts. One **with** progress (made before signing in) shows
   "Add this device's progress to your account?" with **Add** and **Not now**, once, after the sign-up screens
   (never over the recovery code). Nothing is merged silently; until the answer, nothing is sent.
2. **Add:** `merge_guest_progress` for lessons and attempts; best scores and mock results follow through the
   outbox. The device copy becomes the account's cache (owner marker `mtn:v1:sync-owner`). A failure keeps the
   question open with a plain message.
3. **Not now (or Escape):** the guest progress is **set aside** (`mtn:v1:guest-stash`), not deleted. The account's
   own progress is shown. Settings offers "Add it to my account" later, and **signing out puts the guest progress
   back** as the device's own. This keeps a shared school computer as it was before anyone signed in.
4. **Sign out** (header or Settings): first tries to send anything waiting; if some cannot be sent (offline) it
   stops and asks (Settings: "Try saving again" or "Sign out anyway"; the header sends the person to Settings).
   Then it ends the session, wipes the account's cache and the outbox from the device, restores any set-aside
   guest progress, and **keeps the learner's settings**. Settings says in one line that signing out takes the
   account's progress off the device.
5. Someone else's cache found on the device at sign-in (their session ended without a sign-out) is wiped, never
   offered as guest progress. A session check that says for sure nobody is signed in clears a cache with nothing
   waiting; one with unsent work is kept so signing in again sends it. A check that failed (offline) changes nothing.

### Settings

"Saved to your account" when nothing is waiting, "Waiting to save, will retry" when something is (words and a
different icon, never colour alone; it is a polite live region), and while the question above is open "Your
progress on this device isn't in your account yet."

### Known gaps, decided here and reported to the owner

- **Four question types cannot be stored.** 0001's `question_type` enum has nine values; the app has thirteen.
  Attempts at `place-bar-lines`, `fix-beaming`, `write-key-signature` and `find-in-passage` are skipped on the way to
  the account and stay on the device. Lesson progress and best scores are unaffected. Fixing it needs a new
  migration (add the four values), which is the owner's to run; `src/db/progress-sql.test.ts` fails when the enum and
  `DB_QUESTION_TYPES` (`src/sync/wire.ts`) disagree, so the list cannot drift.
- **Mock results come back as a score.** `mock_results` has no column for marks available, band or test id, so on a
  second device a mock result shows its percentage and a band read from fixed thresholds (66, 80, 90) without
  "x out of y". The test is named from the grade (`grade-1`). If mock tests with other pass marks arrive, add a
  column then.
- **No replay key for game scores and mock results.** They have no unique column, so idempotence is by comparison
  (only a higher score; only a not-yet-seen score and breakdown). An answer lost after the server saved can at
  worst leave one duplicate row of an equal result; nothing reads those as anything but a best.
- Only the newest 1000 attempts come down to a new device.

### Tests

| Where | What |
| --- | --- |
| `src/sync/outbox.test.ts`, `syncer.test.ts` | ordering, coalescing, batching, persistence across reload, two tabs, retry and backoff schedule, idempotent replay, pause, signed out |
| `src/sync/merge.test.ts`, `local-cache.test.ts` | newer wins, best never lowered, completed never lowered, idempotent folding, set aside / restore / wipe, tampered stash |
| `src/sync/engine.test.ts` | the whole path with no browser, over the real route handlers: guest offer, Add, Not now, offline then online, reload with a full outbox, second device, sign-out on a shared computer, another learner on the same device |
| `src/accounts/progress-handlers.test.ts` | routes on the memory backend: 404 when off, 401 when signed out, no user id taken from a body, validation, bounds, cross-site, 429, fixed server error |
| `src/accounts/progress/contract.test.ts` | the same scenarios against both stores; the Supabase one runs the real SQL as the user, including the attempts cap |
| `src/db/progress-sql.test.ts` | the exact statements the routes make, as the signed-in user, under 0001's grants and RLS; the same statements aimed at another user's rows; enum parity |
| `src/sync/ui/sync-ui.test.tsx` | merge prompt and Settings status |
| `e2e/progress-sync.spec.ts` | phone and desktop in a real browser: finish a lesson signed out, sign up, Add, see progress; second browser sees it; sign out clears the device; sign in brings it back; Not now; failing sends survive a reload and save later |

`src/accounts/test-support/fake-user-client.ts` turns the slice of the supabase-js query builder the store uses
into the SQL PostgREST would run, executed in PGlite as the signed-in user. What it **assumes about PostgREST** (and
only Preview can check): an insert or upsert sends exactly the columns given, `ignoreDuplicates` becomes
`ON CONFLICT (...) DO NOTHING`, `.select()` after a write returns only the written rows, `rpc` passes named arguments.

### What only the real Supabase can prove

PostgREST's behaviour for those four assumptions; that the user's session cookie really is sent as the JWT on data
calls from `@supabase/ssr` in a route handler (and refreshed); `merge_guest_progress` called by an `authenticated` user
through the API; real latency and the per-minute cap under a real burst; that the `sb-` cookie set by sign-in is what
the progress routes read. A failure of any of these shows as 401 or 500 on `/api/account/progress/*` in the browser's
network tab and as "Waiting to save, will retry" in Settings.

### How the owner tests P1-03 on Preview

Prerequisite: the P1-02 Preview test above, with accounts switched on for Preview. No new migration is needed.

1. **Two devices.** On a phone make an account and finish (or start) a lesson; Settings should say "Saved to your
   account". On a laptop sign in with the same code name: the lesson shows as done or in progress. Play a game round
   on the laptop for a new best; it appears on the phone after the page is opened again (within a minute, or on
   refresh).
2. **Offline, then online.** On the phone, turn on aeroplane mode, do a lesson step or two, open Settings (if the page
   was already open use a link inside the app): "Waiting to save, will retry". Turn the network on: it should change
   to "Saved to your account" within a few seconds, and the laptop sees the progress.
3. **Guest merge.** On a browser where nobody is signed in, do part of a lesson, then make a **new** account: after the
   recovery-code screen you are asked "Add this device's progress to your account?". Press Add and check the lesson
   is there on another device. Repeat with Not now: the account starts empty, Settings offers to add it later, and
   signing out brings the progress back.
4. **Sign-out on a shared device.** Sign in on a school computer, do a lesson, sign out, then open the site: the
   lesson progress must be gone and your theme still set. Sign in as someone else: they must not see it. Sign in again
   as the first learner: it comes back.
5. In Supabase, Table Editor: `lesson_progress`, `attempts`, `game_scores` and `mock_results` should hold rows for the
   test user and no one else's.

## Export and delete (P1-16)

Task P1-16. Specification: `docs/accounts-and-data.md`, "Privacy operations" ("Export and delete are in Settings and act
immediately") and acceptance tests 8 and 9. Same switch as everything else: with `NEXT_PUBLIC_ACCOUNTS_ENABLED` not `1`
none of it is in the build (`scripts/check-no-account-ui.mjs` now also looks for its words and the file name).
**No migration**: `export_my_data()` and `delete_my_account()` from 0001 are used as they are.

### Pieces

| Piece | Where | What it does |
| --- | --- | --- |
| Routes | `POST /api/account/export`, `POST /api/account/delete` (`src/app/api/account/{export,delete}/route.account.ts`, logic in `src/accounts/privacy-handlers.ts`) | 404 when the switch is off, cross-site posts refused (403), signed out is 401. Both are POST on purpose, so a link on another site cannot trigger them. Who acts comes only from the session cookie; no body names a user |
| The file | `src/accounts/export-file.ts` | Builds the download from what `export_my_data()` returned. See "What is in the file" |
| Backend | `AccountBackend.accountId`, `exportData`, `deleteAccount` (Supabase and Memory) | `exportData` calls `export_my_data()` **as the signed-in user** (their cookie and the publishable key), so `auth.uid()` and row level security apply. `deleteAccount` follows the order below |
| Rate limits | existing throttle (`auth_throttle`), keys `export:user:<id>` and `delete:user:<id>`; thresholds in `src/accounts/throttle.ts` | Export: five downloads go through, the sixth is refused for 30 s, each further try while over the limit lengthens the wait (cap 15 min), an hour with no requests starts again. A request that is refused while waiting does not lengthen its own wait. Delete: only wrong typed confirmations count (five, then the wait), because a right one ends the account |
| UI | `src/accounts/ui/account-privacy.tsx`, used by `account-settings-inner.tsx` | "Your data" (Download my data) and "Delete my account" in the account card; the deleted confirmation lives in `account-settings-inner.tsx` |
| Device clean-up | `deleteAccountNow` in `src/accounts/ui/store.ts` | After a successful delete: `engine.afterSignOut()` (the account's cached progress and the outbox are wiped, set-aside guest progress comes back, settings stay) and the state becomes signed out. Nothing waiting in the outbox is sent first: the account no longer exists |

### What is in the file

`music-theory-now-data-YYYY-MM-DD.json` (UTC date), indented JSON. It starts with a `README` object in plain English
that explains each part, then `exported_at`, `account`, `profile`, `adult_contact`, `account_secrets`, `lesson_progress`,
`attempts`, `game_scores`, `mock_results`. Settings stored on the device are not part of the account and are not in
the file; the UI says so.

The route does not trust the database function. `buildExportFile` is a second lock: only those known sections are kept
(anything else, for instance a throttle table, is dropped); `account` keeps `user_id`, `email` and `created_at`, and the
email is dropped when it is an `@accounts.invalid` address; `account_secrets` keeps only "a recovery code exists" and two
dates (no hash, no failure counters); any key that looks like a credential (hash, password, secret, token, throttle,
encrypted) is removed from every row; any string that still contains the made-up address becomes null. A test feeds it a
poisoned result and checks all of that, and a PGlite test fails if `export_my_data()` ever returns a section the file does
not know, so a new table forces the file and its README to be updated.

### Delete: the order, and why

1. **Look, change nothing.** Resolve the signed-in user from the session, read the profile's code name (to check the typed
   confirmation, and to know which rate-limit rows name it). A wrong confirmation stops here (400 `confirm-mismatch`).
   If the profile is already missing (an earlier delete got part-way) the check is skipped so the job can be finished.
2. **`delete_my_account()` as the user.** The one irreversible step. It deletes the `auth.users` row in one database
   transaction and every table cascades from it, so the login and all the data go together or not at all. If it fails,
   nothing changed: the learner is still signed in with everything and can try again.
3. **Admin delete of the auth user** with the secret key. Normally the user is already gone ("not found" counts as
   success); this is a second route to the same result in case the function ever stops removing the login. If it fails and
   the user still exists, the route answers 500, **the session is kept** and a retry finishes the job (step 1 skips the
   confirmation when the profile is gone). If it fails but the user is gone, it is a success.
4. **Forget the rate-limit rows** that name the account (`signin:name:`, `recover:name:`, `export:user:`, `delete:user:`).
   Best effort: they are counters, and the database removes any left after a day.
5. **End the device's session last** (cookies cleared), so a failure anywhere above leaves a session that can retry. Then
   the browser cleans the device as a sign-out does and shows "Your account and everything in it has been deleted."

Why this order: the data and the login are removed by one statement, so there is no moment with a signed-in session and no
data, nor with data and no way to sign in. Code-name sign-in goes through the profile, so even a login left behind could not
be used by anyone: nobody can find it by name, and the made-up address is never shown. The worst case of a fault between
steps 2 and 3 is an orphan row in Supabase Authentication, Users with no data, which the owner would see there; it holds
only the made-up address.

**The code name is free again** after deletion. The specification says deleting the auth user cascades to every table, the
name lives only in the profile, and acceptance test 8 plus `functions.test.ts` already check that `code_name_available()`
says yes afterwards. So someone else may take the name. Nothing of the old account follows it.

### Tests

| Where | What |
| --- | --- |
| `src/accounts/export-file.test.ts` | the file: README, sections kept, the address, hashes, tokens, counters and unknown sections stripped, odd input, the file name |
| `src/accounts/privacy-handlers.test.ts` | both routes over BOTH backends (the Supabase one on the real SQL under the fake Supabase Auth): 404, 403, 401, headers, contents, only the caller's rows, export limit, fixed server error, a poisoned backend result still gives a clean file, wrong or someone else's name, five wrong tries, a successful delete (signed out, cannot sign in, name free, other learner untouched, second delete is 401, name reusable), no user id taken from a body; on the real tables: every table, `auth.users` and the rate-limit rows are empty for the account and unchanged for another; three part-way failures (the function fails; the admin call fails after the account is gone; data gone but login left, then a retry finishes) |
| `src/db/privacy-sql.test.ts` | what the routes assume about the two functions, as the signed-in user in PGlite: known sections only, no address or hash, the adult's own email and name kept, delete removes the login and everything, repeating it is harmless, **it does not clear rate-limit rows** (so the route must), neither works for `anon` |
| `src/accounts/ui/account-privacy.test.tsx` | the download (name, announced, too often, offline) and the two-step delete (closed by default, focus on the safe choice, the button off until the name matches, Enter, success and device clean-up, failure keeps everything, errors cleared on typing) |
| `e2e/account-privacy.spec.ts` | phone and desktop in a real browser: sign up, finish a lesson, download and read the file (the lesson is in it), delete with the two steps, deleted screen, signed out, device cleaned and settings kept, no export afterwards, sign-in with the name fails, the name is free again; keyboard-only focus; axe at zero in both themes for the card, both steps and the deleted screen; the routes refuse cross-site and signed-out |

`src/accounts/test-support/fake-supabase.ts` changed to behave like the real service in two more ways: `admin.deleteUser`
of a user that is not there is a 404 error (the backend must treat that as success), and `getUser()` for a session whose
user was deleted says there is no session.

### What only the real Supabase can prove

That the user's session cookie really authorises `rpc('export_my_data')` and `rpc('delete_my_account')` from a route handler
through PostgREST; that `delete from auth.users` inside the function really cascades through Supabase's own auth tables
(sessions, identities, refresh tokens) with no leftover; that `admin.deleteUser` on the already-removed user answers 404
(`user_not_found`) as assumed; that `auth.signOut({ scope: 'local' })` for a deleted user is harmless; that a large export
returns within the database's statement time limit.

### How the owner tests P1-16 on Preview

Prerequisite: accounts switched on for Preview (the P1-02 steps). No migration to run.

1. **Download.** Sign in as a test account that has some progress. Settings, "Download my data". A file named
   `music-theory-now-data-<today>.json` is saved. Open it in a text editor: the plain-English `README` comes first, then your
   code name, your lessons and answers. Check it contains no `accounts.invalid`, no `$2` text (a password or code hash) and no
   `throttle`. Press the button six times in a row: the sixth should say to wait 30 seconds.
2. **Delete.** Make a separate throwaway account and do a little progress. Note its code name. Settings, "Delete my account",
   "Carry on", type the name, "Delete everything". You should see "Your account and everything in it has been deleted." and be
   signed out. Try signing in with that name: it must fail.
3. **Prove nothing remains.** In Supabase, Authentication, Users: the throwaway user must be gone. Then in the SQL Editor
   (replace `thename` with the name in lower case, with no dashes or underscores):

   ```sql
   select
     (select count(*) from public.profiles       where code_name_norm = 'thename') as profiles,
     (select count(*) from public.auth_throttle  where key like '%:name:thename')  as throttle_by_name;
   ```

   Both must be 0. To check every table for one user, note their id from Authentication, Users before deleting, then after:
   `select count(*) from public.lesson_progress where user_id = '<id>'` (and the same for `attempts`, `game_scores`,
   `mock_results`, `account_secrets`, `adult_contacts`, `profiles`, and `auth_throttle` with `key like '%<id>%'`): all 0.
4. Make a new account with the same code name: it should be accepted (a deleted name is free again) and start empty.
5. If delete shows an error: look at Vercel's function log for `[accounts] delete failed`. Nothing is half-deleted from the
   learner's side: pressing the button again finishes it. A user left in Authentication, Users with no profile is the
   one case to report.

## Where the next tasks plug in

- **P1-03 saving progress:** built, see "Saving progress to an account (P1-03)" above.
- **Email accounts (adults):** add methods to `AccountBackend` (`signUpWithEmail`, `signInWithEmail`, `sendLink`)
  and a branch in the sign-up flow after the age question for adults (`sign-up-flow.tsx`, step `'details'`).
  Marketing opt-in is a separate, unticked box calling `set_marketing()`. `AccountUser` gains a field only if the
  UI needs it; the synthetic-address rule applies to code-name users only.
- **Export and delete (P1-16):** built, see "Export and delete (P1-16)" above.
- **Cookie notice:** the session cookie is strictly necessary and set only after sign-in, but the privacy page
  must mention it before the switch goes on in production.
