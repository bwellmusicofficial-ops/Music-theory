# Question payloads

Status: P0-14. This is the specification that P0-12 and P0-13 implement. If the
code and this document disagree, this document wins until the orchestrator
changes it.

`src/lesson/schema.ts` leaves each question's `payload` as `unknown`. This
document fixes, for each of the nine question types:

- the `Payload` type (what a lesson file or a generator supplies),
- the `Answer` type (what the component passes to `onAnswer`),
- the marking rule (`mark(payload, answer)`),
- the `reason` text for every kind of wrong answer,
- one JSON example.

It also defines the two generators seeded in Phase 0.

## 1. Rules for every type

### 1.1 Implementing a type

Each type lives in `src/lesson/questions/<type>/` and exports a
`QuestionTypeModule<Payload, Answer>` (see `src/lesson/contracts.ts`).

- `payloadSchema` is a Zod schema that accepts exactly the `Payload` type given
  here and enforces every line under that type's "Validation" heading. Use
  `z.strictObject` so that unknown keys are rejected.
- Optional fields have the default stated in the type's comment. Apply defaults
  in the schema (`.default(...)`), so `mark` and the component always see the
  field.
- `mark` is pure and synchronous. It may import `src/engine`. It must not use
  the clock, randomness, storage or the DOM.
- `mark` returns `score` in the range 0 to 1 and `correct` exactly as the
  marking rule says. When `correct` is false, `reason` is required.
- If `mark` receives an answer that the component could never produce (wrong
  shape, unknown id), it throws `TheoryError`. It does not return a result.
- The component shows options and items **in array order**. It never shuffles.
  Authors and generators choose the order. This keeps questions replayable from
  a seed.

### 1.1a Restoring and reporting answers

`QuestionProps` has three optional props (see `src/lesson/contracts.ts`) that every
component honours:

- `initialAnswer`: shows an earlier answer as the current selection or state
  (chosen option "selected", pairs, order, placed notes, played keys restored; for
  `tap-rhythm`, "Answer recorded" with a "Tap again" control). It never shows right
  or wrong marking, which only `result` does. An answer that does not fit the payload
  is ignored.
- `onAnswerChange(answer | null)`: called whenever the current answer changes, with
  null when it is incomplete or cleared. It is not called on mount. It is independent
  of `onAnswer`, the commit action. In `note-on-stave` identify mode the answer is
  always the current letter and sign together, whichever was picked last.
- `hideCheck`: components with their own "Check" button leave it out, for hosts (the
  mock test) that save answers as they change.

### 1.2 Shared types

Import engine types from `src/engine/types.ts`. These extra types are shared by
several payloads. Put them in `src/lesson/questions/shared.ts`.

```ts
import type { Duration, Passage } from '@/engine/types';

/** The inline text format from schema.ts: plain text, **bold**, *italic*, [[term-id|shown text]]. */
export type RichText = string;

/** One note or rest symbol drawn on its own, with no stave. */
export interface Glyph {
  kind: 'note' | 'rest';
  duration: Duration;
}

/** Something an option, a card or a sortable item can show. */
export type Face =
  | { kind: 'text'; text: RichText }
  | { kind: 'glyph'; glyph: Glyph }
  | { kind: 'passage'; passage: Passage };

/** A passage to be heard, not seen. */
export interface Clip {
  passage: Passage;
  /** Felt beats per minute, 40 to 160. */
  bpm: number;
}
```

Validation that applies wherever these appear:

- Every `RichText` is 1 to 60 words (`richTextSchema`).
- `Glyph.duration.tuplet` is not allowed.
- Every `Passage` passes the passage rules in 1.3.
- `Clip.bpm` is an integer from 40 to 160.
- Every `id` inside a payload matches `/^[a-z0-9]+(-[a-z0-9]+)*$/` and is unique
  within its array.

### 1.3 Passage rules

A `Passage` in a payload or an exhibit must satisfy all of these:

1. `bars` has at least one bar and every bar has at least one event.
2. Every bar is exactly full: `rhythm.checkBarLength(bar, time).status` is
   `'complete'`. Two payloads allow one named bar to break this rule:
   `complete-bar` (the bar at `barIndex` is short) and `spot-mistake` with
   `select: 'bar'` (the bar at `mistake.bar` may be short or long).
3. Every note has at least one pitch. A `tieToNext` note is followed by a note
   with the same pitches (in the same bar or the next).
4. `duration.dots` is 0, 1 or 2. Tuplets are written on every note of the group.

For rhythm-only material (notes whose pitch does not matter) use the pitch B4
in the treble clef, C major. B4 is the middle line, so the notes sit in the
centre of the stave.

### 1.4 The `reason` text

`MarkResult.reason` is `RichText`. The lesson player renders it with the same
renderer as lesson text. Every reason follows these rules.

1. It says what the learner's answer actually is or does, then what the right
   answer is and why. "That head is hollow, so it is a minim and lasts 2 beats.
   The crotchet has a filled-in head."
2. One or two sentences, 40 words at most.
3. It never says only "Incorrect", "Wrong" or "Try again". It never blames
   ("You forgot", "You should know"). It never uses an exclamation mark.
4. It uses only terms the lesson has taught. Reasons written by authors are the
   author's job to check. Reasons built by `mark` use only the templates below.
5. **Terminology.** `mark` does not receive the terminology setting, so reasons
   are written in UK terms and every term that has a US equivalent is written
   as a glossary link. The renderer swaps the term when the setting is `us`
   (rule in `docs/lesson-authoring-guide.md`, "UK and US terms"). In templates
   below these helpers produce the link text:

   | Helper | Output | Example |
   | --- | --- | --- |
   | `nv(d)` | `"dotted "` or `"double-dotted "` (by `d.dots`), then `[[<value>|<value>]]` | `dotted [[minim|minim]]` |
   | `nvs(d)` | as `nv` with `s` added inside the shown text | `[[crotchet|crotchets]]` |
   | `BAR` / `Bar` | `[[bar|bar]]` / `[[bar|Bar]]` | |

   The glossary id of a note value is always its engine `NoteValue` id
   (`crotchet`, `minim`, ...).

6. Other helpers used in templates:

   | Helper | Output |
   | --- | --- |
   | `name(pc)` | `pitch.displayPitchClass(pc)`, e.g. `F♯` |
   | `where(pos)` | Stave position in words, table below |
   | `beats(len, time)` | A length as a count of beats, rule below |

   `where(pos)`, with `pos` from `pitch.stavePosition`:

   | `pos` | Text |
   | --- | --- |
   | 0, 2, 4, 6, 8 | `on the bottom line`, `on the second line`, `on the middle line`, `on the fourth line`, `on the top line` |
   | 1, 3, 5, 7 | `in the bottom space`, `in the second space`, `in the third space`, `in the top space` |
   | -1 | `just below the bottom line` |
   | 9 | `just above the top line` |
   | -2, 10 | `on the first ledger line below the stave`, `on the first ledger line above the stave` |
   | -3, 11 | `just below the first ledger line below the stave`, `just above the first ledger line above the stave` |
   | -4, 12 | `on the second ledger line below the stave`, `on the second ledger line above the stave` |
   | lower than -4, higher than 12 | `far below the stave`, `far above the stave` |

   `beats(len, time)`: one beat is `1 / time.beatUnit` of a semibreve (the
   bottom number of the time signature, in every metre). Let `b = len ÷ beat`.
   Write whole numbers as digits, and quarters as `¼`, `½`, `¾` after the whole
   part (`1½`, `½`); anything else to two decimal places. Then add ` beat` if
   `b ≤ 1`, otherwise ` beats`. Examples: `1 beat`, `2 beats`, `1½ beats`,
   `½ beat`.

In the templates, `{...}` is a value to insert. Bar and note numbers shown to
the learner are 1-based; all indexes in payloads and answers are 0-based.

## 2. The nine types

### 2.1 `multiple-choice`

The learner picks one of two to four options.

```ts
import type { Exhibit } from '@/lesson/schema';

export interface MultipleChoicePayload {
  /** Shown above the options. Omit when the prompt needs nothing else. */
  exhibit?: Exhibit;
  /** 2 to 4 options, shown in this order. */
  options: MultipleChoiceOption[];
  /** `id` of the one correct option. */
  correct: string;
}

export interface MultipleChoiceOption {
  id: string;
  face: Face;
  /** Required on every wrong option. Not allowed on the correct option. */
  reason?: RichText;
}

export interface MultipleChoiceAnswer {
  optionId: string;
}
```

Validation: 2 to 4 options; `correct` is the id of an option; every option
except `correct` has `reason`; the correct option has none; all faces in one
question are the same `kind`.

Component: tapping an option commits the answer (no Check button).

Marking: `correct = answer.optionId === payload.correct`; `score` is 1 or 0.

Reason: the chosen option's `reason`, unchanged. The author writes one per
wrong option. Each must name what that option is and how it differs from the
right one.

| Wrong answer | Example reason |
| --- | --- |
| Picked a different symbol | "That head is hollow, so it is a [[minim\|minim]] and lasts 2 beats. The [[crotchet\|crotchet]] has a filled-in head." |
| Picked a wrong number | "The 1-beat note is the [[crotchet\|crotchet]]. A [[minim\|minim]] is the hollow one: it lasts 2 beats." |
| Picked a wrong statement | "The pulse never waits for the tune. It kept ticking under your long taps, and it does the same under any long note." |

```json
{
  "options": [
    {
      "id": "a",
      "face": { "kind": "glyph", "glyph": { "kind": "note", "duration": { "value": "minim", "dots": 0 } } },
      "reason": "That head is hollow, so it is a [[minim|minim]] and lasts 2 beats. The [[crotchet|crotchet]] has a filled-in head."
    },
    {
      "id": "b",
      "face": { "kind": "glyph", "glyph": { "kind": "note", "duration": { "value": "crotchet", "dots": 0 } } }
    }
  ],
  "correct": "b"
}
```

### 2.2 `match-up`

The learner joins each item on the left to one item on the right.

```ts
export interface MatchUpPayload {
  /** 3 to 5 items, shown in this order. */
  left: MatchUpLeft[];
  /** Same length as `left`, shown in this order. */
  right: MatchUpRight[];
}

export interface MatchUpLeft {
  id: string;
  face: Face;
  /** `id` of the item in `right` that this item belongs with. */
  match: string;
  /** Used when this item is paired wrongly. Says what this item is and what it belongs with. */
  reason: RichText;
}

export interface MatchUpRight {
  id: string;
  face: Face;
}

/** One entry for every left item: left id -> chosen right id. */
export interface MatchUpAnswer {
  pairs: Record<string, string>;
}
```

Validation: 3 to 5 left items; `right.length === left.length`; every `match`
is the id of a right item; no two left items share a `match`; the right items
must not start in matching order (`left[i].match !== right[i].id` for at least
two values of `i`).

Component: the learner can change pairs freely. A Check button is enabled when
every left item has a partner and no right item is used twice. Check commits.

Marking: a left item is right when `answer.pairs[item.id] === item.match`.
`score = right ÷ left.length`. `correct` when `score === 1`.

Reason: let `first` be the first left item, in array order, that is paired
wrongly.

```
{right} of {total} pairs are right. {first.reason}
```

Example: "1 of 3 pairs are right. A [[minim|minim]] is the hollow note with a
stem. It lasts 2 beats, not 1."

```json
{
  "left": [
    {
      "id": "crotchet",
      "face": { "kind": "glyph", "glyph": { "kind": "note", "duration": { "value": "crotchet", "dots": 0 } } },
      "match": "one",
      "reason": "A [[crotchet|crotchet]] is the filled-in note with a stem. It lasts 1 beat."
    },
    {
      "id": "minim",
      "face": { "kind": "glyph", "glyph": { "kind": "note", "duration": { "value": "minim", "dots": 0 } } },
      "match": "two",
      "reason": "A [[minim|minim]] is the hollow note with a stem. It lasts 2 beats, not 1."
    },
    {
      "id": "semibreve",
      "face": { "kind": "glyph", "glyph": { "kind": "note", "duration": { "value": "semibreve", "dots": 0 } } },
      "match": "four",
      "reason": "A [[semibreve|semibreve]] is the hollow note with no stem. It lasts 4 beats."
    }
  ],
  "right": [
    { "id": "four", "face": { "kind": "text", "text": "4 beats" } },
    { "id": "one", "face": { "kind": "text", "text": "1 beat" } },
    { "id": "two", "face": { "kind": "text", "text": "2 beats" } }
  ]
}
```

### 2.3 `ordering`

The learner drags items into the right order.

```ts
export interface OrderingPayload {
  /** 3 to 6 items, in the order they are first shown. */
  items: { id: string; face: Face }[];
  /** Every item id once, in the correct order. */
  correctOrder: string[];
  /** Labels shown at the two ends of the row, e.g. "shortest" and "longest". */
  ends: { first: RichText; last: RichText };
  /** The rule that sorts the items, with the values that prove it. */
  reason: RichText;
}

export interface OrderingAnswer {
  /** Every item id once, in the learner's order. */
  order: string[];
}
```

Validation: 3 to 6 items; `correctOrder` is a permutation of the item ids; the
starting order differs from `correctOrder`; no two items may tie (the author
must make sure only one order is right); `reason` is 30 words at most.

Component: drag, or select an item and move it with arrow keys. A Check button
commits.

Marking: `score` = the number of positions `i` where
`answer.order[i] === payload.correctOrder[i]`, divided by the number of items.
`correct` when `score === 1`.

Reason: let `k` be the 1-based position of the first item out of place.

```
Number {k} in your order is the first one out of place. {payload.reason}
```

Example: "Number 2 in your order is the first one out of place. Shortest to
longest: [[crotchet|crotchet]] 1 beat, [[minim|minim]] 2 beats,
[[semibreve|semibreve]] 4 beats."

```json
{
  "items": [
    { "id": "minim", "face": { "kind": "glyph", "glyph": { "kind": "note", "duration": { "value": "minim", "dots": 0 } } } },
    { "id": "semibreve", "face": { "kind": "glyph", "glyph": { "kind": "note", "duration": { "value": "semibreve", "dots": 0 } } } },
    { "id": "crotchet", "face": { "kind": "glyph", "glyph": { "kind": "note", "duration": { "value": "crotchet", "dots": 0 } } } }
  ],
  "correctOrder": ["crotchet", "minim", "semibreve"],
  "ends": { "first": "shortest", "last": "longest" },
  "reason": "Shortest to longest: [[crotchet|crotchet]] 1 beat, [[minim|minim]] 2 beats, [[semibreve|semibreve]] 4 beats."
}
```

### 2.4 `note-on-stave`

Two modes. In `identify` the stave shows one note and the learner names it. In
`place` the prompt names a note and the learner puts it on an empty stave.

```ts
import type { Clef, Key, Pitch, PitchClass } from '@/engine/types';

export type NoteOnStavePayload = NoteOnStaveIdentify | NoteOnStavePlace;

export interface NoteOnStaveIdentify {
  mode: 'identify';
  clef: Clef;
  /** Sets the key signature drawn. Use C major for none. */
  key: Key;
  /** The note shown. Its accidental is the sounding one (in G major the top-line F is F sharp). */
  pitch: Pitch;
  /** true: the learner must also choose sharp, flat or natural. false: letters only. */
  accidentals: boolean;
}

export interface NoteOnStavePlace {
  mode: 'place';
  clef: Clef;
  key: Key;
  /** The note asked for. The prompt must name it. */
  target: PitchClass;
  /** Omit to accept the target in any octave. Give it only when the prompt makes the octave clear ("middle C"). */
  octave?: number;
  /** true: the learner can add a sharp or flat sign. */
  accidentals: boolean;
}

export type NoteOnStaveAnswer =
  | { mode: 'identify'; name: PitchClass }
  | { mode: 'place'; pitch: Pitch };
```

Validation: accidentals in `pitch` and `target` are -1, 0 or 1. When
`accidentals` is false, `pitch.accidental` (or `target.accidental`) is 0 and
`key` must be C major or A minor. In `identify`, the stave position of `pitch`
is from -4 to 12.

Component:

- Both modes draw the stave through `components/stave`. The shown note is a
  semibreve in a single 4/4 bar. (See the contract note in the P0-14 report
  about hiding the time signature.)
- `identify`: seven letter buttons, A to G in that order. When `accidentals`
  is true, a second row has flat, natural and sharp, with natural selected at
  first. Tapping a letter commits. `name.accidental` is the selected sign, or
  0 when `accidentals` is false.
- `place`: the learner places exactly one note; placing again moves it. A
  Check button commits. `pitch` is the sounding pitch of the placed note: its
  letter and octave from the stave position, and its accidental from the sign
  the learner added, or else from the key signature, or else 0.

Marking, `identify`: correct when `name.letter` and `name.accidental` both
equal those of `payload.pitch`. Marking, `place`: correct when the letter and
accidental equal `target` and, if `octave` is given, the octave matches too.
`score` is 1 or 0.

Reasons, `identify` (use the first that applies; `pos` is
`pitch.stavePosition(payload.pitch, payload.clef)`):

| Wrong answer | Template | Example |
| --- | --- | --- |
| Wrong letter | `That note is {where(pos)} of the {clef} stave, which is {name(pitch)}, not {name(answer)}.` | "That note is on the second line of the treble stave, which is G, not A." |
| Right letter, wrong sign, and the key signature sets this letter | `Right letter, but the key signature turns every {letter} into {name(pitch)}, so this note is {name(pitch)}.` | "Right letter, but the key signature turns every F into F♯, so this note is F♯." |
| Right letter, wrong sign, otherwise | `Right letter, but check the sign in front of the note: it is {name(pitch)}, not {name(answer)}.` | "Right letter, but check the sign in front of the note: it is B♭, not B." |

Reasons, `place` (first that applies; `placedPos` is the stave position of the
answer, `nearPos` is the stave position nearest to `placedPos` whose letter is
the target's, and `natural(p)` is the pitch `p` with accidental 0):

| Wrong answer | Template | Example |
| --- | --- | --- |
| Wrong letter | `You put the note {where(placedPos)}, which is {name(natural(answer))}. {target.letter} is {where(nearPos)}.` | "You put the note in the second space, which is A. G is on the second line." |
| Right letter, wrong octave | `That is a {letter}, but not the one asked for. You need the {letter} {where(targetPos)}, which is {higher\|lower} than yours.` | "That is a C, but not the one asked for. You need the C on the first ledger line below the stave, which is lower than yours." |
| Right place, wrong sign, target has a sharp or flat | `Right place, but {name(target)} needs a {sharp\|flat} sign in front of it.` | "Right place, but F♯ needs a sharp sign in front of it." |
| Right place, wrong sign, target is natural | `Right place, but this should be a plain {letter}. Yours is {name(answer)}.` | "Right place, but this should be a plain B. Yours is B♭." |

`nearPos` is never a tie: same-letter positions are 7 apart, so the two
candidates are at distances `d` and `7 - d`.

```json
{
  "mode": "identify",
  "clef": "treble",
  "key": { "tonic": { "letter": "C", "accidental": 0 }, "mode": "major" },
  "pitch": { "letter": "G", "accidental": 0, "octave": 4 },
  "accidentals": false
}
```

### 2.5 `play-keyboard`

The learner plays one or more notes on the on-screen keyboard.

```ts
export interface PlayKeyboardPayload {
  /** Keyboard range. Both must be white keys. */
  low: Pitch;
  high: Pitch;
  /** Letter names printed on the keys. Default false. */
  showLabels?: boolean;
  /** 1 to 8 notes to play. */
  targets: Pitch[];
  /** 'sequence': one after another in this order. 'together': as a chord, any order. */
  mode: 'sequence' | 'together';
  /** 'exact': the right key. 'any': the right note name on any key in range. */
  octave: 'exact' | 'any';
  /** Notation shown above the keyboard (for "play what you see"). */
  passage?: Passage;
}

export interface PlayKeyboardAnswer {
  /** As reported by the keyboard (black keys as sharps). 'sequence': in the order played. 'together': low to high. */
  played: Pitch[];
}
```

Validation: `low` is below `high`; both are naturals; 1 to 8 targets, all
within the range; in `together` mode there are at least two targets and no two
sound the same.

Component: the keyboard sounds as usual.

- `sequence`: each key press is appended to `played`. The answer commits
  automatically when `played.length === targets.length`.
- `together`: each key press toggles that key on or off. A Check button
  commits the keys that are on, lowest first.

Marking: two pitches match when `pitch.toMidi` is equal (`octave: 'exact'`) or
when `pitch.chroma` is equal (`octave: 'any'`). Spelling is ignored, because
the keyboard cannot tell F sharp from G flat.

- `sequence`: `score` = matching positions ÷ `targets.length`.
- `together`: `matched` = targets that match some played note;
  `score = matched ÷ max(targets.length, played.length)`.
- `correct` when `score === 1`.

Naming notes in reasons: a target is `name(target)`. A played white key is its
letter. A played black key is named as a flat if any target is a flat,
otherwise as a sharp.

Reasons, `sequence` (let `i` be the first position that does not match):

| Wrong answer | Template | Example |
| --- | --- | --- |
| Same note name, wrong key (`exact` only) | `Note {i+1} is the right letter but the wrong key. You need the {name(target)} further to the {right\|left}.` | "Note 1 is the right letter but the wrong key. You need the C further to the left." |
| Different note | `Note {i+1} should be {name(target)}, but you played {played}, which is too {high\|low}.` | "Note 2 should be E, but you played F, which is too high." |

When there is only one target, start with `That should be` in place of
`Note 1 should be`, and `That is the right letter` in place of
`Note 1 is the right letter`.

In `octave: 'any'` mode, "too high" or "too low" compares the played key with
the nearest key that has the target's name.

Reasons, `together` (first that applies):

| Wrong answer | Template | Example |
| --- | --- | --- |
| Too few keys | `You chose {n} keys, but this needs {total}: {list of targets}.` | "You chose 2 keys, but this needs 3: C, E and G." |
| A wrong key | `{played} does not belong. The notes are {list of targets}.` (first wrong key, low to high) | "F does not belong. The notes are C, E and G." |

Lists are joined with commas and a final "and".

```json
{
  "low": { "letter": "C", "accidental": 0, "octave": 4 },
  "high": { "letter": "C", "accidental": 0, "octave": 5 },
  "showLabels": false,
  "targets": [
    { "letter": "C", "accidental": 0, "octave": 4 },
    { "letter": "D", "accidental": 0, "octave": 4 },
    { "letter": "E", "accidental": 0, "octave": 4 }
  ],
  "mode": "sequence",
  "octave": "exact"
}
```

### 2.6 `tap-rhythm`

The learner taps a rhythm on the rhythm pad.

```ts
import type { Bar, TimeSignature } from '@/engine/types';
import type { TapResult } from '@/components/rhythm-pad';

export interface TapRhythmPayload {
  time: TimeSignature;
  /** 1 to 4 full bars. Pitches are ignored; use B4. */
  bars: Bar[];
  /** Felt beats per minute, 50 to 120. */
  bpm: number;
  /** Bars of click before the learner starts. Default 1. */
  countInBars?: 1 | 2;
  /** true: the rhythm is shown as notation. */
  showNotation: boolean;
  /** true: the rhythm is played once before the count-in. */
  listenFirst: boolean;
  /** How far from the beat a tap may land and still count, in ms. Default 150. */
  toleranceMs?: number;
}

/** Exactly what the rhythm pad reports (docs/architecture.md). */
export type TapRhythmAnswer = TapResult;
```

Validation: 1 to 4 bars, each exactly full; at least one note; no tuplets in
Phase 0; `bpm` is an integer from 50 to 120; `toleranceMs` from 60 to 250; at
least one of `showNotation` and `listenFirst` is true.

Component: optional playback (`listenFirst`), then the rhythm pad with
`bars`, `time`, `bpm` and `countInBars`. The pad's `onComplete` result is
passed to `onAnswer` unchanged. The pad clicks the pulse through the count-in
and the performance.

Marking. Let `N` be the number of expected onsets
(`rhythm.onsetTimes(bars, time, bpm).length`). Read `answer.errorsMs[i]` for
`i` from 0 to `N - 1`, treating a missing entry as `null`. `answer.accuracy`
is not used.

```
hit      = entries that are not null and have |error| <= toleranceMs
missed   = entries that are null
mistimed = N - hit - missed
score    = clamp((hit - answer.extraTaps) / N, 0, 1)
correct  = score >= 0.8
```

Reasons (use the first row that applies):

| # | Condition | Template |
| --- | --- | --- |
| 1 | `missed === N` | `No taps came through. Tap the pad once for every note, starting straight after the count-in.` |
| 2 | `extraTaps > 0` and `extraTaps >= missed + mistimed` | `You tapped {extraTaps} more {time\|times} than there are notes. Every note gets one tap, however long it lasts: tap, then wait.` |
| 3 | `missed > 0` and `missed >= mistimed` | `You missed {missed} of the {N} notes. Tap once for every note, long ones included.` |
| 4 | otherwise | A timing reason, below. |

Timing reason. Let `i` be the first index whose entry is not null and outside
the tolerance. "Early" means the error is negative. Let `prev` be the note at
onset `i - 1` (with any notes tied to it), `len` its total length, and `gap`
the total length of any rests between onset `i - 1` and onset `i` (for
`i = 0`, the rests before the first note).

| Case | Early | Late |
| --- | --- | --- |
| `i = 0`, no rest first | `You came in early. Let the count-in finish, then tap on the very next click.` | `You came in late. The first note lands on the first click after the count-in.` |
| `i = 0`, rest first | `This rhythm starts with a rest. Wait for {beats(gap)} after the count-in before your first tap.` | same as early |
| rest before note `i` | `Tap {i+1} came too early. There is a rest before it: stay silent for {beats(gap)} first.` | `Tap {i+1} came late. The rest before it lasts only {beats(gap)}.` |
| no rest before note `i` | `Tap {i+1} came too early. The {nv(prev)} before it lasts {beats(len)}, so count all of it before you tap again.` | `Tap {i+1} came late. The {nv(prev)} before it lasts only {beats(len)}, so the next note follows sooner.` |

When `prev` is two or more tied notes, write `tied note` in place of
`{nv(prev)}`.

Examples: "Tap 3 came too early. The [[minim|minim]] before it lasts 2 beats,
so count all of it before you tap again." "You tapped 2 more times than there
are notes. Every note gets one tap, however long it lasts: tap, then wait."

```json
{
  "time": { "beats": 4, "beatUnit": 4 },
  "bars": [
    {
      "events": [
        { "kind": "note", "pitches": [{ "letter": "B", "accidental": 0, "octave": 4 }], "duration": { "value": "crotchet", "dots": 0 } },
        { "kind": "note", "pitches": [{ "letter": "B", "accidental": 0, "octave": 4 }], "duration": { "value": "crotchet", "dots": 0 } },
        { "kind": "note", "pitches": [{ "letter": "B", "accidental": 0, "octave": 4 }], "duration": { "value": "minim", "dots": 0 } }
      ]
    }
  ],
  "bpm": 80,
  "countInBars": 1,
  "showNotation": true,
  "listenFirst": false
}
```

### 2.7 `by-ear`

The learner hears one to three clips and picks an answer. The clips are never
shown as notation. Apart from that it works like `multiple-choice`.

```ts
export interface ByEarPayload {
  /** 1 to 3 clips. Two or more are labelled "A", "B", "C" in array order. */
  clips: Clip[];
  /** 2 to 4 options, shown in this order. */
  options: ByEarOption[];
  /** `id` of the one correct option. */
  correct: string;
}

export interface ByEarOption {
  id: string;
  face: Face;
  /** Required on every wrong option. Not allowed on the correct option. */
  reason?: RichText;
}

export interface ByEarAnswer {
  optionId: string;
}
```

Validation: as `multiple-choice`, plus 1 to 3 clips. When the options refer to
clips, their text is exactly `Clip A`, `Clip B` or `Clip C`.

Component: one play button per clip, played with
`audio.playPassage(clip.passage, { bpm: clip.bpm })`. Clips can be replayed
without limit. Options are disabled until every clip has been played to the
end once. Tapping an option commits. A `passage` face in an option is shown
as notation and is not playable (playing it would give the answer away).

Marking: `correct = answer.optionId === payload.correct`; `score` is 1 or 0.

Reason: the chosen option's `reason`, unchanged. Each must describe the sound
of what was played and the sound of what was chosen, in words a listener would
use (short, long, higher, lower, faster), so the learner knows what to listen
for next time.

| Wrong answer | Example reason |
| --- | --- |
| Picked the wrong clip | "Clip A is all short notes of 1 beat each, so those are [[crotchet\|crotchets]]. The [[minim\|minims]] are the slow 2-beat notes in clip B." |
| Picked the wrong notation | "That [[bar\|bar]] starts with its long note. The one you heard went short, short, long." |

```json
{
  "clips": [
    {
      "bpm": 80,
      "passage": {
        "clef": "treble",
        "key": { "tonic": { "letter": "C", "accidental": 0 }, "mode": "major" },
        "time": { "beats": 2, "beatUnit": 4 },
        "bars": [
          {
            "events": [
              { "kind": "note", "pitches": [{ "letter": "G", "accidental": 0, "octave": 4 }], "duration": { "value": "crotchet", "dots": 0 } },
              { "kind": "note", "pitches": [{ "letter": "G", "accidental": 0, "octave": 4 }], "duration": { "value": "crotchet", "dots": 0 } }
            ]
          }
        ]
      }
    },
    {
      "bpm": 80,
      "passage": {
        "clef": "treble",
        "key": { "tonic": { "letter": "C", "accidental": 0 }, "mode": "major" },
        "time": { "beats": 2, "beatUnit": 4 },
        "bars": [
          {
            "events": [
              { "kind": "note", "pitches": [{ "letter": "G", "accidental": 0, "octave": 4 }], "duration": { "value": "minim", "dots": 0 } }
            ]
          }
        ]
      }
    }
  ],
  "options": [
    {
      "id": "a",
      "face": { "kind": "text", "text": "Clip A" },
      "reason": "Clip A has two short notes of 1 beat each. The long 2-beat note is in clip B."
    },
    { "id": "b", "face": { "kind": "text", "text": "Clip B" } }
  ],
  "correct": "b"
}
```

### 2.8 `complete-bar`

One bar of a passage is short. The learner adds notes or rests to the end of
it until it is full.

```ts
export interface CompleteBarPayload {
  /** Every bar is full except the one at `barIndex`, which is short. */
  passage: Passage;
  barIndex: number;
  /** 2 to 6 symbols the learner may add, shown in this order. Each may be used many times. */
  palette: Glyph[];
  /** Pitch given to added notes. */
  fillPitch: Pitch;
  /** If given, the learner must add exactly this many symbols. */
  count?: number;
  /** true: the finished bar must also follow grouping conventions. Default false. */
  checkGrouping?: boolean;
}

export interface CompleteBarAnswer {
  /** The symbols added, left to right. */
  added: Glyph[];
}
```

Validation: `barIndex` points at a bar; that bar is short and every other bar
is full; the palette has 2 to 6 different glyphs; at least one sequence of
palette glyphs fills the bar exactly (and with `count` symbols, if `count` is
given); `count` is from 1 to 8.

Component: tapping a palette symbol appends it to the bar; an Undo button
removes the last added symbol. The existing events cannot be changed. Added
notes take `fillPitch`. The learner may add up to 12 symbols, even if the bar
overflows. A Check button, enabled when at least one symbol is added, commits.

Marking. Build `bar` = the events at `barIndex` followed by the added glyphs
(a note glyph becomes a `NoteEvent` at `fillPitch`, a rest glyph a
`RestEvent`). `correct` when all of these hold, otherwise `score` is 0:

1. `rhythm.checkBarLength(bar, time).status === 'complete'`
2. `count` is not given, or `added.length === count`
3. `checkGrouping` is false, or `rhythm.groupingProblems(bar, time)` is empty

Reasons (first that applies; `total` is the length of `bar`, `full` is
`rhythm.barLength(time)`, `diff` is the difference):

| Wrong answer | Template | Example |
| --- | --- | --- |
| Bar is short | `That {BAR} now holds {beats(total)}, but it needs {beats(full)}. It is still {beats(diff)} short.` | "That [[bar\|bar]] now holds 3 beats, but it needs 4 beats. It is still 1 beat short." |
| Bar is long | `That {BAR} now holds {beats(total)}, but there is only room for {beats(full)}. Take {beats(diff)} away.` | "That [[bar\|bar]] now holds 5 beats, but there is only room for 4 beats. Take 1 beat away." |
| Full, but too many symbols | `That fills the {BAR}, but with {n} symbols. The question asks for {count}, so use {a longer one\|longer ones}.` | "That fills the [[bar\|bar]], but with 2 symbols. The question asks for 1, so use a longer one." |
| Full, but too few symbols | `That fills the {BAR}, but with {n} {symbol\|symbols}. The question asks for {count}, so use shorter ones.` | "That fills the [[bar\|bar]], but with 1 symbol. The question asks for 2, so use shorter ones." |
| Grouping problem | `The beats add up, but the {BAR} is not written the standard way: {message}` (`message` of the first problem) | "The beats add up, but the [[bar\|bar]] is not written the standard way: a rest should not hide the third beat." |

Use `a longer one` when `count` is 1, otherwise `longer ones`.

```json
{
  "passage": {
    "clef": "treble",
    "key": { "tonic": { "letter": "C", "accidental": 0 }, "mode": "major" },
    "time": { "beats": 4, "beatUnit": 4 },
    "bars": [
      {
        "events": [
          { "kind": "note", "pitches": [{ "letter": "B", "accidental": 0, "octave": 4 }], "duration": { "value": "crotchet", "dots": 0 } },
          { "kind": "note", "pitches": [{ "letter": "B", "accidental": 0, "octave": 4 }], "duration": { "value": "crotchet", "dots": 0 } }
        ]
      }
    ]
  },
  "barIndex": 0,
  "palette": [
    { "kind": "note", "duration": { "value": "crotchet", "dots": 0 } },
    { "kind": "note", "duration": { "value": "minim", "dots": 0 } }
  ],
  "fillPitch": { "letter": "B", "accidental": 0, "octave": 4 },
  "count": 1
}
```

### 2.9 `spot-mistake`

A passage contains exactly one mistake. The learner taps the bar, or the note
or rest, that is wrong.

```ts
export interface SpotMistakePayload {
  /** Shown as notation. With `select: 'bar'`, the bar at `mistake.bar` may be the wrong length. */
  passage: Passage;
  /** What the learner taps: a whole bar, or one note or rest. */
  select: 'bar' | 'event';
  /** Where the mistake is. `event` is required when `select` is 'event' and not allowed otherwise. */
  mistake: { bar: number; event?: number };
  /** Names the place and the fault: "Bar 2 has 5 beats: ...". 40 words at most. */
  explanation: RichText;
  /** A correct version to listen to, for "one note on the page does not match what you hear". */
  reference?: Clip;
}

export interface SpotMistakeAnswer {
  bar: number;
  /** Present exactly when `select` is 'event'. */
  event?: number;
}
```

Validation: at least two bars when `select` is `'bar'`, and at least three
events in total when it is `'event'`; `mistake` points at a bar (and event)
that exists; every bar is full, except that with `select: 'bar'` the mistake
bar may be short or long; `explanation` is 40 words at most.

Component: the passage in the stave's read mode. With `select: 'bar'` a tap
anywhere in a bar selects that bar; with `'event'` a tap selects that note or
rest (`onEventTap`). The selection is highlighted and can be changed. A Check
button commits. When `reference` is given, a play button plays it.

Marking: `select: 'bar'`: correct when `answer.bar === mistake.bar`.
`select: 'event'`: correct when bar and event both match. `score` is 1 or 0.

Reasons:

| Wrong answer | Template | Example |
| --- | --- | --- |
| `bar` mode, wrong bar | `{Bar} {answer.bar + 1} is fine. {explanation}` | "[[bar\|Bar]] 3 is fine. [[bar\|Bar]] 2 has 5 beats: a [[minim\|minim]] (2), a [[crotchet\|crotchet]] (1) and another [[minim\|minim]] (2). That is one beat too many." |
| `event` mode, wrong bar | `That {note\|rest} is fine. {explanation}` | "That note is fine. The third note in [[bar\|bar]] 2 is on the bottom line, which is E, but the tune you heard goes up to G." |
| `event` mode, right bar, wrong event | `Right {BAR}, wrong {note\|rest}. {explanation}` | "Right [[bar\|bar]], wrong note. The third note in [[bar\|bar]] 2 is on the bottom line, which is E, but the tune you heard goes up to G." |

`note` or `rest` is the kind of the event the learner tapped.

```json
{
  "passage": {
    "clef": "treble",
    "key": { "tonic": { "letter": "C", "accidental": 0 }, "mode": "major" },
    "time": { "beats": 4, "beatUnit": 4 },
    "bars": [
      {
        "events": [
          { "kind": "note", "pitches": [{ "letter": "B", "accidental": 0, "octave": 4 }], "duration": { "value": "minim", "dots": 0 } },
          { "kind": "note", "pitches": [{ "letter": "B", "accidental": 0, "octave": 4 }], "duration": { "value": "minim", "dots": 0 } }
        ]
      },
      {
        "events": [
          { "kind": "note", "pitches": [{ "letter": "B", "accidental": 0, "octave": 4 }], "duration": { "value": "minim", "dots": 0 } },
          { "kind": "note", "pitches": [{ "letter": "B", "accidental": 0, "octave": 4 }], "duration": { "value": "crotchet", "dots": 0 } },
          { "kind": "note", "pitches": [{ "letter": "B", "accidental": 0, "octave": 4 }], "duration": { "value": "minim", "dots": 0 } }
        ]
      }
    ]
  },
  "select": "bar",
  "mistake": { "bar": 1 },
  "explanation": "[[bar|Bar]] 2 has 5 beats: a [[minim|minim]] (2), a [[crotchet|crotchet]] (1) and another [[minim|minim]] (2). That is one beat too many."
}
```

## 3. Generators

A generator turns `params` from a lesson file into a payload, using only the
`Rng` it is given (`src/lesson/contracts.ts`, `QuestionGenerator`). The same
seed and params must always give the same question, so the order of `rng`
calls below is part of the specification. Do not add, remove or reorder calls.

`paramsSchema` applies the stated defaults and rejects unknown keys. The
generated payload must pass the question type's `payloadSchema`.

Generators live in `src/lesson/generators/<id>.ts`.

### 3.1 `name-note-on-stave`

A random note within a clef and range. The learner names it (`identify`) or
places it (`place`). Produces a `note-on-stave` question.

```ts
export interface NameNoteOnStaveParams {
  mode: 'identify' | 'place';
  clef: Clef;
  /** Lowest and highest note that can be drawn, inclusive. Both naturals. */
  low: Pitch;
  high: Pitch;
  /** Limit the draw to notes on lines or in spaces. Default 'all'. */
  positions?: 'all' | 'lines' | 'spaces';
  /** Key signature shown. Default C major. */
  key?: Key;
  /** true: the note may get a sharp or flat of its own. Default false. */
  accidentals?: boolean;
}
```

Validation: `low` and `high` are naturals; `low` is below `high`; after the
`positions` filter at least three candidates remain; the stave positions of
`low` and `high` are from -4 to 12.

Algorithm:

1. `lo = pitch.stavePosition(low, clef)`, `hi = pitch.stavePosition(high, clef)`.
   `candidates` = every integer from `lo` to `hi`, ascending, keeping even
   numbers only for `'lines'` and odd numbers only for `'spaces'`. (Ledger
   lines are even, so they count as lines.)
2. `pos = rng.pick(candidates)`. `natural = pitch.pitchAtStavePosition(pos, clef)`.
3. Choose the accidental:
   - `accidentals` true: `a = rng.pick([-1, 0, 1])`. If that gives E♯, B♯, C♭
     or F♭, use 0 instead. (Do not draw again.)
   - `accidentals` false: `a` is the accidental the key signature gives this
     letter (from `pitch.signatureAccidentals(pitch.keySignature(key))`), or 0.
4. `note = { letter: natural.letter, accidental: a, octave: natural.octave }`.
5. `needsSigns = accidentals || pitch.keySignature(key) !== 0`.

Output:

| `mode` | `GeneratedQuestion` |
| --- | --- |
| `identify` | `{ type: 'note-on-stave', payload: { mode: 'identify', clef, key, pitch: note, accidentals: needsSigns } }`, no `prompt` (the authored prompt is used) |
| `place` | `{ type: 'note-on-stave', payload: { mode: 'place', clef, key, target: { letter, accidental: a }, accidentals: needsSigns }, prompt }` with `prompt = "Put the note **" + pitch.displayPitchClass(target) + "** on the stave."` |

`place` never sets `octave`: any octave is accepted.

Example in a lesson file:

```json
{
  "id": "p2-name-the-note",
  "type": "note-on-stave",
  "skill": "pitch.treble.lines",
  "prompt": "Which note is this?",
  "hint": "Count up the lines from the bottom: E, G, B, D, F.",
  "source": "generated",
  "generator": {
    "id": "name-note-on-stave",
    "params": {
      "mode": "identify",
      "clef": "treble",
      "low": { "letter": "E", "accidental": 0, "octave": 4 },
      "high": { "letter": "F", "accidental": 0, "octave": 5 },
      "positions": "lines"
    }
  }
}
```

With a seed whose first `rng.pick` returns position 2, the payload is the JSON
example in 2.4.

### 3.2 `tap-note-values`

A short random rhythm built from a set of allowed note values. Produces a
`tap-rhythm` question.

```ts
export interface TapNoteValuesParams {
  time: TimeSignature;
  /** Note values the rhythm may use. 1 to 6, all different, no tuplets. */
  values: Duration[];
  /** Values that must each appear at least once. Each must also be in `values`. Default []. */
  require?: Duration[];
  /** Number of bars, 1 to 4. */
  bars: number;
  /** Felt beats per minute, 50 to 120. */
  bpm: number;
  /** Passed through to the payload. Defaults: true, false. */
  showNotation?: boolean;
  listenFirst?: boolean;
}
```

Validation: as the field comments say; `rhythm.metreKind(time)` is `'simple'`
(compound time is added in Phase 1); at least one of `showNotation` and
`listenFirst` is true. Version 1 never generates rests or ties.

Definitions: `beat = rhythm.beatLength(time)`; `full = rhythm.barLength(time)`;
`offset` is the length already placed in the current bar. Keep `values` in the
order given.

A value `v` of length `L` is **allowed at** `offset` when all of these hold:

1. It fits: `offset + L <= full`.
2. If `offset` is not a whole number of beats, the note ends at or before the
   next beat (`offset + L <=` the next multiple of `beat`). This stops
   off-beat notes hiding a beat.
3. In 4/4 only (`time.beats === 4 && time.beatUnit === 4`): if `offset > 0`
   and `offset < full / 2`, then `offset + L <= full / 2`. This stops a note
   that starts after beat 1 from crossing the middle of the bar.

Algorithm:

1. Repeat up to 50 times (an "attempt"):
   1. For each bar in turn, start with `offset = 0` and no events. While
      `offset < full`: `allowed` = the values allowed at `offset`, in `values`
      order. If `allowed` is empty, abandon this attempt. Otherwise
      `v = rng.pick(allowed)`; append a note of duration `v`; add its length
      to `offset`.
   2. If every duration in `require` appears in some bar, stop: this is the
      rhythm.
2. If 50 attempts fail, throw `TheoryError` ("tap-note-values could not build a
   rhythm from these params").

Every note is `{ kind: 'note', pitches: [B4], duration: v }` with
`B4 = { letter: 'B', accidental: 0, octave: 4 }`.

Output:

```ts
{
  type: 'tap-rhythm',
  payload: { time, bars, bpm, countInBars: 1, showNotation, listenFirst },
}
```

No `prompt` is returned; the authored prompt is used.

Example in a lesson file (from the exemplar lesson):

```json
{
  "id": "p4-tap-the-rhythm",
  "type": "tap-rhythm",
  "skill": "rhythm.perform.crotchet-minim",
  "prompt": "Listen, then tap this rhythm. One tap for each note. Remember: hollow means hold.",
  "source": "generated",
  "generator": {
    "id": "tap-note-values",
    "params": {
      "time": { "beats": 4, "beatUnit": 4 },
      "values": [{ "value": "crotchet", "dots": 0 }, { "value": "minim", "dots": 0 }],
      "require": [{ "value": "crotchet", "dots": 0 }, { "value": "minim", "dots": 0 }],
      "bars": 2,
      "bpm": 80,
      "showNotation": true,
      "listenFirst": true
    }
  }
}
```

With these params rule 3 means a 4/4 bar is always one of: four crotchets;
crotchet, crotchet, minim; minim, crotchet, crotchet; minim, minim. Crotchet,
minim, crotchet is never produced.

## 4. Quick reference

| Type | Learner does | Answer | Score | Reason comes from |
| --- | --- | --- | --- | --- |
| `multiple-choice` | picks one option | `{ optionId }` | 0 or 1 | author, per wrong option |
| `match-up` | pairs left with right | `{ pairs }` | fraction of pairs | author, per left item, plus a count |
| `ordering` | sorts items | `{ order }` | fraction in place | author, one rule, plus a position |
| `note-on-stave` | names or places a note | tagged by mode | 0 or 1 | template |
| `play-keyboard` | plays keys | `{ played }` | fraction of notes | template |
| `tap-rhythm` | taps the pad | `TapResult` | hits minus extras, pass at 0.8 | template |
| `by-ear` | listens, picks one option | `{ optionId }` | 0 or 1 | author, per wrong option |
| `complete-bar` | adds notes or rests | `{ added }` | 0 or 1 | template |
| `spot-mistake` | taps a bar or note | `{ bar, event? }` | 0 or 1 | template plus author's explanation |
