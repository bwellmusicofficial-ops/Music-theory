# Lesson authoring guide

Status: P0-14. Read this before writing any lesson. It is written so that an
author who has never seen the project (a music teacher or an AI agent) can
write a lesson that passes review first time.

You will also need:

- `src/lesson/schema.ts`: the shape of a lesson file. The comments are short
  and worth reading in full.
- `docs/question-payloads.md`: the exact data each question type needs.
- `content/lessons/1/rhythm-1/g1-rhythm-01-crotchets-and-minims.json`: the
  exemplar. Section 12 walks through it. When this guide and your instinct
  disagree, copy the exemplar.

Contents: 1 What a lesson is · 2 The six steps · 3 Voice and tone ·
4 Choosing question types · 5 Hints and wrong-answer reasons · 6 Musical
examples and copyright · 7 UK and US terms · 8 Ids and files · 9 Skill ids ·
10 Lesson lists · 11 Pre-publication checklist · 12 The exemplar, annotated

## 1. What a lesson is

A lesson teaches **one idea** in 5 to 8 minutes to someone aged 11 or over who
has never studied music theory. It is a JSON file with six steps, always in
this order: hook, explore, name, practice, challenge, recap.

Five principles decide every choice you make.

1. **Sound first.** The learner hears and plays the idea before anyone names
   it. No term appears before the name step.
2. **Do, don't read.** No text block is longer than 60 words (the schema
   rejects it). Every screen has something to press, tap or play.
3. **Real music.** Point to music the learner knows: pop, film, games, hip-hop
   and jazz as well as classical. Titles only (section 6).
4. **Talk like a person.** Direct, friendly, lightly funny, addressed to
   "you". Never patronising. Reading age about 11.
5. **Wrong answers teach.** Every wrong answer gets a specific reason, never
   just "Incorrect".

One idea means one. "Crotchets and minims" is one idea (two lengths compared).
"Crotchets, minims, semibreves and their rests" is three lessons. If your recap
needs more than four points, split the lesson.

Time budget:

| Step | Time | Learner mostly |
| --- | --- | --- |
| Hook | 20 to 30 seconds | listens |
| Explore | 60 to 90 seconds | plays |
| Name | 60 to 90 seconds | reads a little, listens |
| Practice | about 2 minutes | answers 3 to 5 questions |
| Challenge | 60 to 90 seconds | answers against the clock |
| Recap | 20 seconds | reads |

## 2. The six steps

### 2.1 Hook

**Purpose:** make the learner want the idea before they have it. One short
block of text and something to hear. It should take under 30 seconds.

A good hook asks a question the lesson will answer, or shows the idea at work
in music the learner already knows. It uses everyday words only.

| Do | Don't |
| --- | --- |
| "First-aiders learn to press on the chest in time with *Stayin' Alive*. Why that song?" | "In this lesson you will learn about the pulse, crotchets and minims." (a contents list, and three terms nobody has taught) |
| Give an `exhibit` the learner can play straight away. | Leave the screen with nothing to press. |
| End on a question or a thing to try. | Explain the answer. That is the name step's job. |
| Mention one well-known piece, by title. | List five pieces to show range. |

### 2.2 Explore

**Purpose:** let the learner produce the idea with their own hands before it
has a name. Set `instrument` to `keyboard`, `stave` or `rhythm-pad`. The
`text` says what to try. The `goal` says what must happen before they can move
on, in one short sentence that starts with a verb.

Design the task so the learner cannot finish it without meeting the idea. In
the exemplar, tapping every click and then every other click *is* the
difference between a 1-beat and a 2-beat note; the learner has felt it before
they read a word about it.

| Do | Don't |
| --- | --- |
| "Tap once on every click. Then tap, let one click go by, and tap again." | "Tap crotchets, then minims." (terms not taught yet) |
| Goal: "Tap along with all 8 short notes, then all 4 long ones." | Goal: "Explore the rhythm pad." (cannot be checked, and gives no reason to stop) |
| Use plain words for the idea: short, long, high, low, step, jump, the tick. | Sneak the term in "just this once". |
| Keep it to one task with one twist. | Give three tasks. That is a practice step. |

With `instrument: 'rhythm-pad'`, give an `exhibit` of kind `passage` with a
`tempo`: it is the rhythm the pad plays the click for and listens for. With
`keyboard`, give a `keyboard` exhibit that sets the range and any highlighted
keys.

### 2.3 Name

**Purpose:** now give the idea its name, show how it is written, and say in
one sentence what it means. One to three `cards`, then one `alternative`.

Each card makes one point and links back to what the learner just did ("That
steady tick you tapped is the pulse"). Put the new term in a glossary link the
first time it appears (section 7). Give each card an exhibit when there is
something to see or hear.

The **alternative** is what the learner sees when they press "explain it
another way". It must use a different route to the same idea, not the same
words rearranged. If the cards count, the alternative moves; if the cards show
notation, the alternative tells a story or uses the keyboard.

| Do | Don't |
| --- | --- |
| "A note that lasts 1 beat is a crotchet: a filled-in head with a stem." | "The crotchet, also known as a quarter note, derives from the Old French *crochet*..." (true, and no use to a beginner) |
| Give a way to remember it: "Hollow means hold." | Give three ways to remember it. One sticks. |
| Introduce a term only if the lesson uses it afterwards. | Mention terms "for completeness". |
| Alternative: "Think of walking. A crotchet is one step: say 'walk'." | Alternative: "In other words, a crotchet lasts for one beat." (same explanation again) |
| Say honestly when something is left for later: "More on them next lesson." | Pretend the two 4s at the start are not there. |

### 2.4 Practice

**Purpose:** let the learner use the idea with help close by. Three to five
questions, not timed, with a hint after the first wrong answer and a reason
for every wrong answer.

- Use at least three different question types, and make at least one question
  `generated` so that a learner who repeats the lesson gets fresh material.
- Order from easiest to hardest: recognise, then choose, then produce.
- Every skill in the lesson's `skills` list gets at least one practice
  question.
- Every question has a `hint`.
- Each question tests one skill, the one in its `skill` field.

| Do | Don't |
| --- | --- |
| "This bar needs 4 beats but only has 2. Add **one** note to fill it." | "Complete the following bar with the appropriate note value." |
| Ask about what this lesson taught. | Ask about the clef, the key or anything else on the stave that has not been taught. |
| Make wrong options things a learner would really think. | Add joke options. They waste a turn and teach nothing. |
| Let the learner tap, play or build at least twice. | Write four multiple-choice questions in a row. |

### 2.5 Challenge

**Purpose:** decide whether the lesson is complete. A scored round of 60 to 90
seconds drawn from a pool of questions. Passing (default 80%) completes the
lesson.

- Write a pool of **at least 6** questions (the schema's minimum of 3 is too
  few for a replay to feel different). Each round **samples** `count` questions
  from the pool with a seeded shuffle, so a retry asks a different selection;
  it is not the first `count` questions in order. No pool entry is asked twice
  until the whole pool has been asked, and the round always has at least two
  question types when the pool has them. A bigger, varied pool therefore gives
  more different rounds. Generated questions get a fresh seed every time they are
  drawn, so include at least one.
- The challenge is the same difficulty as the last practice question, not
  harder. It checks; it does not teach or trick.
- Questions must be answerable in about 10 seconds each. Keep tapping
  questions to two bars.
- Do not introduce a question type that is hard to work out under time
  pressure. If a type did not appear in practice, its prompt must make the
  task obvious ("Tap it", "Which bar did you hear?").
- Cover every skill in the lesson at least once in the pool.
- Hints are still required: they appear in the review after the round.
- Use 90 seconds when the pool includes tapping or listening, 60 when it is
  all quick choices.

| Do | Don't |
| --- | --- |
| Reuse a practice format with new content. | Copy a practice question word for word. |
| Mix quick questions (choices) with doing questions (tap, fill). | Fill the pool with eight tapping questions; the learner will only reach four. |
| Keep prompts under 20 words. | Put a paragraph in a timed prompt. |

### 2.6 Recap

**Purpose:** the one screen the learner keeps. Two to four `points`, each a
complete sentence that still makes sense a month later with no lesson around
it. One exhibit that shows the idea.

| Do | Don't |
| --- | --- |
| "A minim has a hollow head and a stem. It lasts 2 beats: hollow means hold." | "Well done! You smashed it!" (says nothing they can use later) |
| Repeat the memory hook from the name step. | Add a new fact. If it matters, it belonged in the name step. |
| One point per new term or rule. | "Remember what we said about minims." (they will not) |

## 3. Voice and tone

The reader is 11 or older, bright, new to this, and possibly an adult. Write
the way a good teacher talks to one student at the piano.

Rules:

1. **Say "you".** Never "the student", "we" or "one".
2. **Short sentences, common words.** If a 10-year-old would not know the
   word, change it. Aim for under 15 words a sentence.
3. **Present tense, active verbs.** "Tap the pad", not "the pad should be
   tapped".
4. **Lightly funny, never zany.** One light touch per lesson is plenty. No
   puns that need explaining. No exclamation marks in reasons; at most one in
   a whole lesson.
5. **Never patronising.** No "Easy, right?", "Simple!", "As you surely know",
   "Don't worry". Do not praise before the learner has done anything.
6. **No term before it is taught.** A term is taught when it appears in this
   lesson's `newTerms` (and then only from the name step on) or in an earlier
   lesson in the lists in section 10. Before that, use everyday words.
7. **Be exact about music.** Simple is good; false is not. Say "In this lesson
   every bar holds 4 beats", not "A bar has 4 beats".
8. **Numbers as digits** for beats and counts ("2 beats", "4 crotchets").
9. **No emoji, no slang that will date, no brand names.**
10. **British spelling.** Double quotes for speech. Italics (`*...*`) for
    titles of pieces. Bold (`**...**`) for the one word in a prompt the learner
    must not miss.

Before and after:

| Before | After | Why |
| --- | --- | --- |
| "The pulse is defined as the regular underlying beat of a piece of music, against which rhythm is measured." | "That steady tick you tapped is the pulse. Each tick is one beat." | Starts from what the learner did. No "is defined as". |
| "Well done for getting this far! Now let's see if you can tackle something a little bit trickier, shall we?" | "Your turn." | Filler and a pat on the head. Cut to the task. |
| "Minims are easy! They just last for two beats." | "A note that lasts 2 beats is a minim." | "Easy" and "just" tell a struggling learner they are slow. |
| "Identify the note value that corresponds to a duration of two beats." | "Which note lasts 2 beats?" | Reading age. Same question, a third of the words. |
| "Incorrect. Try again." | "That head is hollow, so it is a minim and lasts 2 beats. The crotchet has a filled-in head." | Says what they picked and what to look for. |
| "A bar has four beats." | "Every bar in this lesson holds 4 beats." | The first is false in 3/4, and they will meet 3/4 next week. |
| "OMG this next bit is going to blow your mind!!!" | "Then get sneaky: tap, let one click go by, and tap again." | Light, not loud. The fun is in the task. |

## 4. Choosing question types

Ask what the learner should be able to **do** with the idea, then pick the
type that makes them do it.

| The learner should be able to | Use | Notes |
| --- | --- | --- |
| Name a written note | `note-on-stave` (identify) | Generate with `name-note-on-stave`. |
| Write a named note | `note-on-stave` (place) | |
| Find a note on an instrument, play a scale or triad | `play-keyboard` | `sequence` for scales, `together` for triads. |
| Perform a rhythm, keep a pulse | `tap-rhythm` | Generate with `tap-note-values`. |
| Recognise something by its sound | `by-ear` | High or low, long or short, same or different, which bar was played. |
| Add up note lengths, use rests, fill a bar | `complete-bar` | Use `count` to force one particular answer. |
| Proofread: wrong number of beats, a wrong note, a misplaced sign | `spot-mistake` | Exactly one mistake. |
| Put things in order: lengths, pitches, the notes of a scale, sharps in a key signature | `ordering` | Needs at least three items with no ties. |
| Link symbols to names or meanings | `match-up` | Best for terms and signs: three to five pairs. |
| Recall one fact or pick one symbol | `multiple-choice` | The fallback. Use it last. |

Guidelines:

- **Prefer doing to choosing.** If a concept can be tapped, played or written,
  at least half the lesson's questions should do that. Multiple-choice is at
  most half of practice and half of the challenge pool.
- **Hear it at least once.** Every lesson has at least one `by-ear` or
  `tap-rhythm` or `play-keyboard` question, because every idea in music theory
  is a sound.
- **Generate where you can.** Reading notes and tapping rhythms are drills;
  generated questions make them endless. Author by hand when the question
  needs a particular trap or a particular tune.
- **Match the type to the grade.** Do not use `ordering` with two items or
  `match-up` when only two things have been taught; use a plain choice.
- **Only show what has been taught.** A passage in C major, treble clef, 4/4
  is the neutral setting. For rhythm questions put every note on B4 so pitch
  is not a distraction.
- **Distractors.** A wrong option is good when a learner with one specific
  misunderstanding would choose it. Write the misunderstanding down first,
  then the option, then its reason.

## 5. Hints and wrong-answer reasons

These are different things, shown at different moments.

**The hint** is in the question's `hint` field. It appears after the first
wrong answer, before the second try. It points at the method and never gives
the answer.

| Good hint | Bad hint | Why |
| --- | --- | --- |
| "Two crotchets make 2 beats. Which single note is worth the 2 beats still missing?" | "The answer is a minim." | Gives it away. |
| "Listen for the long note. Does it come first or last?" | "Listen carefully." | Says nothing about what to listen for. |
| "Count each bar: 1 for every filled-in note, 2 for every hollow one." | "Remember what you learned about note values." | Names no method. |

A hint is one or two sentences. It may repeat the memory hook from the name
step. It may ask a question.

**The reason** is shown with every wrong answer. For `multiple-choice`,
`by-ear`, `match-up`, `ordering` and `spot-mistake` you write it in the
payload. For the other types the question type writes it from templates
(`docs/question-payloads.md`), and you write nothing.

A reason has two parts: **what your answer actually is**, then **what the
right answer is and why**.

- "That head is hollow, so it is a minim and lasts 2 beats. The crotchet has
  a filled-in head."
- "Clip A is all short notes of 1 beat each, so those are crotchets. The
  minims are the slow 2-beat notes in clip B."
- "Long notes do not slow the pulse. The beats stay the same distance apart;
  the note just lasts for more of them."

Rules:

1. Every wrong option has its own reason, written for that option. Never copy
   one reason across options.
2. One or two sentences, 40 words at most.
3. Never only "Incorrect", "Wrong", "Not quite" or "Try again".
4. Never blame: no "You forgot", "You should have", "Careless".
5. Unlike a hint, a reason **may** give the answer. By then the learner has
   had their tries.
6. Use only taught terms, and link every term that has a US equivalent
   (section 7).
7. For `spot-mistake`, the `explanation` names the place and the fault ("Bar 2
   has 5 beats: ..."), because it is shown whichever wrong bar was tapped.
8. For `ordering`, the `reason` states the rule and the values ("Shortest to
   longest: crotchet 1 beat, minim 2 beats, semibreve 4 beats").

## 6. Musical examples and copyright

There are two kinds of example, with different rules.

**References** (naming a piece in text). You may name any well-known piece by
its title: "the opening of *Jaws*", "*Stayin' Alive*". Rules:

- Title only, in italics. Add the film, game or artist in plain words only if
  the title alone is unclear.
- **Never quote lyrics**, not even three words. Do not hide a lyric inside a
  sentence either.
- The reference must be true. If you say a song is in 3/4, check it.
- Choose pieces an 11-year-old or their parents are likely to know, and that
  will still be known in five years. A film theme outlasts this month's hit.
- Across a unit, mix the sources: pop, film, games, hip-hop, jazz, classical,
  folk. Not every example from one decade or one country.
- No songs known mainly for explicit content.
- One reference per lesson is usually enough. Two is the limit.

**Notated or played examples** (anything in a `passage`, a `keyboard` exhibit
or an `audioClip`). Everything the learner sees as notation or hears from the
site must be **public domain or original**.

- **Never reproduce a copyrighted melody, riff, bassline or chord sequence
  with its rhythm**, however short, in any key, even "simplified". If the
  learner could name the song from your passage, you have copied it. This
  includes film and game themes.
- Do not notate the rhythm of a famous copyrighted riff on one pitch either.
  Describe it in words and write your own example.
- **Public domain** means: the composer (and the lyricist, for a song) died
  more than 70 years ago, **and** you are using the original notes, not a
  later arrangement. Traditional tunes with no known author are fine
  (*Frère Jacques*, *Twinkle, Twinkle, Little Star*, *Scarborough Fair*).
  Bach, Mozart, Beethoven, Chopin, Tchaikovsky, Joplin and Holst are fine. If
  you cannot name the composer and the year of death, treat the piece as
  copyrighted.
- When you use a public-domain tune, say what it is in the card text
  ("Beethoven, *Ode to Joy*").
- **Original** means you wrote it for this lesson. This is the default.
  Original examples can be built to contain exactly the idea being taught and
  nothing else. Keep them to 1 to 4 bars, singable, ending on the key note
  unless the lesson needs otherwise.
- `audioClip` is only for recordings made for this site. Never link to or
  embed a commercial recording.

Rules for every passage:

- Every bar is exactly full (the content test checks this). The only
  exceptions are the bar a `complete-bar` question asks the learner to fill
  and the wrong bar in a `spot-mistake` question.
- Use only clefs, keys, time signatures, note values and signs taught so far.
  Before keys are taught, use C major. Before 3/4 and 2/4 are taught, use 4/4.
- Stay within the stave where you can: E4 to F5 in treble, G2 to A3 in bass.
- Set `tempo` on every passage exhibit. 72 to 100 suits most teaching
  examples. Tapping questions for beginners: 72 to 88.
- Pitches are written as engine objects:
  `{ "letter": "F", "accidental": 1, "octave": 4 }` is the F sharp above
  middle C. Middle C is octave 4.

## 7. UK and US terms

Lesson files are written once, in UK terms. The site swaps in US terms when
the learner's terminology setting is `us`. For that to work you must follow
these rules.

1. **Write UK terms**: crotchet, minim, bar, stave, tone, semitone, note
   value names, "leading note".
2. **Every time** you use a term that has a US equivalent, write it as a
   glossary link: `[[crotchet|crotchets]]`, `[[bar|bar]]`. Not only the first
   time. Unlinked text is never swapped, so an unlinked "crotchet" stays
   "crotchet" for a US learner.
3. **The shown text must be the UK term**, with at most a capital letter or a
   plural ending: `[[bar|Bars]]`, `[[minim|minims]]`. The renderer finds the
   glossary entry's `term` inside the shown text (ignoring case), replaces it
   with the entry's `us`, and keeps the rest. So `[[crotchet|crotchets]]`
   becomes "quarter notes". If you write `[[crotchet|the short one]]` nothing
   can be swapped.
   Examples in sections 2 to 5 of this guide leave the link markup out so they
   are easy to read. The exemplar file shows the real thing.
4. **Never write "a" straight before a linked quaver.** "a quaver" would
   become "a eighth note". Write "one quaver", "the quaver", "each quaver" or
   use the plural. (Every other swap up to Grade 5 is safe after "a".)
5. **Terms with no US equivalent** (pulse, beat, bar line, time signature,
   Italian terms) need a link only the first time they appear in a step, so
   the learner can look them up.
6. **Do not put the US term in the text** ("a crotchet, or quarter note").
   The setting handles it. The one exception is a lesson whose subject is the
   two naming systems.
7. **Do not combine bold or italic with a link.** The renderer styles links
   itself.
8. `title` and `summary` are plain strings and are not swapped. Write them in
   UK terms. (A fix for US titles is with the orchestrator.)
9. Every new term goes in `content/glossary/<grade>.json` with its `us` form
   if it has one. The glossary id of a note value must be its engine id
   (`semibreve`, `minim`, `crotchet`, `quaver`, `semiquaver`), because
   generated feedback links to those ids.

The US equivalents you will need up to Grade 1:

| UK (canonical) | US | Glossary id |
| --- | --- | --- |
| semibreve | whole note | `semibreve` |
| minim | half note | `minim` |
| crotchet | quarter note | `crotchet` |
| quaver | eighth note | `quaver` |
| semiquaver | sixteenth note | `semiquaver` |
| crotchet rest (and the other rests) | quarter rest | `crotchet-rest` |
| bar | measure | `bar` |
| stave | staff | `stave` |
| tone | whole step | `tone` |
| semitone | half step | `semitone` |
| note value | note value | (same) |
| bar line, time signature, key signature, tie, ledger line | (same) | |

A glossary entry looks like this. The definition follows every rule for
lesson text, including the 60-word limit.

```json
{
  "id": "minim",
  "term": "minim",
  "us": "half note",
  "language": "en",
  "definition": "A note with a hollow head and a stem. It lasts twice as long as a [[crotchet|crotchet]]: 2 beats in the music you meet first.",
  "grade": "1",
  "strand": "rhythm"
}
```

For Italian, French and German terms set `language` and leave `us` out.

## 8. Ids and files

Every new lesson file has `"status": "draft"`. Only the product owner's review
changes it to `"reviewed"`. Generators available to lessons, with their params,
are listed in `docs/generators-grade-1.md`.


- **Lesson id:** `<grade>-<strand>-<nn>-<slug>`, all lower case with hyphens.
  `<grade>` is `start` or `g1` to `g8`. `<strand>` is the strand id from
  `schema.ts`. `<nn>` is a two-digit number that counts lessons in that strand
  within that grade. Example: `g1-rhythm-01-crotchets-and-minims`.
- **File:** `content/lessons/<grade>/<unit>/<lesson id>.json`, where `<grade>`
  is the schema's grade value (`start`, `1`, ... `8`). Example:
  `content/lessons/1/rhythm-1/g1-rhythm-01-crotchets-and-minims.json`.
- **Unit id:** `<theme>-<n>`, unique within the grade: `rhythm-1`, `pitch-1`.
- **`order`:** position within the unit, from 1.
- **Question id:** unique within the lesson. Use `p<n>-<what>` for practice
  and `c<n>-<what>` for the challenge: `p3-fill-the-bar`, `c7-too-many-beats`.
- **Glossary term id:** the UK term in kebab-case: `bar-line`,
  `time-signature`, `crotchet-rest`.
- **`prerequisites`:** ids of lessons that already exist in `content/`. Leave
  out lessons that are planned but not written.
- **`title`:** at most 60 characters, names the idea, no "Lesson 3:".
- **`summary`:** one line, at most 140 characters, starts with a verb and says
  what the learner will do.

## 9. Skill ids

A skill is the smallest thing we would tell a learner they are good or weak
at. Each question gives evidence for exactly one skill.

Scheme: `<strand>.<topic>.<detail>` with an optional fourth part.

- `<strand>`: a strand id from `schema.ts` (`rhythm`, `pitch`, `scales-keys`,
  `intervals`, `harmony`, `composition`, `terms`, `score-reading`).
- `<topic>`: the thing being learned, a noun (`note-values`, `treble`,
  `major`).
- `<detail>`: the particular case or the action (`crotchet-minim`, `lines`,
  `write`).
- Lower case, digits and hyphens only. No grade number: skills carry across
  grades.
- Reuse an existing id whenever the skill is the same. Add a new one only when
  a learner could be good at one and bad at the other.
- A lesson lists one to four skills. More than four means the lesson is too
  big.

Within the rhythm strand, `note-values` is knowing a symbol and its length,
and `perform` is tapping it in time. They are separate because learners often
manage one and not the other.

### Start here skill ids

Start here lessons come before notation. They use these skills, plus
`rhythm.pulse.steady` and the keyboard and stave skills listed under Grade 1
where a lesson reaches them.

| Skill id | The learner can |
| --- | --- |
| `pitch.high-low.hear` | hear which of two sounds is higher |
| `pitch.direction.hear` | hear whether a tune goes up, goes down or stays the same |
| `pitch.keyboard.layout` | find their way around the keyboard by the pattern of black keys |
| `rhythm.long-short.hear` | hear which of two sounds is longer |

### Grade 1 skill ids

**rhythm**

| Skill id | The learner can |
| --- | --- |
| `rhythm.pulse.steady` | keep and recognise a steady pulse |
| `rhythm.note-values.crotchet-minim` | recognise crotchets and minims and say how long they last |
| `rhythm.note-values.semibreve` | recognise the semibreve and its length |
| `rhythm.note-values.quaver` | recognise quavers, single and beamed |
| `rhythm.note-values.semiquaver` | recognise semiquavers, single and beamed |
| `rhythm.note-values.dotted` | work out the length of a dotted note |
| `rhythm.note-values.compare` | order and exchange note values (2 quavers = 1 crotchet) |
| `rhythm.rests.values` | match each rest to its note value and length |
| `rhythm.rests.whole-bar` | use the semibreve rest for a whole silent bar |
| `rhythm.ties.read` | read a tie and add up its length |
| `rhythm.time.read-signature` | say what the two numbers of a time signature mean |
| `rhythm.time.complete-bar` | complete a bar in 2/4, 3/4 or 4/4 |
| `rhythm.time.add-bar-lines` | find where the bar lines go |
| `rhythm.time.identify` | work out the time signature of a passage |
| `rhythm.grouping.beams` | beam quavers and semiquavers in beats |
| `rhythm.perform.crotchet-minim` | tap rhythms of crotchets and minims |
| `rhythm.perform.semibreve` | tap rhythms that include semibreves |
| `rhythm.perform.quaver` | tap rhythms that include quavers |
| `rhythm.perform.semiquaver` | tap rhythms that include semiquavers |
| `rhythm.perform.dotted` | tap rhythms that include dotted notes |
| `rhythm.perform.rests` | tap rhythms that include rests |
| `rhythm.perform.ties` | tap rhythms that include ties |
| `rhythm.perform.triple-time` | tap rhythms in 3/4 and feel the strong first beat |

**pitch**

| Skill id | The learner can |
| --- | --- |
| `pitch.treble.lines` | name and place notes on treble clef lines |
| `pitch.treble.spaces` | name and place notes in treble clef spaces |
| `pitch.treble.ledger` | read middle C and the notes just outside the treble stave |
| `pitch.bass.lines` | name and place notes on bass clef lines |
| `pitch.bass.spaces` | name and place notes in bass clef spaces |
| `pitch.bass.ledger` | read middle C and the notes just outside the bass stave |
| `pitch.clefs.same-note` | match a note in treble clef to the same note in bass clef |
| `pitch.keyboard.find-notes` | find a written note on the keyboard |
| `pitch.accidentals.read` | name a note with a sharp, flat or natural |
| `pitch.accidentals.write` | put a sharp, flat or natural in the right place |
| `pitch.accidentals.bar-rule` | know an accidental lasts until the next bar line |
| `pitch.steps.semitone` | find and recognise a semitone |
| `pitch.steps.tone` | find and recognise a tone |

**scales-keys**

| Skill id | The learner can |
| --- | --- |
| `scales-keys.major.pattern` | give the tone and semitone pattern of a major scale |
| `scales-keys.major.c` | write and play the scale of C major |
| `scales-keys.major.g` | write and play the scale of G major |
| `scales-keys.major.d` | write and play the scale of D major |
| `scales-keys.major.f` | write and play the scale of F major |
| `scales-keys.signature.read` | name the key from a key signature (C, G, D, F major) |
| `scales-keys.signature.write` | write those key signatures in treble and bass clef |
| `scales-keys.degrees.number` | number the degrees of a scale, 1st to 8th |

**intervals**

| Skill id | The learner can |
| --- | --- |
| `intervals.number.read` | name an interval above the key note by number, 2nd to 8th |
| `intervals.number.write` | write the note a given interval above the key note |
| `intervals.number.hear` | tell a step from a jump, and a small jump from a big one, by ear |

**harmony**

| Skill id | The learner can |
| --- | --- |
| `harmony.tonic-triad.build` | build the tonic triad of C, G, D or F major |
| `harmony.tonic-triad.identify` | name the key of a written tonic triad |

**terms**

| Skill id | The learner can |
| --- | --- |
| `terms.dynamics.signs` | give the meaning of dynamic signs and words (*p*, *f*, *cresc.*) |
| `terms.tempo.italian` | give the meaning of Grade 1 tempo words |
| `terms.expression.italian` | give the meaning of Grade 1 expression words (*cantabile*, *dolce*) |
| `terms.articulation.signs` | recognise the slur, staccato dot and accent |
| `terms.signs.repeats-and-pauses` | recognise repeat marks, the pause, octave signs and metronome marks |

**score-reading**

| Skill id | The learner can |
| --- | --- |
| `score-reading.passage.find-features` | find a named sign or note in a short passage |

**composition**: no skills at Grade 1.

## 10. Lesson lists

These lists are the plan. Write lessons in this order; a lesson may use any
term taught by a lesson above it in the same list, and Grade 1 may use
anything from Start here. Nothing is locked for the learner, so each lesson
must still make sense if someone jumps in: link every term to the glossary.

### Start here (12 lessons, before notation)

No notation is assumed. Lessons 1 to 8 show no stave at all.

| # | Lesson id | Title | Strand | Unit | Summary |
| --- | --- | --- | --- | --- | --- |
| 1 | `start-rhythm-01-find-the-pulse` | Find the pulse | rhythm | `pulse-1` | Tap along to a click and to tunes until you can feel the steady tick under music. |
| 2 | `start-rhythm-02-fast-and-slow` | Fast and slow | rhythm | `pulse-1` | Hear the same tune at different speeds and tap the pulse as it changes. |
| 3 | `start-rhythm-03-long-and-short` | Long and short | rhythm | `pulse-1` | Play long and short sounds over a pulse and copy patterns by ear. |
| 4 | `start-pitch-01-high-and-low` | High and low | pitch | `high-low-1` | Sort sounds into high and low, then find them on the keyboard. |
| 5 | `start-pitch-02-up-down-or-the-same` | Up, down or the same | pitch | `high-low-1` | Follow a tune as it climbs, falls or stays put, and copy its shape. |
| 6 | `start-pitch-03-twos-and-threes` | Twos and threes | pitch | `keyboard-1` | Spot the pattern of black keys that makes sense of the whole keyboard. |
| 7 | `start-pitch-04-finding-c` | Finding C | pitch | `keyboard-1` | Use the two black keys to find every C, then meet middle C. |
| 8 | `start-pitch-05-the-musical-alphabet` | The musical alphabet | pitch | `keyboard-1` | Name the white keys from A to G and see why the letters start again. |
| 9 | `start-pitch-06-five-lines` | Five lines | pitch | `stave-1` | Meet the stave: higher on the lines means higher in sound. |
| 10 | `start-pitch-07-lines-and-spaces` | Lines and spaces | pitch | `stave-1` | Move from line to space to line and hear the notes go up step by step. |
| 11 | `start-pitch-08-the-treble-clef` | The treble clef | pitch | `stave-1` | See how one curly sign pins the note G to a line and names all the others. |
| 12 | `start-pitch-09-first-notes-c-d-e` | Your first notes: C, D, E | pitch | `stave-1` | Read, play and place middle C, D and E, then read a three-note tune. |

### Grade 1 (24 lessons)

| # | Lesson id | Title | Strand | Unit | Summary |
| --- | --- | --- | --- | --- | --- |
| 1 | `g1-rhythm-01-crotchets-and-minims` | Crotchets and minims | rhythm | `rhythm-1` | Find the steady pulse, then meet the 1-beat crotchet and the 2-beat minim. |
| 2 | `g1-rhythm-02-bars-and-four-four` | Bars and 4/4 time | rhythm | `rhythm-1` | Find out what the two numbers at the start mean and count bars of 4. |
| 3 | `g1-rhythm-03-semibreves` | Semibreves | rhythm | `rhythm-1` | Hold a note for a whole bar of 4 and put three note values in order. |
| 4 | `g1-rhythm-04-quavers` | Quavers | rhythm | `rhythm-1` | Split the beat in two and tap pairs of quavers joined by a beam. |
| 5 | `g1-rhythm-05-two-four-and-three-four` | 2/4 and 3/4 time | rhythm | `rhythm-1` | March in 2 and waltz in 3, and hear where the strong beat falls. |
| 6 | `g1-rhythm-06-rests` | Rests | rhythm | `rhythm-2` | Play silence on purpose: match each rest to the note value it replaces. |
| 7 | `g1-rhythm-07-dotted-notes` | Dotted notes | rhythm | `rhythm-2` | Add a dot to make a note half as long again, starting with the 3-beat minim. |
| 8 | `g1-rhythm-08-ties` | Ties | rhythm | `rhythm-2` | Join two notes into one long sound, even across a bar line. |
| 9 | `g1-rhythm-09-semiquavers` | Semiquavers | rhythm | `rhythm-2` | Fit four quick notes into one beat and tap the patterns they make. |
| 10 | `g1-rhythm-10-grouping-notes` | Grouping notes | rhythm | `rhythm-2` | Beam quavers and semiquavers so every beat is easy to see. |
| 11 | `g1-pitch-01-treble-clef-notes` | Treble clef notes | pitch | `pitch-1` | Name every line and space of the treble stave, from bottom-line E to top-line F. |
| 12 | `g1-pitch-02-bass-clef-notes` | Bass clef notes | pitch | `pitch-1` | Meet the clef for low notes and name its lines and spaces. |
| 13 | `g1-pitch-03-middle-c-and-ledger-lines` | Middle C and ledger lines | pitch | `pitch-1` | Find the one note that joins the two staves and read notes just outside them. |
| 14 | `g1-pitch-04-sharps-flats-and-naturals` | Sharps, flats and naturals | pitch | `pitch-1` | Play the black keys, name them two ways and see how long a sign lasts. |
| 15 | `g1-pitch-05-tones-and-semitones` | Tones and semitones | pitch | `pitch-1` | Measure the two smallest steps in music on the keyboard and by ear. |
| 16 | `g1-scales-keys-01-the-major-scale` | The major scale | scales-keys | `scales-1` | Build C major from tones and semitones and find the pattern behind every major scale. |
| 17 | `g1-scales-keys-02-g-major-and-key-signatures` | G major and key signatures | scales-keys | `scales-1` | Start the pattern on G, find why it needs F sharp and write that once at the start. |
| 18 | `g1-scales-keys-03-d-major-and-f-major` | D major and F major | scales-keys | `scales-1` | Build a scale with two sharps and one with a flat, and read all four key signatures. |
| 19 | `g1-scales-keys-04-degrees-of-the-scale` | Degrees of the scale | scales-keys | `scales-1` | Number the notes of a scale from 1 to 8 and find any degree in any Grade 1 key. |
| 20 | `g1-intervals-01-intervals-by-number` | Intervals by number | intervals | `harmony-1` | Measure the distance between two notes by counting letter names, from a 2nd to an octave. |
| 21 | `g1-harmony-01-tonic-triads` | Tonic triads | harmony | `harmony-1` | Stack the 1st, 3rd and 5th notes of a scale to build the chord a key calls home. |
| 22 | `g1-terms-01-loud-and-soft` | Loud and soft | terms | `terms-1` | Read the signs and Italian words that tell you how loudly to play. |
| 23 | `g1-terms-02-fast-and-slow` | Fast and slow | terms | `terms-1` | Learn the Italian words for speed and the ones that speed up or slow down. |
| 24 | `g1-terms-03-signs-on-the-page` | Signs on the page | terms | `terms-1` | Read slurs, staccato dots, accents, pauses, repeat marks and metronome marks. |

Notes on the order:

- Lesson 1 of Grade 1 teaches the pulse again in one card, because many
  learners will start at Grade 1 and skip Start here.
- Lessons 1 and 2 share the bar: lesson 1 shows bars of 4 and promises the
  explanation; lesson 2 gives it and names the time signature.
- Pitch lessons 11 to 15 do not depend on rhythm lessons 3 to 10. The home
  page may alternate the two strands.
- Intervals and tonic triads share one unit because each has one lesson at
  this grade.

## 11. Pre-publication checklist

Work through this before you hand a lesson in. `npm test` checks the lines
marked (T); the rest is on you.

**Structure**

- [ ] The file is at `content/lessons/<grade>/<unit>/<id>.json` and the id follows section 8. (T)
- [ ] It validates against `lessonSchema`, `schemaVersion` 1. (T)
- [ ] `estimatedMinutes` is honest: you have stepped through it against a clock.
- [ ] One idea. The recap fits in four points.

**Words**

- [ ] No text block over 60 words; most under 40. (T)
- [ ] No term appears before the name step, and none appears that has not been taught.
- [ ] Every new term is in `newTerms` and in the glossary, with `us` where one exists. (T)
- [ ] Every use of a term with a US equivalent is a glossary link whose shown text is the UK term. No "a" before a linked quaver.
- [ ] Every glossary link points at an entry that exists. (T)
- [ ] Read aloud, it sounds like a person talking to one learner. No "easy", "simply", "just", "obviously". At most one exclamation mark.
- [ ] Every statement about music is true as written, not only "true for now".

**Steps**

- [ ] Hook: under 30 seconds, something to play, no terms, ends on a question or a task.
- [ ] Explore: the task cannot be finished without meeting the idea; the goal is checkable.
- [ ] Name: one point per card; the alternative takes a different route.
- [ ] Practice: 3 to 5 questions, at least three types, at least one generated, easiest first.
- [ ] Challenge: a pool of at least 6, at least one generated, each answerable in about 10 seconds.
- [ ] Recap: each point makes sense on its own a month later.

**Questions**

- [ ] Every question's `skill` is in the lesson's `skills`, and every listed skill has a question. (T)
- [ ] Every listed skill has at least one practice question.
- [ ] Question ids are unique within the lesson. (T)
- [ ] Every payload matches `docs/question-payloads.md` exactly, with no extra keys.
- [ ] Every question has a hint that points at the method and does not give the answer.
- [ ] Every wrong option has its own reason: what the answer is, then what the right one is and why.
- [ ] Each question has exactly one right answer. You have tried to argue for each wrong option and failed.
- [ ] The correct option is not always in the same position across the lesson.
- [ ] At least one question is answered by tapping, playing or listening.

**Music**

- [ ] Every bar of every passage is full, apart from the two allowed exceptions. (T)
- [ ] Every passage uses only what has been taught: clef, key, time, note values, signs.
- [ ] You have played every passage and it sounds like music.
- [ ] No lyrics anywhere. No copyrighted melody, riff or rhythm in any passage or clip.
- [ ] Every piece named is named by title only, and what you say about it is true.

**Last**

- [ ] `npm run lint`, `npm run typecheck` and `npm test` pass.

## 12. The exemplar, annotated

File: `content/lessons/1/rhythm-1/g1-rhythm-01-crotchets-and-minims.json`.
Open it beside this section.

### The header

```json
"id": "g1-rhythm-01-crotchets-and-minims",
"title": "Crotchets and minims",
"summary": "Find the steady pulse, then meet the 1-beat crotchet and the 2-beat minim.",
"skills": ["rhythm.pulse.steady", "rhythm.note-values.crotchet-minim", "rhythm.perform.crotchet-minim"],
"prerequisites": [],
"estimatedMinutes": 7,
"newTerms": ["pulse", "beat", "crotchet", "minim", "bar", "bar-line"]
```

- **One idea:** notes are measured in beats, and here are the first two
  lengths. Two note values are taught together because a length means nothing
  until you compare it with another.
- **Three skills**, because a learner can know that a minim lasts 2 beats and
  still be unable to tap one. Knowing and performing are tracked apart.
- **Six new terms is the upper limit.** Four carry the idea (pulse, beat,
  crotchet, minim). Bar and bar line are there because the learner can see
  them in every passage; ignoring something visible is worse than naming it
  briefly. "Time signature" is deliberately held back for lesson 2.
- **No prerequisites**, although *Find the pulse* in Start here is the natural
  one, because that lesson does not exist yet (section 8).

### Hook

> First-aiders learn to press on the chest in time with *Stayin' Alive*. Why
> that song? Because something in it ticks along as evenly as a clock. Press
> play, then tap your foot to this tune. Can you feel the tick?

- A true, slightly surprising fact that makes the pulse matter outside a music
  lesson. The song is named by title only, and nothing from it is played.
- The words are "ticks" and "the tick". The term *pulse* is one step away and
  is not used.
- The exhibit is an **original** four-bar tune made only of crotchets and
  minims, so the learner is already hearing the lesson's material. It has
  minims in bars 2 and 4 on purpose: the foot keeps tapping while the tune
  holds, which is the point the first name card makes.
- It ends with a question the learner answers with their foot, not their head.

### Explore

> Your turn. A click will tick away. Start by tapping the pad once on every
> click. Then get sneaky: tap, let one click go by, and tap again. Same click,
> but each tap now lasts twice as long.

Goal: "Tap along with all 8 short notes, then all 4 long ones."

- The rhythm pad is the instrument because the idea is about time, not pitch.
- The exhibit is two bars of crotchets, then two of minims. Completing the
  goal means the learner has performed both note values and felt that the
  click did not change. That is the whole lesson, done before it is named.
- "Short notes" and "long ones": everyday words. "Get sneaky" is the lesson's
  one light touch.
- Tempo 80: slow enough to hit, fast enough not to drag.

### Name

Three cards, one point each, in the order the learner met them.

1. **Pulse and beat.** "That steady tick you tapped is the pulse." It names
   something the learner has already done. The clock image answers the usual
   confusion (that the pulse stops on long notes) before it appears.
2. **Crotchet and minim.** Sound first, then symbol: "A note that lasts 1 beat
   is a crotchet: a filled-in head with a stem." Then the memory hook, "hollow
   means hold", which comes back in a prompt, a hint, a reason and the
   recap. Pick one hook per lesson and reuse it; do not invent a second.
3. **Bars and bar lines.** One sentence each, then "Every bar in this lesson
   holds 4 beats". The words "in this lesson" keep it true. The bracket about
   "the two 4s" admits the time signature is there and says when it will be
   explained.

The **alternative** swaps counting for moving: footsteps, "walk" and
"sta-ay". A learner who did not follow "1 beat, 2 beats" gets a physical
version, and the words come back as a hint in practice. It ends with "You
just read the bar below", which turns the explanation into something done.

Every use of crotchet, minim and bar is a glossary link, so a US learner
reads "quarter note", "half note" and "measure" throughout.

### Practice

Four questions, three types, one generated, easiest first.

| Question | Type | Skill | Why it is here |
| --- | --- | --- | --- |
| `p1-tap-the-pulse` | `tap-rhythm`, authored | pulse | The same action as explore, but now written down and named. Eight crotchets: nothing to work out, so success is likely on the first question. |
| `p2-hear-the-minims` | `by-ear` | note values | Recognition by sound before recognition by sight. Two clips on one pitch, so length is the only difference. |
| `p3-fill-the-bar` | `complete-bar` | note values | The first reasoning step: 1 + 1 + ? = 4. `count: 1` forces the minim; without it two crotchets would also be right and the question would test nothing new. |
| `p4-tap-the-rhythm` | `tap-rhythm`, generated | perform | Production. `require` guarantees both note values appear. `listenFirst: true` gives support that the challenge takes away. |

Things to copy:

- The `p3` prompt puts the one word that matters in bold: "Add **one** note".
- Hints point at a method. `p2`: "Tap a steady beat while you listen. A minim
  lasts for 2 of your taps." It tells the learner how to find out, not what
  the answer is.
- `p2` has one wrong option and so one reason, which describes what both clips
  sound like.
- Rhythm questions keep every note on B4. Nothing in this lesson asks the
  learner to read pitch.

### Challenge

90 seconds (it includes tapping and listening), pass mark 0.8, a pool of 8.

| Question | Type | Skill | Note |
| --- | --- | --- | --- |
| `c1-tap-new-rhythm` | `tap-rhythm`, generated | perform | Same generator as `p4`, a little faster (88), and no listen-first. |
| `c2-tap-long-first` | `tap-rhythm`, authored | perform | Hand-written to start on a minim, the pattern beginners rush. |
| `c3-which-is-a-crotchet` | `multiple-choice` | note values | Symbols as options. The third option is a note with no stem: it is not named, and its reason describes only what the learner can see. |
| `c4-minim-beats` | `multiple-choice` | note values | The single fact. Each wrong number has its own reason. |
| `c5-fill-the-bar` | `complete-bar` | note values | The practice format with different contents (2 + 1 + ?). |
| `c6-which-bar-did-you-hear` | `by-ear` | note values | Sound to notation. The three options are the same notes in different orders, so guessing from the picture does not work. |
| `c7-too-many-beats` | `spot-mistake` | note values | New format, but the prompt says exactly what to do ("One bar has too many. Tap it."). The bad bar is second, not last, where a learner would guess. |
| `c8-pulse-under-long-note` | `multiple-choice` | pulse | The one misunderstanding worth a question: that the pulse waits for long notes. |

- Multiple-choice is three of eight. Five of eight are tapped, built, heard or
  hunted for.
- The correct option sits at `a`, `b`, `c`, `a` across the four choice
  questions. Options are shown in the order written, so vary the position
  yourself: no position should hold the right answer more than half the time.
- Every skill in the header appears in the pool.

### Recap

Four points, one per idea: pulse and beat; crotchet; minim (with "hollow means
hold" one last time); bars. Each is a full sentence that needs no context. The
exhibit is the "walk, walk, sta-ay" bar from the alternative explanation, so
the saved card holds the lesson's smallest complete example.

### Glossary

`content/glossary/1.json` has an entry for each of the six new terms.
Crotchet, minim and bar carry `us` forms. Pulse, beat and bar line do not,
because American usage is the same. The crotchet and minim definitions say
"in the music you meet first" because a crotchet is not always 1 beat, and
the glossary will still be read at Grade 5.
