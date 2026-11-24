# Music Theory Now: project handover

Written 17 November 2026 by the orchestrating session (Claude Fable 5.2) for the
session that continues the work (Claude Opus 5.5). Everything here was true at
commit `a65b019` on `main`, with CI green on GitHub. Check `git log` and the
latest CI run before relying on it.

## 1. Snapshot

| Item | State |
| --- | --- |
| Repository | `bwellmusicofficial-ops/Music-theory`, branch `main` |
| Live site | https://music-theory-five.vercel.app (Vercel redeploys on every push to `main`) |
| Started | 13 November 2026 |
| Stack | Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4, Zod 4, VexFlow 5, Tone.js 15, Vitest, Playwright |
| Tests | About 5,230 unit and component tests; about 350 real-browser tests on every push; a sweep of every question on demand |
| Lessons | 37: twelve "Start here", 25 Grade 1. One is reviewed; 36 are drafts awaiting the owner's review |
| Storage | Browser only (localStorage). No database is connected yet |
| Phase | Phase 0 complete and tested with real learners. Phase 1 complete except everything that needs a database |
| Nothing is running | No agents, no servers, no worktrees |

The original specification and the 66-task build plan are in a Claude doc the
owner holds ("Music Theory Learning Platform: Product Specification", with a
"Build plan" tab). You may not be able to open it, so sections 2, 4 and 8 below
restate what matters from it.

## 2. The product in one page

A website that teaches music theory from complete beginner to Grade 8.

- **Feel:** modern, dark, bold, like a music or streaming app. Never like a
  textbook or an exam-board site.
- **Principles:** sound first (hear and play before naming); do, don't read
  (at most 60 words per text block, every screen interactive); 5 to 8 minute
  lessons that work on a phone; real music across styles; every lesson
  revisitable at its own URL; progress always visible; covers the graded
  syllabus without being shaped like an exam.
- **Structure:** Grade, then Unit, then Lesson. Eight strands: rhythm, pitch,
  scales and keys, intervals, harmony, composition, terms, score reading.
- **Every lesson has six steps:** hook, explore (play with an instrument), name
  (cards plus "explain it another way"), practice (3 to 5 questions with hints
  and a second attempt), challenge (a timed scored round that completes the
  lesson), recap (a card saved to the library).
- **Nine question types:** note-on-stave, play-keyboard, tap-rhythm, by-ear,
  complete-bar, spot-mistake, ordering, multiple-choice, match-up.
- **Planned scale:** about 270 lessons. Grades 6 to 8 are a different kind of
  product (four-part harmony, figured bass, composition) and need new tools.

## 3. Decisions the owner has made

These are settled. Do not reopen them without a reason.

**Product**
- Working name "Music Theory Now". Final name and brand are not decided.
- Aligned to ABRSM. The site says "aligned to", never "endorsed by".
- UK terminology by default, US as a setting (crotchet / quarter note, bar /
  measure, stave / staff, tone / whole step, pause / fermata).
- The piano is a synthesised voice for now. Real samples will be added "when the
  time is right" (see section 7).
- Tap-along activities must read as a game: notes on the stave light up as they
  are tapped, green for perfect, amber for close, red cross for a miss.
- New lessons stay marked as drafts until he has reviewed them.
- He asked for as much work as possible to be done without him, "as long as it
  doesn't jeopardise the project".

**Music rulings (he is the music specialist)**
- Writing key signatures is marked strictly: each sharp or flat must sit at its
  standard position (F♯ on the top line in treble, not the bottom space). Ruled
  19 Nov 2026.
- In 4/4, a silent first half or second half of a bar is ONE minim rest. Two
  crotchet rests there are wrong. Silence on beats 2 and 3 is two separate
  crotchet rests. The rhythm engine enforces this, and the same rule applies in
  4/2 and 12/8.
- A whole silent bar is a semibreve rest in any time signature (breve rest in 4/2).
- Note-name memory aids: treble lines "Every Green Bus Drives Fast", treble
  spaces "FACE in the space"; bass lines "Good Birds Don't Fly Away", bass
  spaces "All Cows Eat Grass". Use these everywhere; do not invent others.

**Accounts (15 November 2026)**
- Open to all ages.
- Under 18s may have an account under a code name they choose; code names are
  unique.
- Adults may do the same, or give a real name and email address, usable for
  marketing if they agree.
- The architect's reading of this, which the owner has seen but not yet
  answered in detail, is in `docs/accounts-and-data.md`: under 18s give no email
  at all, age is a yes/no question and not a date of birth, sign-in is code name
  plus password with a one-time recovery code.

## 4. Status against the plan

The plan has six phases. Task ids are the ones used in commit messages.

### Phase 0: prototype. DONE

All 16 tasks, plus a defect round (P0-17) and a fix for sound on iPhones. The
gate (five test users complete the lesson unaided) was passed on 15 November:
"works well on mobile devices, no obvious bugs". Their one request, live note
feedback while tapping, has been built.

### Phase 1: MVP (Start here and Grade 1). DONE except database work

| Task | State |
| --- | --- |
| P1-01 Database schema and security | Designed (`docs/accounts-and-data.md`), written (`supabase/migrations/0001_init.sql`, 206 tests in `src/db`) and APPLIED to the real project on 22 Nov 2026 by the owner through the SQL Editor, with the starter blocked-names seed. Checked: all eight tables present with row level security on |
| P1-02 Sign-in | BUILT (22 Nov 2026), switched OFF. Code-name accounts: sign-up with recovery code, sign-in, recovery, sign-out, rate limiting (needs `0002_auth_throttle.sql` applied). Behind `NEXT_PUBLIC_ACCOUNTS_ENABLED=1`; tested on an in-memory backend and on the real SQL in PGlite, **not yet against the real Supabase**. See `docs/accounts-build.md` for how to enable it on Preview. Adult email accounts not built |
| P1-03 Progress saved to accounts | BUILT (22 Nov 2026), switched OFF with accounts. Signed in: progress saves to the account and follows the learner. Offline-first (localStorage plus a persistent outbox with retry), idempotent, never lowers a best score or a completed lesson; guest progress is offered once ("Add this device's progress to your account?", merged only on Add, set aside on Not now); signing out wipes the account's cache from the device and keeps settings; Settings shows "Saved to your account" / "Waiting to save, will retry". Uses existing tables, **no new migration**. Tested on the memory backend and on the real SQL in PGlite as the signed-in user, **not yet on the real Supabase**. **Known gaps:** attempts at four question types (`place-bar-lines`, `fix-beaming`, `write-key-signature`, `find-in-passage`) are not in 0001's `question_type` enum, so they stay on the device until a migration adds them (owner decision); mock results sync as score and grade only. Owner's Preview test (two devices, offline, guest merge, shared device): `docs/accounts-build.md`, "How the owner tests P1-03 on Preview" |
| P1-04 Grade 1 question generators | Done: 20 generators, documented in `docs/generators-grade-1.md` |
| P1-05 Dashboard | Done (`/`) |
| P1-06 Course map and unit pages | Done (`/learn`, `/learn/[grade]/[unit]`) |
| P1-07 Library, recap cards, glossary | Done (`/library`) |
| P1-08 Settings and static pages | Settings done. Privacy policy and terms pages NOT written |
| P1-09 Lessons | Done as drafts: 35 written, awaiting owner review |
| P1-10 Glossary | Done: 98 entries in `content/glossary/start.json` and `1.json` |
| P1-11 Games | Done: Note Rush, Tap It, Key Hunt, Term Blitz |
| P1-12 Mock test | Done: engine plus a 31-question Grade 1 paper (`/mock`) |
| P1-13 Landing page | Yes (19 Nov): a 30-second three-step demo (by-ear, tap a rhythm, finish card) in the first phone screen for new visitors; a slim "Try a 30-second demo" card for returning learners |
| P1-14 Accessibility pass | Done; see `docs/accessibility.md` for what remains |
| P1-15 End-to-end tests | Done, running in CI |
| P1-16 Data export and deletion | BUILT (23 Nov 2026), switched OFF with accounts; **no new migration**. Signed in, Settings has "Download my data" (a dated JSON file with a plain-English README, from `export_my_data()` called as the user, cleaned on the server so the made-up address, hashes and rate-limit rows can never be in it; at most five downloads in a stretch) and "Delete my account" (two steps in the page: what goes, then type the code name; then `delete_my_account()` as the user, the admin delete of the auth user, the account's rate-limit rows forgotten, the device signed out and cleaned like a sign-out, "Your account and everything in it has been deleted."). A deleted code name is free again. Tested on the memory backend and on the real SQL in PGlite under a fake Supabase Auth, plus phone and desktop e2e; **not yet on the real Supabase**. Order of the steps, failure behaviour and the owner's Preview test: `docs/accounts-build.md`, "Export and delete (P1-16)". Privacy-friendly analytics is still NOT STARTED |
| P1-17 Security review and release | Review DONE (23-24 Nov 2026): nine findings, all fixed on branch `claude/p1-17-security-fixes`; **migration 0005 must be applied by the owner**, and the dashboard settings below checked. Detail: `docs/accounts-build.md`, "Security fixes from the P1-17 review". Performance check and release NOT STARTED |

The Phase 1 gate in the plan: twenty learners complete Grade 1 and most pass the
mock test.

### Phases 2 to 5: not started

See section 8 for the task lists.

## 5. Map of the code

```
CLAUDE.md                     rules for any session (read first)
content/
  lessons/<grade>/<unit>/<id>.json   lessons (grade is `start` or `1`)
  glossary/<grade>.json              glossary entries
  mocks/grade-1.json                 mock test paper definition
docs/
  handover.md                 this file
  architecture.md             decisions, layout, dependency rules, component contracts
  stave-interaction.md        design of the interactive stave (long; the authority for it)
  question-payloads.md        exact payload, marking and feedback text for each question type
  generators-grade-1.md       every generator, with a quick-reference table for lesson authors
  lesson-authoring-guide.md   how to write a lesson; skill ids; lesson lists; checklist
  accounts-and-data.md        account and data design (the specification for the database)
  accounts-build.md           how code-name accounts are built, the switch, the fake backend, testing on Preview
  accessibility.md            what was tested, what remains, manual screen-reader script
  briefs/lesson-author.md     the brief given to every lesson-writing agent (reuse it)
e2e/                          Playwright tests; e2e/sweep is the exhaustive per-question run
scripts/generate-skills.mjs   builds src/lesson/skills.ts from the authoring guide tables
supabase/                     migrations 0001 (applied) and 0002 (to apply), seed list of blocked names, README
src/
  engine/                     pure music theory: types.ts, api.ts (contracts), pitch/, rhythm/, rng.ts
  audio/                      Tone.js wrapper: unlock on gesture, piano voice, playback, metronome
  components/
    ui/                       buttons, cards, modal, progress bar, feedback banner
    stave/                    interactive stave on VexFlow (read, edit, marks, cursor, NoteSprite)
    keyboard/                 on-screen piano
    rhythm-pad/               tap pad, scoring, live verdicts, latency calibration, shared click (docs/rhythm-pad.md)
    site/                     header, tab bar, dashboard and library pieces, games list
  lesson/
    schema.ts, contracts.ts   CONTRACTS: lesson file shape; question modules, generators, progress
    player/                   six-step lesson player, state machine, rich text, exhibits
    progress/                 localStorage ProgressSink
    questions/<type>/         one folder per question type (schema, mark, component)
    questions/notation/       draws glyphs and passages for questions and exhibits
    generators/<id>/          one folder per question generator
    skills.ts                 generated list of skill ids and labels
    all-lessons.test.tsx      renders every question of every lesson (safety net)
  mock/                       mock test engine, components, local result store
  games/<game>/               note-rush, tap-it, key-hunt, term-blitz
  progress-view/              pure functions deriving dashboard and course-map data
  settings/                   learner settings store (theme, sound, terminology, motion, latency)
  db/                         test harness and tests for the SQL migrations (PGlite)
  accounts/                   code-name accounts (P1-02): rules, backends (Supabase, memory), route handlers, forms;
                              progress/ (P1-03): the server-side progress stores and their routes' handlers
  sync/                       saving progress to an account (P1-03): outbox, sender, merge rules, device cache, engine, prompt
  app/(site)/                 pages with the site navigation
  app/lessons/[id]/           lesson pages (own header, no site nav)
  app/(dev)/                  test-only harness routes, absent from production builds
```

Design tokens are in `src/styles/tokens.css` (dark default, light theme, one
colour per strand). Tailwind v4 reads them through `@theme` in
`src/app/globals.css`.

## 6. How the work has been run

This method produced everything above in four days. Keep it unless you find
something better.

1. **Break work into briefs.** Each brief names: the worktree and branch, the
   documents to read first, the folders the agent owns (it edits nothing else),
   exact deliverables, the tests required, a real-browser check where UI is
   involved, the acceptance commands, and what to report (including what was
   NOT verified and any judgement calls).
2. **One git worktree and branch per task** (`git worktree add -b claude/<task>
   ../wt/<task> main`). Agents commit but never push. Parallel agents never own
   the same files.
3. **Review before merging.** Read the report; check the diff stayed in the
   owned folders; for anything musical, run the code and check a sample by hand
   against what a music teacher would expect; look at screenshots; then merge
   with `--no-ff`, run lint, typecheck, the full test suite and a build on
   `main`, and push. Check CI went green.
4. **Send judgement calls back or decide them.** Agents list the choices they
   made. Accept, correct with a follow-up message to the same agent, or put the
   question to the owner if it is a music or product decision.
A worked example of a brief is `docs/briefs/lesson-author.md`, which every
lesson-writing agent was given along with a short message naming its worktree
and its lessons.

5. **Collect platform gaps.** Lesson authors and builders repeatedly report the
   same missing capabilities. Gather them and fix them in one platform task
   instead of working around them lesson by lesson.

**Choosing a model for a task.** The owner wants the cheapest model that will do
the job reliably. With Opus 5.5 as the strongest model available:

| Use | For |
| --- | --- |
| Opus | Architecture and contract design; security design and review; diagnosing a hard bug; any design that several tasks will build on; checking musical correctness of advanced harmony; orchestration and final review |
| Sonnet | Building a component, feature, game or page from a clear brief; writing lessons from the authoring guide; writing tests; most debugging |
| Haiku | Scaffolding; mechanical edits from an explicit list; glossary and data entry in a fixed format; config-only additions |

Haiku has succeeded here on: the project scaffold, three simple question types,
92 glossary entries, and a list-driven edit across eleven lesson files. Escalate
a task one level only after it has failed its acceptance tests twice.

**The usage limit.** The owner's plan has a five-hour usage window. Three Sonnet
agents in parallel exhaust it in roughly an hour and a half. When it is hit,
agents stop with an error and keep their work; they resume when sent a message
after the reset. Nothing wakes a session automatically at the reset: a scheduled
self-reminder was tried and arrived ten hours late. The owner sends a one-word
message ("resume") when he can. Tell agents to commit finished pieces as they go
so an interruption costs less.

**Environment notes from the cloud workspace used so far** (may differ for you):
- Playwright cannot download browsers; `/usr/bin/google-chrome` works with
  `PW_CHROME_PATH`. GitHub's CI downloads Chromium normally.
- A Playwright script that does not call `browser.close()` hangs the shell.
  Wrap scripted runs in `timeout`.
- After moving routes, delete `.next` before `typecheck` or `build`.
- GitHub's CI machines use wider fonts than the workspace. Layouts that only
  just fit locally can overflow there.
- Remove finished worktrees; each holds its own `node_modules` and the disk fills.

## 7. Known gaps and defects (the backlog)

Nothing here stops the site working. Roughly in order of how much it matters.

**Teaching quality**
1. ~~Dynamics and tempo changes cannot be heard.~~ **Done (18 Nov)**: the
   expression system (`docs/expression.md`) plays dynamics, hairpins,
   articulation, pauses, tempo changes and repeats.
2. ~~Musical signs cannot be drawn.~~ **Done (18 Nov)**: the stave draws every
   marking in `docs/expression.md`; see `/dev/expression`.
3. ~~The signs lesson teaches 13 terms.~~ **Done (18 Nov)**: the terms lessons
   are now four: `g1-terms-01-loud-and-soft`, `g1-terms-02-fast-and-slow`,
   `g1-terms-03-smooth-short-and-held`, `g1-terms-04-repeats-and-road-signs`.
   Remaining gaps: cantabile and dolce are taught in words only; moderato,
   allegretto and lento likewise; lessons 1 and 2 introduce 10 and 12 terms
   (the guide says six at most); there are no terms-strand generators.
4. ~~No question type for bar lines, beaming, writing key signatures or
   finding a feature.~~ **Done 19 Nov**: `place-bar-lines`, `fix-beaming`,
   `write-key-signature`, `find-in-passage` and three generators
   (`docs/question-types-2.md`, `docs/question-payloads.md` 2.10 to 2.13).
   They are in eight Grade 1 drafts (Q3). `Bar.beams` now lets any
   question show a wrongly beamed bar.
5. **`g1-pitch-03-middle-c-and-ledger-lines` goes to two ledger lines**, which
   may be beyond Grade 1. The owner has been told and has not ruled.
6. **Semiquaver tapping may be too hard:** generated rhythms can reach 12
   semiquavers in a bar at 60 bpm. The owner has been told and has not ruled.
7. **Listening questions have no text alternative**, which excludes deaf
   learners from them. Needs a product decision.

**Platform**
8. **Piano samples.** The engine loads samples if `/audio/piano/manifest.json`
   exists (format `{"files":["A0.mp3", ...]}`), else uses the synth. The
   Salamander Grand Piano set in the GitHub repo `Tonejs/audio` (folder
   `salamander`) is about 1.9 MB for the 30 files needed; its README says
   "Licence: CC-by" with a link to CC BY 3.0, author Alexander Holm. Adding it
   needs the owner's go-ahead and an on-site credit.
9. ~~The rhythm pad has no way to be started by its parent.~~ **Done 19 Nov 2026**: `ref`/`autoStart`, `chrome="minimal"` and a parent-owned `PadClock` (one unbroken click across rhythms); Tap It uses them, no auto-click or CSS hiding (`docs/rhythm-pad.md`).
10. **Generator limits:** `interval-place` cannot ask for an octave;
    `same-note-other-clef` has only five usable notes; `play-scale-or-triad`
    takes natural tonics only; `complete-the-bar` and `choose-note-value` need
    at least three note values.
11. **Engine limits to revisit at Grades 4 and 5:** chromatic scales use sharps
    up and flats down (odd in sharp keys); Roman numerals in minor keys cover
    harmonic-minor chords only (G major in A minor cannot be named).
12. **Done (17 Nov).** **Mock test:** a C major "which key signature" question shows an empty
    stave; an ordering question left in its starting order counts as unanswered.
13. **Done (17 Nov).** **Glossary rewordings wanted by Term Blitz:** `line` (its meaning contains
    "lines", so the game cannot ask it; changing it means updating three Term
    Blitz tests that expect it to be unaskable), `crotchet` (first sentence also
    fits a quaver), long first sentences for `triad`, `interval`, `natural`,
    `accent`, `ledger-line`. Missing entries: `8th`, `dynamics`, `hairpin`.
14. **Done (17 Nov).** **US terminology leaks:** the word "stave" in note-on-stave feedback and in
    the `name-note-on-stave` prompt is not swapped to "staff".
15. **Done (17 Nov).** **Skill labels are bare** ("Signature: Read") because they are derived from
    the id. An override list would read better.
16. **Done (17 Nov).** **The dashboard is a sparse single column on a desktop screen.**
17. **Done (17 Nov).** **Test hooks** (`__mockPaper`, `data-test-correct`) remain as inert strings
    in production bundles.
18. **Dependency audit warnings** from `npm ci` have not been looked at.

**Before real users sign up**

0. **Apply `supabase/migrations/0002_auth_throttle.sql`** in the SQL Editor (see "Apply 0002" in
   `supabase/README.md`), then **turn accounts on in Vercel's Preview environment only** to test:
   `NEXT_PUBLIC_ACCOUNTS_ENABLED=1` (read at build time, so redeploy the preview). Steps and a test
   checklist are in `docs/accounts-build.md`. Never set it on Production before item 24 is done. Open
   points from P1-02: the real Supabase has not been exercised (error codes, `@supabase/ssr` cookies,
   `signOut(..., 'others')`); the session cookie holds the synthetic address (httpOnly; see the doc); the
   per-IP failure limit is 20, not 5, because schools share addresses; privacy page must mention the
   session cookie.
19. ~~Supabase's public sign-up must be switched off~~ **Done 22 Nov 2026** by
    the owner (Authentication, Sign In / Providers). All accounts are created by
    our own server routes with the secret key.
20. **Scores are reported by the browser and can be forged.** This matters
    before any leaderboard exists.
21. **Only `attempts` has a rate cap** in the database; game scores, mock
    results and lesson progress do not.
22. **Two people claiming the same code name at the same instant** is untested
    (the test database has one connection). Test it on a real database.
23. **No real screen reader has been used.** `docs/accessibility.md` has a
    VoiceOver and NVDA script for a person to run.
24. **A legal check** of the children's data design is outstanding. Draft
    `/privacy` and `/terms` pages exist (19 Nov), marked as drafts; their
    "who we are" contact is a placeholder until the owner names the data
    controller. Settings can clear everything saved on the device.
25. **Multiple-choice "Correct answer" chip overlaps the stave** of a passage
    option at 390 px (found 19 Nov in the landing demo). Notes stay visible.
26. **Fix-beaming gap markers are busy**: joined gaps show a line and diamond
    on top of the beam. Readable; could be quieter. The owner has been told this is not legal advice.

## 8. What to do next

### State at 23 Nov 2026

- Accounts (P1-02) VERIFIED by the owner on Preview against the real Supabase
  project: under-18 and adult sign-up, sign-out, sign-in, recovery with the code
  (new password and new code issued). Production still has the switch unset.
- Bug found and fixed on the real project: Supabase Auth writes app_metadata
  after inserting the user, so 0001's trigger saw none (profiles had no code
  name and the default age band). Migration 0004 copies it across on update and
  repaired the two existing accounts; sign-up now checks the name landed. The
  fake Supabase in tests now inserts then updates, like the real service.
- Migrations applied to the real project: 0001, blocked-names seed, 0002, 0003,
  0004. `DB_QUESTION_TYPES` includes all thirteen question types.
- Preview is reached through Vercel, Deployments, newest Preview, Visit (long
  branch URLs are shortened by Vercel; do not guess them). Pushing main to the
  `accounts-preview` branch (force) rebuilds it.
- P1-17 security fixes are built (not merged by this task); see the next section for what the owner must do.
- Still to test on Preview: P1-03 progress saved to the account (two devices,
  offline then online, guest merge, sign-out on a shared device), per
  `docs/accounts-build.md`.
- P1-16 (export and delete) is built and waiting for its Preview test: download a
  file and read it; delete a test account and check Supabase Authentication,
  Users and a SQL count that nothing remains. Steps in `docs/accounts-build.md`,
  "How the owner tests P1-16 on Preview".

### 0005 to apply, and dashboard settings to check (P1-17)

- **Apply `supabase/migrations/0005_security_hardening.sql`** in the SQL Editor (steps: `supabase/README.md`, "Apply 0005"),
  after merging the fixes. Until then, with accounts on, sign-in, recovery and saving progress are refused (fail closed).
  Production is unaffected: accounts are off there.
- Dashboard settings that code cannot set (check each on the real project; some depend on the plan):
  1. Authentication, Rate Limits: keep Supabase's limits on; they sit under ours. Our routes call Supabase from Vercel
     servers, so every request looks like one address to Supabase; if "Sb-Forwarded-For" support is offered for the secret
     key, pass the learner's address there so Supabase's per-address limits are not shared by the whole site.
  2. Authentication, Sessions: set a time-box (for example 30 days) and an inactivity timeout (for example 7 days) if the plan
     allows (it may be Pro only). Our cookies already end when the browser closes.
  3. Authentication, Passwords: turn on leaked-password protection if the plan allows (our own list covers the commonest).
  4. Authentication, Sign In / Providers: **anonymous sign-ins OFF**; email sign-up is only used through our server.
  5. Authentication, Emails: **secure email change ON** (for the later adult email accounts).
  6. Vercel, Settings, Deployment Protection: **on for Previews**, so account Preview builds are not open to the public.
- Open question for the real project: confirm `postgres` can delete from `auth.sessions` and `auth.refresh_tokens` (0005's
  recovery function); do a recovery on Preview with a second browser signed in and check that browser is signed out.

### Waiting on the owner

| Needed | Unblocks |
| --- | --- |
| ~~A Supabase project~~ Created 22 Nov 2026 in eu-west-2 (London): project ref `rnefqcvlxbvhacyjmknz`, URL `https://rnefqcvlxbvhacyjmknz.supabase.co`, publishable key `sb_publishable_CviqSlSdQVKOzn13uTzyPA_hKmthc9Q` (safe to publish). Vercel env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (secret, Vercel only; Supabase's new key names replace anon and service_role) | P1-02, P1-03, P1-16, P1-17 |
| Review of the 36 draft lessons (`/learn` lists them with Draft badges) | Publishing Grade 1; the Phase 1 gate |
| Answers to four questions at the end of `docs/accounts-and-data.md`: lost recovery code, deleting inactive accounts, who sends marketing email and is the data controller, whether teachers will see pupils' progress | Final account build and privacy wording |
| A listen on his phone to the four terms lessons (rit in lesson 2, accents in lesson 3, staccato, pp) | Tuning the expression numbers in `docs/expression.md` |
| Whether to keep the terms lessons split in four or merge back | Lesson structure |
| Confirm the beaming rule now marked: a multi-beat group (four quavers across beats 1 and 2 of 4/4; a bar of quavers in 2/4 or 3/4) may be beamed as one group or one beat at a time, but not a mixture | `fix-beaming` marking |
| Rulings on backlog items 5, 6 and 7 | Those lessons |
| Go-ahead on piano samples (item 8) | Real piano sound |
| Business model (free, subscription after Grade 1, school licences) | Whether payments are built at all |
| Final name and brand | Landing page and launch |

### Can be done now without him, in suggested order

1. ~~Audio and notation for terms and signs~~ Done 18 Nov (E1 to E4 in
   `docs/expression.md`).
2. ~~Missing question types~~ Built 19 Nov, and added to eight Grade 1 drafts
   (Q3): bar lines in rhythm-02 and 05, beaming in rhythm-04 and 10, find the
   dotted notes / tied notes in rhythm-07 and 08, writing key signatures in
   scales-keys-02 and 03.
3. ~~Landing page demo (P1-13)~~ Done 19 Nov.
4. **Rhythm pad start control and continuous metronome** (backlog 9), then
   simplify Tap It. Sonnet.
5. ~~Small fixes (backlog 12 to 17)~~ Done 17 Nov.
6. ~~Privacy policy and terms drafts~~ Done 19 Nov (no cookie notice is needed
   while the site uses no cookies; revisit when accounts arrive).
7. **Phase 2 work that needs no database** (see below): the mastery model
   design, Grades 2 and 3 engine extensions and generators, and lesson writing.

### When Supabase exists

1. ~~Apply `supabase/migrations/0001_init.sql` and the blocked-names seed; switch off public sign-up.~~ Done
   22 Nov. Still to apply: `0002_auth_throttle.sql`.
2. P1-02: DONE for code names (see section 4 and `docs/accounts-build.md`); still to do: adult email
   sign-in and the marketing box, after the owner has tested code names on Preview.
3. P1-03: DONE (see section 4 and `docs/accounts-build.md`); still to do: the owner's Preview test, and a
   migration `0003` adding the four missing `question_type` values if attempts at those types should be stored.
4. P1-16: export and delete in Settings DONE (see section 4 and `docs/accounts-build.md`; still to do: the owner's Preview test); privacy-friendly analytics still to do.
5. Run the concurrency test for code names on the real database.
6. P1-17: security review (Opus), performance check, release.

### Later phases, from the plan

**Phase 2, retention:** design the mastery model (strength per skill, fading,
spaced review, the rule for "mastered"); build it with a review queue and strand
meters; Daily Mix and a mistake bank; XP, levels, streak with a weekly freeze,
weekly goals, badges; placement test; engine and generators for Grades 2 and 3
(minor keys, compound time, interval quality); about 48 lessons; glossary and
mock papers; games Bar Builder and Spot the Error; library search and
installable offline mode. Gate: learners return in a second and third week
unprompted.

**Phase 3, Grade 5 ready:** engine and generators for Grades 4 and 5 (C clefs,
double accidentals, chromatic scale, compound intervals, chords and inversions,
cadences, transposition, irregular time); about 66 lessons; games Interval Ears,
Chord Stack, Cadence Call, Transposer; explorer tools (circle of fifths, scale
explorer, chord builder, interval visualiser, score player); guitar fretboard
and MIDI input; readiness score and certificates; payments if the business
model needs them. Gate: learners pass a real Grade 5 exam.

**Phase 4, advanced harmony (Grades 6 to 8):** design the part-writing rule set
and how open-ended work is marked; four-part editor; voice-leading checker;
figured bass checker; melody composer; chromatic harmony in the engine; about
120 lessons; every worked example verified by the strongest model available;
Parallel Patrol game. This is the riskiest phase: a wrong model answer teaches
errors, and the work cannot be marked right-or-wrong like Grade 1.

**Phase 5, schools:** permissions for teachers and classes; teacher dashboard,
classes and assignments; content admin; school licences; parental consent flow
if needed.

## 9. Lessons learned

- **Passing tests did not mean it worked.** Multiple-choice questions shipped
  without their notation because no test looked at the screen. The owner found
  it on his phone. The Playwright sweep now checks that notation is visibly
  drawn. Add a browser assertion for anything new that a learner must see.
- **Phones differ from laptops.** Sound was silent on iPhones because audio must
  start inside a tap, on the tap's end, and follows the silent switch unless the
  page asks otherwise. See `src/audio/engine.ts` and `gesture-unlock.ts` before
  touching audio start-up.
- **Agents report honestly when asked to.** Every brief asks for "what was not
  verified" and "judgement calls". Those sections found most of the real issues.
  Keep asking.
- **Lesson authors work around the platform quietly unless told to report.**
  Asking each to list "what stopped you teaching this the way it should be
  taught" produced the platform backlog.
- **Renaming an exported symbol breaks branches in flight.** Check other
  worktrees before renaming anything shared.
- **The owner reads on his phone and is busy.** Lead with the outcome, keep it
  short, say what he needs to do, and never claim something works that has only
  been tested in a simulated browser.

## 10. For whoever picks this up

The owner asked for this handover because he is losing access to the model that
orchestrated the first four days and means to bring it back later. Leave the
project as you would want to find it: keep this file current when the state
changes (section 1, the tables in section 4 and the backlog in section 7), keep
`main` green, and keep the owner's decisions in section 3 up to date as he makes
more.
