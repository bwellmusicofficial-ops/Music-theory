# New question types: bar lines, beaming, key signatures, finding features

Status: design accepted by the orchestrator (Opus), 18 Nov 2026. Closes backlog
item 4 in `docs/handover.md`. Follows every rule in `docs/question-payloads.md`
section 1 (strict Zod schemas, pure `mark`, no shuffling, restore and report
props, reason rules and helpers). Read that section first.

Four new types:

| Type | Grade 1 skill | Learner does |
| --- | --- | --- |
| `place-bar-lines` | Add missing bar lines | Taps the gaps between notes where bar lines go |
| `fix-beaming` | Group quavers correctly | Taps between quavers to join or split beams |
| `write-key-signature` | Write the key signatures of C, G, D, F major | Places sharps or flats on the stave |
| `find-in-passage` | Find a named feature in a passage | Taps every note, rest or bar that matches a prompt |

One contract change, one engine addition and two stave additions support them
(section 1). All are additive and backward compatible: no existing lesson JSON
changes.

## 1. Support work

### 1.1 Contract: written beams (`src/engine/types.ts`)

```ts
export interface Bar {
  // ...existing fields
  /**
   * Beams as written, overriding the standard beaming. Each group is ascending,
   * consecutive event indexes of notes of a quaver or shorter, at least two.
   * Absent: beamed by the standard rule (rhythm.beamGroups). [] means no beams.
   */
  beams?: number[][];
}
```

- Validation (in the passage shape schema, `face-schema.ts`): every group has 2+
  indexes, consecutive and ascending, each a note (not a rest) of quaver value
  or shorter, no index in two groups.
- The stave (`to-vexflow.ts` `beamIndexGroups`) uses `bar.beams` when present.
- Audio ignores beams. `rhythm.beamGroups` is unchanged and remains the
  standard; marking compares against it.
- Existing editors (`use-stave-editor`) drop `beams` from a bar they change,
  because indexes would go stale. Note this in `docs/stave-interaction.md`.

This also lets `spot-mistake` and `multiple-choice` show a wrongly beamed bar,
which no lesson can do today.

### 1.2 Engine: where key-signature signs sit (`pitch` in `src/engine/api.ts`)

```ts
/**
 * Stave positions (pitch.stavePosition numbering: 0 = bottom line) of each
 * sign in a key signature, in written order, for the standard layout.
 * Treble sharps F C G D A E B sit at 8 5 9 6 3 7 4; treble flats B E A D G C F
 * at 4 7 3 6 2 5 1. Bass is the treble pattern two positions lower. Alto and
 * tenor follow their standard layouts.
 */
keySignaturePositions(signature: KeySignature, clef: Clef): number[];
```

The builder must check this table against where VexFlow actually draws each
key signature in every clef the engine supports, in a stave test (the engine
itself may not import VexFlow). If they disagree, stop and report: the owner
rules on music.

### 1.3 Stave: gap toggles (`src/components/stave`)

A new read-mode option for choosing places *between* events.

```ts
interface StaveProps {
  // ...
  /** Read mode only. Toggleable places between consecutive events. */
  gaps?: {
    /** Which gaps are offered. A gap is identified by the event before it. */
    offered: { bar: number; event: number }[];
    /** Which offered gaps are currently on. */
    on: { bar: number; event: number }[];
    onToggle: (at: { bar: number; event: number }) => void;
    /** Spoken name of one gap, e.g. "Bar line after note 3". */
    label: (at: { bar: number; event: number }) => string;
  };
}
```

- Each offered gap is a transparent button centred halfway between the two
  events' `centreX`, full stave height, at least 44 px wide where the gap
  allows (narrower only when notes are closer than that; never under 24 px).
- An "on" gap shows a thin accent-coloured marker; a focused gap shows the
  focus ring. Never colour alone: on gaps also have `aria-pressed="true"` and
  the marker is a visible line, off gaps show nothing until hover or focus.
- Keyboard: one tab stop, arrows move between gaps, Space or Enter toggles
  (roving tabindex, like `stave-event-buttons.tsx`).
- Gaps can be combined with neither `onEventTap` nor edit mode.

The two types below use this differently: `place-bar-lines` re-renders the
passage with real bar lines where the learner has put them; `fix-beaming`
re-renders with `bar.beams` built from the learner's joins.

### 1.4 Stave: key-signature edit (`edit.kind: 'key-signature'`)

```ts
interface StaveEditOptions {
  kind?: 'free' | 'single-note' | 'key-signature';
  // ...
}
interface StaveProps {
  /** With edit.kind 'key-signature': the signs drawn instead of the passage's key signature. */
  keySignatureSigns?: { sign: 1 | -1; position: number }[];
  /** With edit.kind 'key-signature': the learner tapped this stave position. */
  onKeySignatureTap?: (position: number) => void;
}
```

- The stave is drawn with the clef, an empty key-signature area wide enough for
  seven signs, and no notes (the passage has one bar holding a semibreve rest
  that is not drawn, or the component hides events). The signs in
  `keySignatureSigns` are drawn left to right at the standard key-signature
  spacing, with VexFlow's accidental glyphs.
- A tap anywhere in the area reports the nearest stave position from -1 to 9
  using the existing vertical mapping (2.4 in `docs/stave-interaction.md`),
  with the loupe and ghost sign while dragging, as in single-note mode.
- Keyboard: Up and Down move a ghost sign through positions, Enter places it.
  The announcement names the position in words (`where(pos)`) and the letter
  ("top line, F").

## 2. `place-bar-lines`

The passage is shown with its inner bar lines missing. The learner adds them.

```ts
export interface PlaceBarLinesPayload {
  /** The passage as it should be barred. Every bar full. 2 to 4 bars, 4 to 12 events. */
  passage: Passage;
}

export interface PlaceBarLinesAnswer {
  /** Bar lines the learner placed, as indexes into the flat event list: a bar line after event i. */
  after: number[];
}
```

Validation: 2 to 4 bars; 4 to 12 events in total; every bar full; no ties
(`tieToNext`) anywhere; no expression markings or repeat barlines; every note's
pitches agree with the key signature (no accidentals drawn in the passage), so
moving bar lines never changes which accidentals are shown. The time signature
is always shown.

Component: flatten the events. Render a passage whose bars are split at the
learner's current `after` set (bars may be short or long; the stave draws them).
Offer a gap after every event except the last; the final barline is always
drawn. Tapping a gap toggles a bar line there. Gap labels: `Bar line after
note 3` / `after rest 3` (1-based, counting all events). A Check button, enabled
once at least one bar line is placed, commits `after` sorted ascending.

Marking: split the flat events at `after` into learner bars. Correct when every
learner bar is complete (`rhythm.checkBarLength`). With no ties this is the same
as matching the passage's own bar lines. `score` 1 or 0.

Reasons (first learner bar that is not complete, numbered 1-based; `total` its
length, `full` the bar length, `diff` the difference):

| Wrong answer | Template |
| --- | --- |
| Too long | `{Bar} {n} holds {beats(total)}, but each {BAR} holds {beats(full)}. It needs a bar line {beats(diff)} sooner.` |
| Too short | `{Bar} {n} holds only {beats(total)}, but each {BAR} holds {beats(full)}. Its bar line comes {beats(diff)} too soon.` |

Generator `place-bar-lines`: uses the existing rhythm generators' bar builder
(Grade 1 durations and time signatures from `docs/generators-grade-1.md`), 2 to
3 bars, B4 for rhythm-only or a stepwise C major tune; no bar may be identical
to the one before (the answer would be guessable by pattern alone is fine; two
identical bars are just dull). Seeded and replayable like every generator.

## 3. `fix-beaming`

A bar of quavers is beamed wrongly. The learner joins and splits beams.

```ts
export interface FixBeamingPayload {
  /** One bar is beamed wrongly with `bars[barIndex].beams`; others are beamed normally. */
  passage: Passage;
  barIndex: number;
}

export interface FixBeamingAnswer {
  /** The learner's beam groups for the bar, in the same form as Bar.beams. */
  beams: number[][];
}
```

Validation: `barIndex` points at a bar with `beams` set; that bar is full and
its `beams` differ from `rhythm.beamGroups` (restricted to beamable notes, as
`beamIndexGroups` does); the bar has at least four beamable notes; no other bar
has `beams`.

Component: start from the payload's beams. Offer a gap between each pair of
consecutive events in the bar that are both beamable notes. A gap is "on" when
the two notes are beamed together. Tapping toggles the join; the bar re-renders
with the new `beams`. Gap labels: `Join note 2 and note 3` (aria-pressed shows
whether joined). A Reset button returns to the payload's beams. Check commits.

Marking: correct when the learner's groups (only groups of 2+) equal the
standard groups, or the standard groups with any multi-beat group beamed one
beat at a time (both are correct; see `docs/question-payloads.md` 2.11).
`score` 1 or 0.

Reasons:

| Wrong answer | Template |
| --- | --- |
| A beam crosses a beat it should show | `Notes {a} and {b} are joined, but a beam should not cross from beat {x} into beat {y}. Beam each beat's quavers together.` |
| Notes in one beat not joined | `Notes {a} and {b} are in the same beat, so they are beamed together.` |
| 4/4: a beam crosses the middle of the bar | `A beam should not cross the middle of a 4/4 {BAR}, between beats 2 and 3.` |
| Compound time | `In {time} the quavers are grouped in threes, one group for each dotted crotchet beat.` |

(Use the first difference from the left. Note numbers count events in the bar,
1-based. Use `nvs` for "quavers" so US terms swap.)

Generator `fix-beaming`: build a correct Grade 1 bar with at least four quavers
(2/4, 3/4, 4/4; 6/8 from Grade 2), then apply one of: beam everything together;
split one standard group; join across the middle of a 4/4 bar; join across a
beat in 3/4. Check the result differs from standard.

## 4. `write-key-signature`

```ts
export interface WriteKeySignaturePayload {
  clef: Clef;
  /** Must have 1 to 7 sharps or flats (not C major or A minor). */
  key: Key;
  /** 'standard' (default): each sign must sit at its standard position. 'any-octave': the right letter at any position. */
  placement?: 'standard' | 'any-octave';
}

export interface WriteKeySignatureAnswer {
  /** Signs left to right. */
  signs: { sign: 1 | -1; position: number }[];
}
```

The prompt names the key from the lesson text, e.g. "Write the key signature of
D major". The component does not name it again.

Component: the key-signature stave (1.4). A two-button palette, ♯ and ♭ (the
chosen sign is pressed; default ♯). Each tap appends a sign of the chosen kind
at the tapped position. Undo removes the last; Clear removes all. At most seven
signs. Check commits, enabled once at least one sign is placed.

Marking, with `want` = the key's signs from `pitch.signatureAccidentals` and
`wantPos` = `pitch.keySignaturePositions`. Correct when: the count matches; every
sign is the right kind; the letter at each position (`pitch.pitchAtStavePosition`)
matches `want` in order; with `'standard'`, each position equals `wantPos`.

Reasons (first that applies; `{K}` is `pitch.keyName`; `{list}` the signs in
order, e.g. `F♯ and C♯`; signs written as `[[sharp|sharps]]`/`[[flat|flats]]`):

| Wrong answer | Template |
| --- | --- |
| Wrong kind | `{K} has {sharps\|flats}, not {flats\|sharps}. Its key signature is {list}.` |
| Wrong count | `That is {n} {sign(s)}. {K} has {k}: {list}.` |
| Right letters, wrong order | `Those are the right {signs}, but key signatures are written in a fixed order: {list}.` |
| Wrong letter | `The {ordinal} {sign} is {where(pos)}, which is {L}. In {K} it should be {want[i]}.` |
| Right letter, wrong octave (standard only) | `{want[i]} is right, but in a key signature it goes {where(wantPos[i])}, not {where(pos)}.` |

**Owner ruling (19 Nov 2026): strict.** A sign in the wrong octave is wrong,
as an examiner would mark it. `'standard'` is the default; `'any-octave'` stays
available but should be used only with the owner's agreement.

Generator `write-key-signature`: keys from the grade's list (Grade 1: G, D and F
major; treble and bass clefs), never C major. Grade 2 adds A, B♭, E♭ major and
A, E, D minor, and so on from the engine's key lists.

## 5. `find-in-passage`

A generalised spot-the-thing: the learner taps every event (or bar) matching a
prompt such as "Tap every dotted note" or "Tap the bar with a tie".

```ts
export interface FindInPassagePayload {
  passage: Passage;
  select: 'event' | 'bar';
  /** Every correct place. 1 to 6. */
  targets: { bar: number; event?: number }[];
  /** What the learner is looking for, as a short noun phrase for the reason text: "dotted notes". */
  feature: RichText;
}

export interface FindInPassageAnswer {
  /** Places the learner chose, sorted by bar then event. */
  chosen: { bar: number; event?: number }[];
}
```

The question's prompt (lesson text) says what to tap and, when there is more
than one, says so: "Tap all three dotted notes". Telling the number keeps it
fair and is the author's job; the component shows "2 of 3 chosen".

Validation: every target exists; `event` present exactly when `select` is
`'event'`; no duplicates; `feature` at most 8 words.

Component: read mode with `onEventTap` (or a whole-bar tap, as `spot-mistake`
does). Each tap toggles that place in or out of the selection; selected places
are highlighted (outline plus `aria-pressed`, never colour alone). The counter
reads "{chosen} of {targets} chosen". Check is enabled when the number chosen
equals the number of targets.

Marking: correct when `chosen` equals `targets` as sets. `score` = correct
chosen ÷ targets (partial credit), `correct` only when all match.

Reasons:

| Wrong answer | Template |
| --- | --- |
| Some wrong | `{right} of your {n} choices {is\|are} right. Look again at {bar list of the missed targets}.` (bar list: `bar 2`, `bars 1 and 3`) |
| None right | `None of those are {feature}. There {is\|are} {n} in {bar list}.` |

Generators: none in this task. Authors write these by hand; a later task can
add `find-dotted-notes` and similar.

## 6. Build tasks

1. **Q1 (Sonnet), stave and engine:** 1.1 to 1.4, the VexFlow cross-check for
   1.2, a `/dev/question-types-2` harness, unit and component tests, Chrome
   screenshots at 390 px in both themes.
2. **Q2 (Sonnet), the four types:** sections 2 to 5 in
   `src/lesson/questions/`, registered in `QUESTION_TYPES`, documented in
   `docs/question-payloads.md` (sections 2.10 to 2.13), with the three
   generators, mark tests covering every reason template, and e2e coverage in
   the harness and the sweep. Depends on Q1.
3. **Q3 (Sonnet), lessons:** add questions of the new types to the relevant
   Grade 1 draft lessons (bar lines and grouping in the rhythm strand, key
   signatures in the keys strand), as drafts. Depends on Q2.

Q1 and Q2 can be one agent in one worktree if that is cheaper; Q3 follows.
