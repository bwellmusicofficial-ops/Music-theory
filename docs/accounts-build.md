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

Session cookies are `httpOnly`, `sameSite=lax`, `secure` in production. No `proxy.ts` (middleware) is used:
`getUser()` in the "who am I" route refreshes the session when needed and writes the cookies back.

## Rate limiting

Counters live in Postgres (`supabase/migrations/0002_auth_throttle.sql`) so they work on serverless. Rules, in
`src/accounts/throttle.ts` and mirrored in SQL (a test proves the schedule agrees):

| What | Key | Threshold |
| --- | --- | --- |
| Wrong sign-in password | per code name | 5 |
| Wrong sign-in password | per IP address (all names) | 20 |
| Wrong recovery code | per code name, per IP (separate from sign-in) | 5 and 20 |
| Account creation | per IP | 30 |
| Availability checks | per IP | 300 |

After the threshold: wait 30, 60, 120, 240, 480, then 900 seconds (the cap). A key with no failure for an hour
starts again. A success clears the name's counter but not the IP's. Unknown names are counted too. The IP
threshold is higher than the design's "5" on purpose: a school shares one address between a class. IPs are
hashed (SHA-256) before use; rows idle for a day are deleted. The IP comes from `x-real-ip`, then the first
`x-forwarded-for` entry (Vercel sets both); behind any other proxy check that the header cannot be spoofed.

Side effect to know: anyone can lock a named account for up to 15 minutes by failing on purpose. That is the
usual price of a per-name limit; the delay is capped for that reason.

## Other protections

- Cross-site POSTs are refused (an `Origin` that is not this host gets 403); bodies must be small JSON.
- Responses are `Cache-Control: no-store`. Server errors are a fixed `{ "error": "server-error" }`.
- `server-only` plus a runtime `window` check keep the secret-key code out of the browser.

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

## Where the next tasks plug in

- **P1-03 saving progress:** built, see "Saving progress to an account (P1-03)" above.
- **Email accounts (adults):** add methods to `AccountBackend` (`signUpWithEmail`, `signInWithEmail`, `sendLink`)
  and a branch in the sign-up flow after the age question for adults (`sign-up-flow.tsx`, step `'details'`).
  Marketing opt-in is a separate, unticked box calling `set_marketing()`. `AccountUser` gains a field only if the
  UI needs it; the synthetic-address rule applies to code-name users only.
- **Export and delete (P1-16):** the buttons go in `account-settings-inner.tsx`; the database functions exist.
- **Cookie notice:** the session cookie is strictly necessary and set only after sign-in, but the privacy page
  must mention it before the switch goes on in production.
