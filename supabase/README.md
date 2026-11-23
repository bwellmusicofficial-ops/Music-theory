# Supabase: accounts and learner data

`migrations/0001_init.sql` creates everything described in
`docs/accounts-and-data.md`: enum types, the eight tables, row level security
(enabled and forced), triggers, and the six functions. `seed/blocked_names.sql`
is a **starter** blocked-name list for the product owner to review and extend.

The rules are proved by the tests in `src/db/` (`npm test`), which run the
migrations unmodified in an in-process Postgres (PGlite). 0001 and the blocked-name seed
were applied to the real project on 22 Nov 2026; **0002 (below) still has to be applied.**

## Not part of this task

The server routes for code-name sign-up, sign-in and recovery live in
`src/app/api/account/` and `src/accounts/` (P1-02, see `docs/accounts-build.md`). This folder
provides what they call: `code_name_available()`, the `profiles` and `account_secrets` tables,
the sign-up trigger described below, and (0002) the rate-limit counters. No key is in this
repository; `.env.example` lists the variable names.

## Applying the migration to a new Supabase project

The migration must run as the `postgres` role (it needs BYPASSRLS; the file
checks this and stops otherwise).

### With the Supabase CLI

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push          # applies supabase/migrations/*.sql in order
```

Then load the blocked list (once, and again after editing it):

```bash
psql "$SUPABASE_DB_URL" -f supabase/seed/blocked_names.sql
```

(`SUPABASE_DB_URL` is the "Connection string" from Project Settings, Database.
Keep it out of the repository.) For local development `supabase start` followed
by `supabase db reset` applies migrations; add the seed file to `[db.seed]
sql_paths` in `supabase/config.toml` if you want it loaded on reset.

### With the dashboard

1. Open the project, SQL Editor, New query.
2. Paste the whole of `supabase/migrations/0001_init.sql` and run it.
3. New query again, paste `supabase/seed/blocked_names.sql`, run it.

Both files are safe to run twice. Later changes go in new numbered migrations;
re-running 0001 never alters the shape of an existing table.

## Apply 0002 (sign-in rate limiting)

`migrations/0002_auth_throttle.sql` adds one table, `auth_throttle`, and three functions
(`auth_throttle_check`, `auth_throttle_fail`, `auth_throttle_clear`) that the sign-in, recovery and
sign-up routes use to slow down password guessing. They work across serverless instances because the
counters are in the database. Only the server's secret key can touch them.

1. Open the project, SQL Editor, New query.
2. Paste the whole of `supabase/migrations/0002_auth_throttle.sql` and run it. It needs 0001 to be applied
   first and must run as `postgres` (the SQL Editor does); it stops with a clear message otherwise.
3. Check: Table Editor shows `auth_throttle` with the lock icon (row level security on, no policies).
   Safe to run twice. It stores only a key (a hash of the IP address, or the normalised code name), a count and
   times; rows idle for a day are deleted.

Until 0002 is applied the account routes answer "server error" (they fail closed rather than run without a limit).

## What the migration does that you might not expect

- **A `profiles` row is created for every new auth user** by a trigger on
  `auth.users`. The default is the most protective one: `under_18`, no code
  name. The server routes pass `{"code_name": "...", "age_band": "adult"}` in the
  user's **app metadata** (admin API `createUser`), which end users cannot edit.
  User metadata is ignored. A refused or taken code name makes the user creation
  fail as a whole, so names cannot be taken twice even in a race.
- An email adult who signs up through Supabase directly is `under_18` until they
  call `confirm_adult()` (the app does this after "Are you 18 or over?").
- `set_marketing(true, ...)` additionally requires a real (not
  `@accounts.invalid`) and **confirmed** email address, to keep the double
  opt-in in the database.
- `adult_contacts` rows are created by `set_marketing()` or by the server. The
  user may update their own `full_name`; marketing columns change only through
  `set_marketing()`.
- `profiles.settings` accepts only the `LearnerSettings` keys with their allowed
  values (no free text). `game_scores.summary` and `mock_results.breakdown`
  accept numbers and booleans only. A new setting needs a new migration.
- Limits are constants in `private.*()` functions at the top of the file:
  240 attempts per user per minute, merge bounds (500 lessons, 5,000 attempts,
  10,000 merged attempts per hour, 3 MiB).

## Auth settings the design assumes

Set in the dashboard under Authentication.

| Setting | Value | Why |
| --- | --- | --- |
| Email: confirm email | **On** | Email adults only count as confirmed after clicking a link; `set_marketing` relies on it. |
| Email: secure email change | On | An address cannot be swapped without confirming. |
| Password minimum length | **8** | Design: 8 characters minimum. The "common passwords" check is done in the server routes, not by Supabase. |
| Password requirements (composition) | None | Design: no composition rules. |
| Sign-ups | See "Security notes" below | Code-name users are created by the server with the service role. |
| Synthetic addresses | `<random-id>@accounts.invalid` | Code-name users get one so Supabase has an email. `.invalid` can never receive mail. The server creates them with `email_confirm: true` so no mail is attempted, and never shows the address to the browser. |
| Anonymous sign-ins | Off | Guests use the app with progress on the device only. |
| Sessions | Cookies set by the server (`@supabase/ssr`) | Per the design. |

## Which keys go where

| Key | Where it lives | Notes |
| --- | --- | --- |
| Project URL | Browser and server config | Public. |
| `anon` (publishable) key | Browser and server config | Public by design. Safe only because RLS is on everywhere and `anon` has no table privileges and no function it may run. |
| `service_role` (secret) key | **Server only**: Next.js route handlers, hosting provider secret store | Bypasses RLS. Never in client code, never in `NEXT_PUBLIC_*`, never committed. It is the only role allowed to run `code_name_available()`. |
| Database connection string / `postgres` password | Your machine and CI secret store only | Used to apply migrations. Not needed by the app. |

## Roles and functions

| Function | Who may execute |
| --- | --- |
| `code_name_available(text)` | `service_role` |
| `merge_guest_progress(jsonb)` | `authenticated` |
| `export_my_data()` | `authenticated` |
| `delete_my_account()` | `authenticated` |
| `confirm_adult()` | `authenticated` |
| `set_marketing(boolean, text)` | `authenticated` |

`merge_guest_progress` takes
`{"lessons": [{lessonId, state, step, questionIndex, bestScore?}], "attempts": [{lessonId, step, questionId, skill, type, correct, score, msTaken, seed?, at, source?}]}`
(the shapes of `LessonProgress` and `AttemptEvent`). The user is always the
caller. The dedupe key for attempts is `(user, lessonId, step, questionId, at)`,
so sending the same payload twice is harmless. It returns counts of what was
merged, skipped and duplicated.

## Security notes for whoever wires this up

- Anyone holding the anon key can call Supabase Auth's public `signUp`. That
  creates an auth user (and an `under_18` profile) with whatever email they
  type, outside the age question. Turn off public sign-ups
  (Authentication, Sign In / Up, "Allow new users to sign up") and create email
  accounts from a server route too, or accept and document the exposure.
- Add the production project's SMTP and rate limits before launch; Supabase's
  defaults are for testing.
- Queue and review LEGAL items in the design document before real users sign up.

## Apply 0003 (question types)

`migrations/0003_question_types.sql` adds the four question types from 19 Nov
(place bar lines, fix beaming, write key signature, find in passage) to the
`question_type` enum, so attempts at them can be saved to an account. Run it
once in the SQL Editor (safe to run twice). Then add the four values to
`DB_QUESTION_TYPES` in `src/sync/wire.ts`; until that change ships, the app
keeps those attempts on the device and syncs everything else.

## Apply 0004 (profile from metadata)

`migrations/0004_profile_from_metadata.sql` fixes sign-up on the real project:
Supabase Auth writes a new account's app metadata after inserting the user, so
0001's trigger created profiles with no code name and the default age band. 0004
copies the code name and age band across when the metadata arrives, and repairs
existing profiles. Sign-up refuses to finish (and undoes the account) until it
is applied. Safe to run twice.
