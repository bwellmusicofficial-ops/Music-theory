# Brief: writing lessons for Music Theory Now

You are writing publishable lessons for an interactive music theory learning site for ages 11 and up,
aligned to the ABRSM-style graded theory progression, in UK English with a US terminology switch.
Your worktree, branch and the exact lessons to write are given in the message that sent you here.

## Read first, in this order (all in your worktree)
1. docs/lesson-authoring-guide.md: ALL of it. It is the rulebook: the six steps, voice and tone, question
   choice, hints and reasons, copyright rules, UK/US terms, ids, skill ids, the lesson lists (section 10, which
   gives each lesson's id, title, strand, unit and summary), the pre-publication checklist (section 11) and the
   annotated exemplar (section 12).
2. content/lessons/1/rhythm-1/g1-rhythm-01-crotchets-and-minims.json: the exemplar. Your lessons must match its
   quality, depth and shape. It has been tested with real learners and approved.
3. src/lesson/schema.ts: the lesson schema your files must satisfy (note `status`, `usTitle`, `usSummary`,
   challenge `count`, and the 60-word limit per text block).
4. docs/question-payloads.md: the exact payload for each of the nine question types, the passage rules in 1.3
   and the text rules in 1.4.
5. docs/generators-grade-1.md: start with the "Author's quick reference" table at the top. It lists every
   generator, what it asks, and a copy-pasteable `generator` object. Use these for variety in practice and
   especially in challenge pools.
6. content/glossary/start.json and content/glossary/1.json: every glossary id you may link to.
7. src/lesson/content.test.ts: the automated checks your files must pass.

## Rules
- Write ONLY the lesson files you were given, at content/lessons/<grade>/<unit>/<lesson-id>.json, where <grade>
  is `start` or `1`. Do not edit any other file: not the glossary, not the exemplar, not code, not docs. If you
  need a glossary term that does not exist, do not link it: write the sentence so the term is explained in
  words, and list the missing term in your report.
- Every lesson has `"schemaVersion": 1` and `"status": "draft"`.
- Use the id, title, strand, unit and summary from the lesson list in section 10 of the guide; `order` is the
  lesson's position within its unit; `prerequisites` lists the lesson(s) immediately before it in the list
  where that helps (ids exactly as in the list; a prerequisite may be a lesson that another author is writing).
- `skills`: only skill ids that exist in the guide's section 9 (Start here and Grade 1 tables). Every question's
  `skill` must be in the lesson's `skills`.
- Sound first: the learner hears and plays the idea before it is named. Start here lessons 1 to 8 show NO
  stave anywhere (no passage exhibits, no stave question types): use the keyboard, the rhythm pad, by-ear
  questions and text.
- Never use a musical term before the lesson (or an earlier lesson in the list) has taught it, except as a
  glossary link in a sentence that also explains it in plain words.
- Music references: well-known music by TITLE only, from a mix of styles (pop, film, games, classical, folk).
  Never quote lyrics. Never notate a copyrighted melody. Every notated passage is original (write your own) or
  from clearly public-domain music (traditional tunes, composers who died before 1900); say which in your report.
- Every notated passage must obey the passage rules: bars exactly full for the time signature, correct
  grouping, pitches within the stave and at most the ledger lines the lesson has taught. Count every bar.
- Every wrong option has its own specific reason, written as the guide's section 5 says. Hints nudge without
  giving the answer.
- Practice: 3 to 5 questions, at least three different question types, at least one generated. Challenge: a
  pool of at least 6 questions across at least three types, mostly generated so rounds vary; `seconds` 60 to 90;
  `count` 6 to 10; `passMark` 0.8 unless the guide says otherwise.
- The name step has 1 to 3 cards plus a genuinely different "explain it another way" alternative.
- Recap: 2 to 4 points a learner could revise from.
- US terminology: follow the guide's section 7 exactly (link every swappable term; add `usTitle` and
  `usSummary` when the title or summary contains a swappable term).
- Accuracy matters more than charm. If you are not certain a musical statement is correct, check it against the
  engine (you can run small scripts with `npx tsx` importing from src/engine) or leave it out.

## Checks before you finish
1. `npm ci` (once), then `npm test -- src/lesson` must pass, and `npm run lint`.
2. Go through the guide's section 11 checklist for each lesson and fix what fails.
3. Re-read each lesson top to bottom as an 11-year-old who has done only the lessons before it. Fix anything
   they could not follow.
4. Play each generated question you used: run a short script that resolves each `generator` object with 5 seeds
   through src/lesson/generators and prints the prompt and options, and confirm they fit the lesson's level
   (no note values, keys or symbols the lesson has not taught). Adjust params if not.

## Commit and report
Commit on your branch with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`, message
starting with your batch name. Do NOT push.
Report: commit hash; test results; for each lesson, one line on the hook idea, the question types used in
practice and challenge, and the source of each notated passage (original / public domain, with the tune named);
missing glossary terms; anything in the guide, payload spec or generators that stopped you teaching the idea
the way it should be taught; and any musical statement you were unsure about.
