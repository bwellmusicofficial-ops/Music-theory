# Accounts and data model (P1-01 design)

Status: design for review. Nothing here is applied to a database yet. The SQL
that implements it will live in `supabase/migrations/` with tests for every rule
in the acceptance list below.

This is a design by an engineer, not legal advice. The parts marked LEGAL need a
check by someone qualified before real users sign up.

## Decisions from the product owner (15 Nov 2026)

1. The site is open to all ages.
2. Under 18s may have an account under a code name they choose. Code names are unique.
3. Adults (18 and over) may do the same, or may give a real name and email
   address, which may be used for marketing if they agree.

## How this design reads those decisions

| Question | Design answer | Why |
| --- | --- | --- |
| What do we hold about an under 18? | A code name, a password hash, a recovery-code hash, an age band, settings and learning progress. No real name, no email, no date of birth, no photo, no free text. | The safest personal data is data never collected (UK GDPR data minimisation; ICO Children's Code standard 8). |
| How do we know someone's age? | One question at sign-up: "Are you 18 or over?" Stored as an age band, not a date of birth. | A date of birth is more personal data than the product needs. Self-declaration is proportionate when the under-18 path collects almost nothing. LEGAL |
| Can an under 18 give an email? | No. The email field is not shown on the under-18 path. | Removes the need for parental consent to process a child's contact details, and removes the marketing risk entirely. LEGAL |
| How does a code-name user sign in? | Code name plus password. | No email exists to send a link to. |
| What if they forget the password? | A recovery code is shown once at sign-up to write down. Code name plus recovery code sets a new password and issues a new recovery code. If both are lost the account cannot be recovered. | Any other recovery route needs contact details. The sign-up screen must say this plainly. |
| Is anything about a user public? | No. There are no public profiles, no search of users, no chat, no comments. Later leaderboards show code names only and are opt-in. | Children's Code standards 3 and 9 (default settings, no sharing by default). |
| What does an adult who gives an email get? | Sign-in by emailed link or password, password reset by email, and a separate, unticked "send me news and offers" box. | Consent to marketing must be a positive, separate act (PECR). |
| Can a code-name adult later add an email? | Yes, in Settings, after confirming they are 18 or over. | Lets people upgrade without a new account. |
| Can anyone become "adult" by ticking the box? | Yes: there is no age verification. The adult path only unlocks giving your own name and email and opting in to marketing. | The risk is a child volunteering an email; mitigated by wording and by double opt-in before any marketing is sent. LEGAL |

## Code names

- 3 to 20 characters: letters, digits, `_` and `-`. Shown as typed, compared
  without case or separators, so `Rhythm_Fox`, `rhythmfox` and `RHYTHM-FOX` are
  the same name and only one can exist.
- Refused at sign-up if: taken; on the blocked list (rude words, slurs, "admin",
  "teacher", "support", the site's own name); contains something shaped like an
  email address or phone number; or is 8 or more digits.
- The sign-up screen offers three generated suggestions (adjective + musical
  noun + two digits, for example `SwiftCello42`) and says: "Don't use your real
  name." A generated name is the easy default; typing your own is allowed.
- We cannot fully stop a child typing their real first name. The wording, the
  suggestions and the fact that code names are never shown to other users are
  the controls. LEGAL
- Availability is checked through a function that answers only yes or no, so the
  list of code names cannot be read out.

## Sign-in mechanics (Supabase)

Supabase Auth needs an email or phone for a password user. Code-name accounts
get a synthetic address that is never used for mail:
`<random-id>@accounts.invalid`. `.invalid` is reserved and can never receive
email.

- Sign-up, sign-in and recovery for code-name accounts go through our own server
  routes (Next.js route handlers using the service role on the server only). The
  browser never learns the synthetic address and never holds the service key.
- The routes are rate limited per IP address and per code name (5 failed
  attempts, then an increasing delay) to slow password guessing.
- Passwords: 8 characters minimum, checked against a short list of the most
  common passwords. No composition rules.
- Recovery codes: 12 characters from an unambiguous alphabet, shown once, stored
  only as a bcrypt hash.
- Email accounts use Supabase's standard email link and password flows.
- Sessions are cookies set by the server (`@supabase/ssr`).

## Tables

All tables live in `public`, have row level security enabled, and are reachable
by a signed-in user only for their own rows. There is no policy for the `anon`
role on any table.

| Table | One row per | Holds | User can |
| --- | --- | --- | --- |
| `profiles` | user | code name (nullable for email-only adults), normalised code name, age band, settings, created date | read and update own (not age band, not code name directly) |
| `adult_contacts` | adult who gave details | full name, marketing opt-in, when and under which wording they agreed, when withdrawn | read and update own; exists only when age band is adult |
| `account_secrets` | code-name user | recovery-code hash, failed-attempt counters | nothing: service role only |
| `blocked_names` | blocked word | the word, normalised | nothing: service role only |
| `lesson_progress` | user and lesson | state, resume step, question index, best score, updated date | read own; insert and update own |
| `attempts` | answer | lesson, step, question, skill, type, correct, score, time taken, seed, source, date | read own; insert own; never update or delete |
| `game_scores` | finished game round | game id, score, summary, date | read own; insert own |
| `mock_results` | finished mock test | grade, score, per-topic breakdown, date | read own; insert own |

Later phases add `skill_mastery` and `review_queue` (Phase 2), `achievements`
(Phase 2), and `classes`, `class_members`, `assignments` (Phase 5). Class
features change who can read a pupil's rows and get their own design (P5-01).

### Rules enforced in the database, not only in the app

- `age_band` can be set once at sign-up. Moving from `under_18` to `adult` goes
  through a function that records when the user confirmed it. It never moves back.
- A row in `adult_contacts` can exist only for a profile whose age band is
  `adult` (trigger).
- `score` and `best_score` are between 0 and 1. `best_score` never decreases
  (trigger keeps the greater value), so replaying a lesson cannot lower it, and a
  `complete` or `mastered` lesson never goes back to `in-progress`.
- `attempts` are capped per user per minute (trigger) so a script cannot flood
  the table.
- Text fields have length limits; ids match the same patterns as the lesson
  schema.

### Functions (all `security definer`, with a fixed `search_path`)

| Function | Caller | Does |
| --- | --- | --- |
| `code_name_available(text)` | server route | true or false; applies normalisation and the blocked list |
| `merge_guest_progress(jsonb)` | signed-in user | takes the device's saved progress and attempts (bounded in size), keeps the better result per lesson, ignores anything malformed |
| `export_my_data()` | signed-in user | returns everything held about them as JSON |
| `delete_my_account()` | signed-in user | deletes their auth user; every table cascades |
| `confirm_adult()` | signed-in user | moves age band to adult and records the time |
| `set_marketing(boolean, text)` | signed-in adult | records opt-in with wording version, or withdrawal |

## Guest use

A visitor can use lessons and games with no account. Progress stays in the
browser (already built). On sign-up or sign-in the app offers to add that
progress to the account through `merge_guest_progress`, then clears the device
copy.

## Privacy operations

- Export and delete are in Settings and act immediately, with no email to staff.
- Analytics hold no user id and no code name.
- Marketing email goes only to adults with `marketing_opt_in = true` whose
  address was confirmed by clicking a link (double opt-in), and every message
  has an unsubscribe link that calls `set_marketing(false, ...)`.
- Staff access to the database is the service role only. No staff tool shows
  code names next to anything else identifying.

## Tests the build must pass (P1-01 acceptance)

1. User A cannot select, insert, update or delete any row belonging to user B in
   every table.
2. A signed-out request can read nothing from any table.
3. `account_secrets` and `blocked_names` are unreadable by any signed-in user.
4. An `under_18` profile cannot get an `adult_contacts` row by any route.
5. Two code names that differ only by case or separators cannot both exist, even
   when created at the same moment.
6. `best_score` cannot be lowered and a completed lesson cannot be un-completed.
7. `attempts` cannot be updated or deleted by their owner.
8. `delete_my_account()` leaves no row for that user in any table.
9. `export_my_data()` returns only the caller's rows.

## Open questions for the product owner

1. **Lost recovery code.** With no email, an under 18 who loses both password
   and recovery code loses the account. Accept this, or allow an optional
   "grown-up's email for recovery only" field? The second option adds a parent's
   personal data and a consent step.
2. **Inactive accounts.** Delete code-name accounts after a period with no
   sign-in (for example 24 months), with an on-screen warning at next visit
   before that? Keeping children's data indefinitely is hard to justify.
3. **Marketing sender.** Which service sends marketing email, and who is named
   as the data controller in the privacy notice?
4. **Schools.** If schools use the site, will teachers need to see pupils'
   progress? That changes the model (Phase 5) and should be known before launch
   wording is written.
