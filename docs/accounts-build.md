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

## Where the next tasks plug in

- **P1-03 saving progress:** `getBackend().currentUser(jar)` says who is signed in. Add a `ProgressSink` that
  talks to Supabase with the signed-in user's session (the publishable-key client from `sessionClient`) so row
  level security applies; `merge_guest_progress` is called after sign-in/sign-up. The seam in the UI is the
  `accountStore` (`src/accounts/ui/store.ts`) and the "Your progress is still saved on this device only" line in
  `account-settings-inner.tsx`, which P1-03 changes.
- **Email accounts (adults):** add methods to `AccountBackend` (`signUpWithEmail`, `signInWithEmail`, `sendLink`)
  and a branch in the sign-up flow after the age question for adults (`sign-up-flow.tsx`, step `'details'`).
  Marketing opt-in is a separate, unticked box calling `set_marketing()`. `AccountUser` gains a field only if the
  UI needs it; the synthetic-address rule applies to code-name users only.
- **Export and delete (P1-16):** the buttons go in `account-settings-inner.tsx`; the database functions exist.
- **Cookie notice:** the session cookie is strictly necessary and set only after sign-in, but the privacy page
  must mention it before the switch goes on in production.
