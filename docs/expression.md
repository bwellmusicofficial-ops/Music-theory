# Expression: dynamics, articulation, tempo changes, repeats and signs

Status: accepted design (17 November 2026). Types are in `src/engine/types.ts`
(`Expression`, `Articulation`, `EndBarline`, `BarMarker`, the new optional
fields on `NoteEvent`, `RestEvent`, `Bar` and `Passage`). Build tasks E1 to E4
at the end implement it.

## 1. Why

Grade 1 examines dynamics (pp to ff, crescendo, diminuendo), tempo words and
changes (accelerando, ritardando, rallentando, a tempo), articulation (staccato,
accent, slur, legato), the pause, repeat marks, D.C., D.S., Fine and metronome
marks. Today the audio engine plays every note at one loudness and one tempo,
and the stave cannot draw any of these signs, so the three terms lessons teach
them in words only. That breaks the product's first principle, sound first, and
the second, show don't tell.

After this work a passage can carry these markings, the stave draws them
exactly as they appear in print, and playback makes them audible.

## 2. The data (summary of the types)

- **Per note:** `articulations?: ('staccato' | 'accent' | 'tenuto')[]`,
  `fermata?: boolean`. Rests may have `fermata`.
- **Per bar:** `repeatStart?`, `endBarline?: 'single' | 'double' | 'final' |
  'repeat-end'`, `marker?: 'segno' | 'fine' | 'dc' | 'dc-al-fine' | 'ds' |
  'ds-al-fine'`.
- **Per passage:** `expression?` with `dynamics`, `hairpins`, `slurs`, `tempo`,
  `tempoChanges` and `words`. Positions are `EventRef { bar, event }`; spans are
  inclusive `{ from, to }`.

Rules (enforced by `validateExpression`, task E1):

1. Every `EventRef` points at an existing event.
2. In a span, `to` is at or after `from`. Slurs join two or more different
   NOTES (both ends are notes, and they are not the same note); a slur may
   cross bar lines.
3. Dynamics sit on any event; at most one per event; two dynamics in a row
   are different levels.
4. Hairpins do not overlap other hairpins.
5. `tempo.bpm` is 20 to 240. `toBpm` likewise. An `a-tempo` must come after an
   accel/rit/rall that has ended.
6. `words.text` is 1 to 24 characters.
7. Repeat structure is well formed: every `repeat-end` has a matching earlier
   `repeatStart` or none at all (meaning "from the beginning"); at most one
   segno; `ds` and `ds-al-fine` need a segno; `*-al-fine` needs a `fine`.
8. A tied note's continuation carries no articulation or fermata of its own
   (the first note of a tie carries them).

These are deliberately the Grade 1 to 5 set. Trills and other ornaments,
glissandi, first and second time bars, coda, and multi-voice expression are
out of scope until a lesson needs them.

## 3. How it sounds (playback)

All of this lives in `src/audio` and applies to `playPassage` and therefore to
every exhibit, by-ear clip and game that plays a passage. **A passage with no
expression fields must sound exactly as it does today** (a test pins this).

### Loudness

| Level | Gain relative to the current default |
| --- | --- |
| pp | -15 dB |
| p | -10 dB |
| mp | -5 dB |
| mf | 0 dB (today's `DEFAULT_VELOCITY`) |
| f | +4 dB |
| ff | +7 dB |

- Convert to the velocity Tone receives as `velocity = DEFAULT_VELOCITY ×
  10^(dB/20)`, capped at 1. If `DEFAULT_VELOCITY` is too close to 1 for +7 dB to
  fit, lower `DEFAULT_VELOCITY` for passages that have dynamics only, keeping the
  same steps, so the steps stay audible. Check the synth voice actually scales
  with velocity; if it does not, apply the gain per note another way.
- A passage with no dynamics plays at mf. A passage whose first dynamic comes
  later plays at mf until then.
- **Hairpins** change loudness smoothly, note by note, from the level in force
  at the hairpin's first event to the level of the next dynamic after its last
  event. If there is no later dynamic, go two steps up (cresc) or down (dim),
  clamped to pp and ff.
- **Accent:** +5 dB on that note only. Notes inside a slur: no change.
- `words` with text "cresc.", "crescendo", "dim.", "diminuendo", "decresc." or
  "decrescendo" act like a hairpin running to the next dynamic, or to the end
  of the bar after next if there is none.

### Length (articulation)

Onset times never change because of articulation; only how long each note
sounds.

- If the passage has **no** articulation and **no** slur anywhere: every note
  sounds its full written length, as today.
- Otherwise, a plain note sounds 85% of its written length (a small gap, so
  detached and joined playing can be heard against each other).
- **Staccato:** 40% of the written length, at least 60 ms.
- **Tenuto:** 100%.
- **Under a slur:** 100% plus a 20 ms overlap into the next note, except the
  last note of the slur, which is a plain note.
- Ties are unchanged: tied notes sound as one, and the articulation of the
  first note of the tie applies to the whole.

### Time (pause and tempo changes)

- **Fermata:** the note or rest lasts twice its written length; everything
  after it moves later by that extra time. A fermata on the last event of a
  passage adds a held ending.
- **tempo.bpm:** the passage's metronome mark. `playPassage`'s `bpm` option
  stays authoritative (it is how every caller already controls speed), and a
  content test checks that any lesson passage showing a metronome mark is
  played at that bpm.
- **accel / rit / rall:** across the span, the tempo moves smoothly (linearly in
  beats) from the tempo in force at `from` to `toBpm`. Defaults: accel ×1.35,
  rit ×0.7, rall ×0.65 of the starting tempo. After the span the new tempo
  holds until `a-tempo`, which returns to the tempo before the change.
- `words` "rit.", "rall.", "accel." with no span act over the rest of their bar
  and the whole of the next.

The rhythm engine's `onsetTimes` (used to score tapping) knows nothing about
any of this. **Tap-rhythm payloads must not contain fermatas, tempo changes or
repeats;** the tap-rhythm schema rejects them (task E1).

### Repeats and navigation

Playback follows the written order:

1. Play to a `repeat-end`; jump back to the nearest earlier `repeatStart` (or
   the beginning); play through the repeat-end the second time.
2. At a bar marked `dc` / `dc-al-fine`: go back to the beginning. At `ds` /
   `ds-al-fine`: go back to the segno.
3. After a D.C. or D.S., do not take repeats again (the usual convention), and
   with "al fine" stop at the end of the bar marked `fine`.

The engine provides the order (task E1); audio follows it. `onEvent(bar, event)`
always reports the written position, so the playback cursor jumps back on the
stave as the music does.

## 4. How it looks (the stave)

Everything is drawn by VexFlow 5 inside the existing render, so it scales,
themes and prints with the notes. Names confirmed in `node_modules/vexflow`:

| Marking | VexFlow | Placement |
| --- | --- | --- |
| staccato, accent, tenuto | `Articulation('a.')`, `('a>')`, `('a-')` | on the notehead side away from the stem |
| fermata | `Articulation('a@a')` | above the stave |
| dynamics | Bravura dynamic glyphs (`TextDynamics` or SMuFL text) | below the stave, under the event, left-aligned to the notehead |
| hairpins | `StaveHairpin` | below the stave, from the first event's x to the last event's right edge |
| slurs | `Curve` | over the noteheads, on the side away from stems; visibly flatter and longer than a tie |
| tempo text and metronome mark | `StaveTempo` | above bar 1, bold Italian word then "♩ = 80" |
| words | `Annotation` or SVG text in italics | above or below as given; `lang` attribute set |
| repeat bar lines | `stave.setBegBarType(REPEAT_BEGIN)`, `setEndBarType(REPEAT_END / DOUBLE / END)` | at the bar |
| segno, D.C., D.S., Fine | `StaveRepetition` | segno at the start of its bar; D.C./D.S./Fine at the end, above |

Layout rules:

- The layout plan reserves room: extra top space when any tempo, fermata, words
  above or bar marker is present; extra bottom space when any dynamic, hairpin
  or words below is present. Passages without them keep today's height exactly.
- Slurs and hairpins that cross a system break are drawn in two parts.
- Colour comes from the same CSS classes as other notation (`--text`), with a
  class per kind (`mtn-dyn`, `mtn-hairpin`, `mtn-slur`, `mtn-artic`,
  `mtn-fermata`, `mtn-tempo`, `mtn-words`, `mtn-repeat`) so tests can find them.
- Marks, cursor, hit-testing and the overlay are unaffected.
- **Edit mode:** expression is shown but not editable in this phase. The edit
  reducer must keep refs valid when events are inserted or deleted: shift refs
  after an insertion; on deletion drop dynamics, words and articulation on the
  deleted event and shrink or drop spans whose endpoint vanished.
- **Accessibility:** the passage description (`src/components/stave/a11y`) adds
  the markings in reading order, in words: "mezzo forte", "getting louder from
  bar 1 to bar 2", "staccato", "slurred from note 1 to note 4", "pause on the
  last note", "repeat from the beginning", "Allegro, 120 crotchets a minute"
  (US: "quarter notes"). Italian words are read with `lang="it"`.

## 5. What lessons can do with it

- Hear loud against quiet, getting louder and quieter, speeding up and slowing
  down, smooth against detached, accented notes, and a pause, in by-ear
  questions and exhibits.
- See every sign in print in exhibits and passage faces, so multiple-choice and
  match-up can ask "which sign means...?" with the real sign.
- Spot-mistake can point at a sign that is wrong for the sound.

One gap remains: the on-screen keyboard has no touch loudness, so "play it
gently, then firmly" is still not possible. Pointer pressure is not reliable on
phones; leave it.

## 6. Build tasks

| Task | Model | Owns | Depends on |
| --- | --- | --- | --- |
| E1 Engine and schemas | Sonnet | `src/engine/expression/` (new); the Zod passage schemas in `src/lesson/questions/face-view/face-schema.ts` and `src/lesson/schema.ts` exhibit passage validation; tap-rhythm schema refinement | this document |
| E2 Playback | Sonnet | `src/audio/**` | E1 |
| E3 Notation | Sonnet | `src/components/stave/**` | E1 (types only; can start in parallel with E2) |
| E4 Lessons | Sonnet | the three files in `content/lessons/1/terms-1/` plus one new lesson file | E2, E3, owner's go-ahead to split lesson 3 |

**E1** delivers, in `src/engine/expression/` and exported from the engine:
`validateExpression(passage): string[]` (empty when valid; messages name the
bar and event), `performanceOrder(passage): number[]` (bar indexes in playing
order per section 3), `loudnessAt(passage): number[][]` (dB relative to mf for
every note, per bar and event, applying dynamics, hairpins, accent and the
cresc./dim. words), `soundingLengths(passage): number[][]` (fraction of written
length per note), and `tempoMap(passage, baseBpm)` (seconds for any beat
position, applying fermatas and tempo changes). All pure, table-tested by hand.
Extend the Zod passage schemas to accept the new optional fields (they are
strict objects today and would reject them), add `validateExpression` to the
lesson content test, and make tap-rhythm payloads reject fermatas, tempo
changes and repeats.

**E2** uses those functions in `playPassage`: velocity per note, sounding
length per note, times from the tempo map, events in performance order with
`onEvent` reporting written positions. Tests: scheduled times, durations and
velocities for a table of passages; a passage with no expression schedules
identically to today (snapshot before changing anything).

**E3** draws everything in section 4 and extends the description. Tests: each
marking produces its classed SVG element; heights unchanged without
expression; the edit reducer keeps refs valid. A dev harness page showing one
passage with every marking, checked in Chrome at 390 px and in both themes, and
added to the e2e suite with `expectNotationDrawn`.

**E4** rewrites the terms lessons to hear and see what they teach, following
`docs/lesson-authoring-guide.md` and `docs/briefs/lesson-author.md`, and splits
the old signs lesson into two (now `g1-terms-03-smooth-short-and-held` and
`g1-terms-04-repeats-and-road-signs`) (articulation and the pause;
repeats, D.C., D.S., Fine and the metronome mark). The lessons stay drafts.
