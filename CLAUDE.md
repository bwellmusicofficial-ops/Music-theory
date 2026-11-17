# Music Theory Now: instructions for any Claude session working in this repo

Read `docs/handover.md` before doing anything. It holds the full state of the
project, the owner's decisions, what is blocked and what to do next. This file
is the short version: the rules that must hold on every change.

## What this is

An interactive music theory learning website taking complete beginners (age 11+)
to Grade 8, aligned to the ABRSM-style progression, UK terminology by default
with a US switch. It must feel like a modern music app, not a textbook. Used
mostly on phones. Live at https://music-theory-five.vercel.app (Vercel deploys
`main` automatically).

The owner, James, is a music teacher and is the project's music specialist. He
is not a professional developer. Write to him in plain English, lead with the
outcome, and say plainly what was and was not verified.

## Commands

```bash
npm ci
npm run dev          # local site on :3000
npm run lint
npm run typecheck
npm test             # Vitest: about 4,700 unit and component tests, ~4 min
npm run build        # delete .next first if routes moved: rm -rf .next
npm run e2e          # Playwright, real browser, ~11 min
npm run e2e:sweep    # every question in every lesson in a real browser, ~25 min
```

Real-browser tests need a browser. Where Playwright cannot download one, use an
installed Chrome: `PW_CHROME_PATH=/usr/bin/google-chrome npm run e2e`. The dev
harness routes used by the tests exist only when
`NEXT_PUBLIC_ENABLE_DEV_ROUTES=1` (the Playwright web server sets it).

## Rules that must hold

1. **Nothing merges to `main` unless lint, typecheck, the full `npm test` and
   `npm run build` pass.** For anything a learner sees, also run `npm run e2e`.
   CI on GitHub runs all of these on every push; check it went green.
2. **Look at it in a real browser before calling UI work done.** Unit tests in
   jsdom once passed while multiple-choice questions were not drawing their
   notation on the live site. Take phone-size (390x844) screenshots and read them.
3. **Music must be correct.** Every spelling, key signature, scale, interval and
   duration comes from the engine in `src/engine` (`pitch`, `rhythm`), never
   typed from memory. When unsure of a convention, ask the owner: he rules on
   music. His rulings so far are listed in `docs/handover.md` section 3.
4. **New lessons are `"status": "draft"`.** Only the owner's review makes a
   lesson `"reviewed"`. Never mark a lesson reviewed yourself.
5. **Contract files are changed deliberately, not in passing:**
   `src/engine/types.ts`, `src/engine/api.ts`, `src/lesson/schema.ts`,
   `src/lesson/contracts.ts`, `src/lesson/questions/shared.ts`. A change there
   must stay backward compatible with existing lesson JSON, or migrate it.
6. **Dependency directions** (see `docs/architecture.md`): `src/engine` imports
   nothing from the app; only `src/components/stave` imports VexFlow; only
   `src/audio` imports Tone.
7. **Children use this site.** Collect no personal data that is not needed, add
   no third-party trackers, no chat or public profiles. The account design in
   `docs/accounts-and-data.md` is the specification; do not weaken it.
8. **No secrets in the repo or in chat.** Supabase service-role keys live only
   in server environment variables.
9. **Copyright.** Refer to well-known music by title only. Never quote lyrics or
   notate a copyrighted melody. Notated examples are original or public domain.
10. **Accessibility is part of done:** keyboard operable, visible focus, never
    colour alone, touch targets at least 44px for primary actions, reduced
    motion respected. `npm run e2e` includes axe checks that must stay at zero.

## How work has been organised

Large tasks are split into briefs and given to sub-agents, each in its own git
worktree and branch, owning named folders only. The orchestrating session writes
the brief, reviews the result (including sampling musical output by hand), runs
the checks, merges and pushes. `docs/handover.md` section 6 describes the method
and the model to use for each kind of task.
