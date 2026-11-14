# Interactive stave: interaction design (P0-07)

Status: design for P0-08 to implement. Owner of the implementation folder:
`src/components/stave/`. This document is the specification; where it gives a
number, that number is the starting value and lives in `constants.ts` so it can
be tuned during the manual checks in section 10 without touching logic.

Terms used throughout:

- **Unit**: one VexFlow user unit. Stave lines are 10 units apart, so one stave
  position (line to next space) is 5 units.
- **Scale**: CSS pixels per unit.
- **Position**: the engine's `stavePosition` number. Bottom line 0, top line 8.
- **Event**: one `ScoreEvent` (note, chord or rest), addressed as `bar:event`.
- **Head**: one pitch of a note event, addressed as `bar:event:pitchIndex`.
- **Slot**: an insertion point in a bar. A bar with `n` events has slots `0..n`.
- **Sign**: an accidental glyph actually drawn beside a head, or `null`.

## 0. VexFlow 5 facts this design relies on

All of these were confirmed against the installed package
(`vexflow@5.0.0`, `node_modules/vexflow/build`) by reading the type
declarations and running a render under jsdom. P0-08 should use exactly these
names.

| Need | Use | Confirmed behaviour |
| --- | --- | --- |
| Import | `import('vexflow/bravura')` (package export `./bravura`) | Embeds Bravura and Academico as data URLs, calls `VexFlow.setFonts('Bravura', 'Academico')`. No network fetch. The default `vexflow` entry also embeds Petaluma and Gonville, which we do not want. |
| Font readiness | `document.fonts.load('30pt Bravura')` | VexFlow 5 draws glyphs as SVG `<text>` and measures them with a canvas 2D context (`Element.measureText`). Layout before the font is loaded gives wrong widths. Notation glyphs are emitted at `font-size="30pt"`. |
| Renderer | `new Renderer(div, Renderer.Backends.SVG)`, `renderer.resize(w, h)`, `renderer.getContext()` | Context is an `SVGContext`; `ctx.svg` is the `<svg>`; `ctx.setViewBox(x, y, w, h)`; `ctx.clear()` removes all children. |
| Root attributes | (none to call) | The root `<svg>` is emitted with `pointer-events="none" fill="black" stroke="black"`. These are presentation attributes, so a CSS rule overrides them. |
| Stave | `new Stave(x, y, width)`, `addClef(name)`, `addKeySignature(spec)`, `addTimeSignature('3/4')`, `setEndBarType(BarlineType.END)`, `setContext(ctx).draw()` | Clef names `treble`, `bass`, `alto`, `tenor` all exist. Top line is drawn at `y + 40` (`spaceAboveStaffLn: 4`). Key specs are major-key names (`'C'`, `'F#'`, `'Cb'`, ...). |
| Geometry | `stave.getNoteStartX()`, `stave.getNoteEndX()`, `stave.getYForNote(line)`, `stave.getYForLine(n)` | `getYForNote` uses VexFlow's note line where the bottom stave line is 1 and the top is 5. Therefore `vfLine = position / 2 + 1` and `y(position) = stave.getYForNote(position / 2 + 1)`. Checked: treble F4 is `line 1.5`, B4 is `line 3`, C4 is `line 0`. |
| Ledger line colour | `stave.setDefaultLedgerLineStyle({ strokeStyle: 'currentColor', lineWidth: 1.5 })` | Default is a hard-coded `#444`. |
| Notes | `new StaveNote({ keys, duration, dots, clef, stemDirection })` | Keys are `'f/4'` (letter, slash, octave). Duration codes: breve `'1/2'`, semibreve `'w'`, minim `'h'`, crotchet `'q'`, quaver `'8'`, semiquaver `'16'`, demisemiquaver `'32'`. Append `'r'` for a rest. `Stem.UP === 1`, `Stem.DOWN === -1`. Seconds in a chord are displaced automatically. |
| Dots | `Dot.buildAndAttach([note], { all: true })` | Adds ONE dot per call. Call it once per dot. `dots` in the struct sets the tick length only. |
| Accidentals | `note.addModifier(new Accidental(type), pitchIndex)` | Types `'#'`, `'b'`, `'n'`, `'##'`, `'bb'`. Accidental columns for chords are laid out by VexFlow. Do not use `Accidental.applyAccidentals`; we decide signs ourselves (section 4.2). |
| Voice | `new Voice({ numBeats, beatValue }).setMode(VoiceMode.SOFT).addTickables(notes)` | `SOFT` accepts short and overfull bars. A voice with zero tickables makes `Formatter` throw, so an empty bar draws its `Stave` only. |
| Format | `new Formatter().joinVoices([voice])`, `.preCalculateMinTotalWidth([voice])`, `.format([voice], width)`, then `voice.draw(ctx, stave)` | A short bar is justified across the full width unless padded; pad with `new GhostNote({ duration })` (invisible, takes time). |
| Beams | `new Beam(notes, false)` then `beam.setContext(ctx).draw()` after the voice | With `autoStem` false it keeps the stem directions we set. Stems of beamed notes are drawn inside the beam's group, not the note's. |
| Ties | `new StaveTie({ firstNote, lastNote, firstIndexes, lastIndexes })` | `lastNote: null` draws an open tie to the end of the stave; `firstNote: null` draws one from the start. Used across system breaks and for dangling ties. |
| Tuplets | `new Tuplet(notes, { numNotes: actual, notesOccupied: normal })` | Must be constructed BEFORE `voice.addTickables`, or the voice counts untupleted ticks. |
| Element ids | `note.setAttribute('id', id)` | The group is emitted as `<g class="vf-stavenote" id="vf-<id>">`. Sub-groups: `vf-notehead` (contains its accidental and dots), `vf-stem`, `vf-flag`. Other groups: `vf-stave`, `vf-stavebarline`, `vf-clef`, `vf-keysignature`, `vf-timesignature`, `vf-beam`, `vf-stavetie`, `vf-tuplet`. |
| Classes | DOM `classList` after drawing | `Element.addClass` does NOT reach the SVG in this version. |
| Style values | (avoid `setStyle` for theme colours) | `setStyle({ fillStyle })` writes a presentation attribute. `var(--x)` is not valid there. Colour with CSS classes instead. |
| Boxes | `note.getBoundingBox()` (`x`, `y`, `w`, `h`), `note.getNoteHeadBeginX()`, `note.getNoteHeadEndX()`, `note.getYs()`, `note.noteHeads[i].getAbsoluteX()`, `note.noteHeads[i].isDisplaced()`, `note.getStem()?.getSVGElement()` | Available after `format` and `draw`. The note box includes accidentals, dots, stem and flag. `getSVGElement` uses `document.getElementById`, so ids must be unique in the document. |

## 1. Rendering architecture

### 1.1 Layers

`<Stave>` is a client component (`'use client'`). Its DOM is:

```
div.mtn-stave                      root; position: relative; holds CSS variables
  p.sr-only        #<uid>-desc     text description of the passage (6.5)
  div.mtn-stave__scroll            overflow-x: auto only when a bar cannot fit
    div.mtn-stave__canvas          position: relative; exact pixel size of the notation
      div.mtn-stave__notation      VexFlow's host; aria-hidden="true"; React never renders children here
      svg.mtn-stave__overlay       ours; same viewBox; marks, cursor, selection, caret, ghost, lock dimming
      div.mtn-stave__surface       pointer and keyboard target (edit), or event buttons (read + tap)
  svg.mtn-stave__loupe             touch magnifier, only while dragging by touch
  div.mtn-stave__palette           role="toolbar"; edit mode only
  div.sr-only [aria-live=polite]   announcements
```

VexFlow output is never touched by React, and VexFlow is never asked to draw
decorations. Everything that changes often (marks, playback cursor, selection,
caret, ghost note) lives in the overlay or is a class toggled on an existing
VexFlow group. This split is what makes the performance budget in section 8
achievable.

### 1.2 Loading

`vexflow-loader.ts` exports `loadVexFlow(): Promise<VexFlowModule>`, a
module-level singleton that does `await import('vexflow/bravura')` and then
`await document.fonts.load('30pt Bravura')`. If the font promise has not
resolved after 3000 ms, resolve anyway and `console.warn` once.

Until it resolves the component renders the root with `min-height` equal to one
system (section 1.6) and `aria-busy="true"`. The description paragraph is
rendered immediately, so screen reader users are not blocked by the font.

Nothing in the module scope of any stave file touches `document` or imports
`vexflow` statically; the pure files (section 11) never import it at all.

### 1.3 Render pipeline

Three stages, each with its own trigger:

1. **Plan** (pure, `layout/plan.ts`): from `passage`, options and available
   width in units, decide systems and bar widths. Needs measured natural bar
   widths, obtained from stage 2's measuring pass.
2. **Draw** (`render/draw.ts`, the only file that calls VexFlow): build
   `Stave`, `StaveNote`, `Voice`, `Beam`, `StaveTie`, `Tuplet` objects, format,
   draw into the host, then extract a plain-data `LayoutModel` (section 2.1).
3. **Decorate** (`render/decorate.ts`): toggle classes on VexFlow groups and
   update overlay elements from `marks`, `cursor`, selection, caret, locks.

Stage 2 runs in a `useLayoutEffect` keyed on `drawKey`:

```
drawKey = hash(passage) | size | range | show flags | availableUnits
        | fontsReady | edit.editable (editable bars are wider, section 1.7)
```

`hash(passage)` is `JSON.stringify(passage)`, memoised on the object reference
(`WeakMap<Passage, string>`), so an unchanged reference costs nothing and a new
but equal object does not redraw.

Stage 2 does a full redraw: `ctx.clear()`, then every system. There is no
per-bar incremental redraw in Phase 0; passages are at most 8 bars.

Stage 3 runs in a second `useLayoutEffect` keyed on
`[layoutVersion, marks, cursor, selection, caret, lockedSet]`. It never calls
VexFlow.

Things that must NOT trigger stage 2: `marks`, `cursor`, selection, caret,
ghost movement, palette state, focus, `terminology`, `ariaLabel`, `sound`,
callbacks changing identity.

Width changes: one `ResizeObserver` on `div.mtn-stave`, handled in
`requestAnimationFrame`. `availableUnits = floor(contentBoxWidthPx / scale)`.
Stage 2 re-runs only when `availableUnits` changes.

### 1.4 Building a bar (draw stage)

For each bar, in order:

1. `Stave(x, y, width)`. On the first bar of every system add the clef and key
   signature; add the time signature only on the first bar of the passage.
   Each is omitted when the matching `show` flag is false. Key spec is the
   tonic of `pitch.keyFromSignature(pitch.keySignature(passage.key), 'major')`
   written as letter plus `#`/`b`. The last bar gets
   `setEndBarType(BarlineType.END)` unless `show.finalBarline` is false.
   Call `setDefaultLedgerLineStyle` as in section 0.
2. One `StaveNote` per event:
   - note: `keys` from each pitch as `` `${letter.toLowerCase()}/${octave}` ``
     (no accidental in the key string), in ascending order;
     `clef: passage.clef`; `stemDirection` from section 4.4; an `Accidental`
     modifier for each head whose sign is non-null (section 4.2);
   - rest: `keys` is the pitch at position 4 (middle line) from
     `pitch.pitchAtStavePosition(4, clef)`, except a semibreve rest, which uses
     position 6 so that it hangs from the fourth line; duration code plus `'r'`;
   - dots as in section 0;
   - `note.setAttribute('id', `${uid}-${bar}-${event}`)`, where `uid` is
     `useId()` with every character outside `[A-Za-z0-9_-]` removed.
3. Tuplets (display only): consecutive events with the same `tuplet` ratio are
   chunked into groups of `actual` events; each chunk gets a `Tuplet`.
4. Padding: if `rhythm.checkBarLength` says `short`, append `GhostNote`s for
   the durations from
   `rhythm.restsToFill(eventsLength, difference, time)`. If that throws, pad
   greedily from the largest note value that fits. Ghosts are layout only; they
   are not in the `LayoutModel` and not in the passage.
5. `Voice` in `SOFT` mode, `Formatter().joinVoices([voice]).format([voice], notesWidth)`,
   `voice.draw(ctx, stave)`. An empty bar skips steps 2 to 5.
6. Beams from section 4.3, drawn after the voice.
7. Ties, drawn after all bars of the system exist (section 4.5).

### 1.5 Theming

VexFlow output is coloured by CSS only. `stave.css` (plain CSS, imported by
`stave.tsx`, all selectors under `.mtn-stave`):

```css
.mtn-stave {
  /* Local variables. Defaults point at design tokens; a lesson sets
     --stave-accent to its strand colour (one of the --strand-* tokens). */
  --stave-ink: var(--text-primary);
  --stave-line: var(--text-primary);
  --stave-accent: var(--strand-current, var(--text-primary));
  --stave-correct: var(--success);
  --stave-wrong: var(--danger);
  color: var(--stave-ink);
}
.mtn-stave__notation svg { fill: currentColor; stroke: currentColor; }
.mtn-stave__notation svg * { pointer-events: none; }   /* beats VexFlow's pointer rects */
.mtn-stave__notation .vf-stave { stroke: var(--stave-line); }
.mtn-ev--correct   { color: var(--stave-correct); fill: currentColor; stroke: currentColor; }
.mtn-ev--wrong     { color: var(--stave-wrong);   fill: currentColor; stroke: currentColor; }
.mtn-ev--playing,
.mtn-ev--selected  { color: var(--stave-accent);  fill: currentColor; stroke: currentColor; }
.mtn-ev--locked    { opacity: 0.45; }
.mtn-ev--lifted    { opacity: 0.35; }                   /* note being dragged */
```

Rules:

- No colour literal appears in any stave file. P0-08 must check the token names
  against `src/styles/tokens.css` from P0-03 and adjust only the right-hand
  sides of the five local variables.
- Theme switching needs no redraw: only CSS variables change.
- A class on a `vf-stavenote` group colours its heads, accidentals, dots, flag
  and unbeamed stem (they inherit). For a beamed note, also add the class to
  `note.getStem()?.getSVGElement()`. Beams and ties are never recoloured.
- Glyph `<text>` elements carry `stroke="none"`; leave it.

### 1.6 Sizing

Sizes are fixed scales, not fluid, so that notation does not shrink to
illegibility and the touch geometry is predictable.

| `size` | Scale | Stave height | One position | Default for |
| --- | --- | --- | --- | --- |
| `sm` | 1.0 | 40 px | 5 px | Note Rush on small phones, inline exhibits |
| `md` | 1.25 | 50 px | 6.25 px | `mode: 'read'` |
| `lg` | 1.5 | 60 px | 7.5 px | `mode: 'edit'` |

The notation SVG gets `viewBox="0 0 W H"` in units and
`width = W * scale`, `height = H * scale` in CSS pixels. The overlay SVG uses
the same viewBox and size. All geometry in code is in units.

Vertical box of a system, in positions:

- edit mode: `reservedMin = range.min - 2`, `reservedMax = range.max + 2`. The
  box does not change while the learner edits.
- read mode: `reservedMin = min(-2, lowestHead - 1)`,
  `reservedMax = max(10, highestHead + 1)`, then enlarged to contain every
  event bounding box, tuplet and tie in the system.

```
PAD = 14 units (room for a mark badge)
topLineY     = PAD + (reservedMax - 8) * 5
bottomLineY  = topLineY + 40
systemHeight = bottomLineY + (0 - reservedMin) * 5 + PAD
Stave y arg  = systemTop + topLineY - 40
```

With the default range (section 2.5) an edit system is 148 units: 222 px at
`lg`. A beginner question that passes `range` C4 to A5 in treble gets 108
units: 162 px. Question authors should pass a `range` whenever they can.

Minimum target sizes:

- Palette buttons: 44 x 44 CSS px, 4 px gaps.
- Read + tap event buttons: full system height by the event's column width
  (section 2.3), never narrower than 24 CSS px.
- Editable events: column width never below 24 CSS px. This is enforced in
  layout, not hit-testing: `MIN_EVENT_PITCH = 24 / scale` units per event.

### 1.7 Bars per line and narrow screens

Natural width of a bar, in units:

```
modifiers  = stave.getNoteStartX() - stave.getX()   (measured, after adding clef etc.)
notes      = max(1.4 * formatter.preCalculateMinTotalWidth([voice]),
                 events * MIN_EVENT_PITCH,
                 editable ? 110 : 60)
appendZone = editable ? 30 : 0                      (always, so width is stable when the bar fills)
natural    = modifiers + notes + appendZone + 10
```

Breaking: first, in read mode, a passage of at most 4 bars that would only just
spill onto a second line is scaled down (never below 0.75 of the size's scale)
so that it stays on one line. Otherwise the fewest systems that greedy breaking
needs (at most 4 bars per system) are used, and the breaks are then moved so the
systems are as even as possible (minimise the widest system): no short orphan
system. Then justify: when there is more than one system, every system is
stretched to the full `availableUnits`; a single system is stretched only when
its natural width is at least 60% of `availableUnits`. The extra is shared
between bars in proportion to their `notes` width. A single-bar passage is never
stretched beyond 1.5 times its natural width. The clef and key signature repeat
on every system; the time signature appears only on the first.

Typical results at 360 px wide (328 px content): `lg` gives 218 units, which
is one or two simple bars per system; `md` gives 262 units, two bars.

When one bar alone is wider than `availableUnits` (an overfull bar on a phone):

1. The whole component drops its scale to `max(0.75 * scale, availableWidthPx / naturalPx)`.
2. If it still does not fit at 0.75, the bar keeps that scale and
   `div.mtn-stave__scroll` scrolls horizontally. After every edit and every
   cursor change the affected event is brought into view with
   `scrollIntoView({ inline: 'nearest', block: 'nearest', behavior })`, where
   `behavior` is `'auto'` under reduced motion and `'smooth'` otherwise.

Systems are stacked with a 6 unit gap. System breaks are recomputed on every
draw; in edit mode the 110 unit minimum makes a break change rare, but when it
happens it is allowed (no animation).

## 2. Coordinate model

### 2.1 LayoutModel

Stage 2 returns plain data. All hit-testing reads this and nothing else, so it
is unit-testable without VexFlow.

```ts
export interface Box { x: number; y: number; w: number; h: number }

export interface HeadLayout {
  pitchIndex: number;
  position: number;        // pitch.stavePosition(pitch, clef)
  x: number;               // centre of this head (displaced heads differ)
  y: number;               // centre
}
export interface EventLayout {
  bar: number;
  event: number;
  isRest: boolean;
  centreX: number;         // (getNoteHeadBeginX() + getNoteHeadEndX()) / 2
  box: Box;                // getBoundingBox(), includes accidentals, dots, stem
  heads: HeadLayout[];     // empty for rests
  colLeft: number;         // column edges, see 2.3
  colRight: number;
}
export interface BarLayout {
  bar: number;
  system: number;
  x: number;               // stave left
  width: number;
  noteStartX: number;
  noteEndX: number;
  events: EventLayout[];
  slotX: number[];         // length events.length + 1, see 2.3
}
export interface SystemLayout {
  index: number;
  top: number;             // of the system box
  height: number;
  bottomLineY: number;     // y of position 0
  bars: number[];
}
export interface LayoutModel {
  width: number;
  height: number;
  scale: number;
  clef: Clef;
  systems: SystemLayout[];
  bars: BarLayout[];
}
```

### 2.2 Client point to units

```ts
function clientToUnits(clientX, clientY, canvasRect: DOMRect, model: LayoutModel): { x: number; y: number }
// x = (clientX - canvasRect.left) * model.width  / canvasRect.width
// y = (clientY - canvasRect.top)  * model.height / canvasRect.height
```

`canvasRect` is `div.mtn-stave__canvas.getBoundingClientRect()`, read once at
`pointerdown` and reused for the whole gesture (re-read on `scroll` of the
scroll container). Rect arithmetic is used rather than `getScreenCTM` because
it is exact for our untransformed SVG and works in jsdom.

### 2.3 Horizontal: bar, event or slot

`locate(point, model, options): Target` in `layout/hit-test.ts`:

```ts
type Target =
  | { kind: 'event'; bar: number; event: number; pitchIndex: number | null; position: number }
  | { kind: 'slot';  bar: number; slot: number; position: number }
  | { kind: 'none' };
```

1. **System**: the system whose box contains `y`; if between systems, the
   nearer one; if above the first or below the last by more than 20 units,
   `none`.
2. **Bar**: the bar of that system with `x` in `[bar.x, bar.x + bar.width)`.
   Left of the first bar's `noteStartX` (over the clef) is `none`.
3. **Column or slot**. Each event has a core half-width
   `CORE = max(headWidth / 2 + 3, 12 / scale)` units around `centreX`, widened
   on the left to cover its accidentals (`box.x`).
   - If `x` is inside an event's core: `event`.
   - Otherwise `x` is in a gap. Gaps exist before the first event, between two
     events and after the last. A gap is a slot only if it is at least
     `MIN_SLOT = 8` units wide; a narrower gap is split at its midpoint between
     the two neighbouring events.
   - `slotX[i]` is the midpoint of gap `i`; `slotX[0] = noteStartX + 6` when
     the first gap is too narrow; `slotX[n]` is
     `min(lastEvent.colRight + 15, noteEndX - 10)`; for an empty bar
     `slotX[0] = noteStartX + 15`.
   - `colLeft`/`colRight` are the resulting boundaries; together the columns
     and slots tile `[noteStartX, bar right edge]` with no holes.
4. **Head within an event**: `pitchIndex` is the head whose `y` is nearest to
   the pointer if that distance is at most 7.5 units (1.5 positions);
   otherwise `null` (the pointer is in the column but not on a head).

In a dense bar there may be no slot between two events. Insertion there is
done with the caret (section 3.6); this is deliberate, a 3 px target would be
worse than none.

### 2.4 Vertical: stave position

```ts
function positionAtY(y: number, system: SystemLayout): number      // unsnapped, may be fractional
// (system.bottomLineY - y) / 5
function snapPosition(raw: number, previous: number | null, range): number
```

Snapping and hysteresis:

- First contact: `round(raw)`, clamped to `range`.
- While a gesture is in progress, keep `previous` unless
  `|raw - previous| > 0.65`; then take `round(raw)`. The 0.15 position dead
  band (about 1 px at `lg`) stops a ghost flickering between a line and a space
  when the finger rests on the boundary.
- Clamp, never reject: a pointer above the range gives `range.max`.

Position to pitch: `pitch.pitchAtStavePosition(position, clef)` gives the
letter and octave as a natural. The accidental is then decided by the reading
rule in section 4.2, never by the pointer.

Pitch to position, for existing notes: `pitch.stavePosition(p, clef)`.

Horizontal hysteresis:

- For a touch or mouse press, the target (event or slot) is fixed at
  `pointerdown` and does not change during the drag. Only the position moves.
- For mouse hover (no button), the target follows the pointer, but a change of
  target is accepted only once the pointer is 4 units past the boundary.

### 2.5 Ledger-line limits

The default editable range is positions `-6..14` in every clef: three ledger
lines below and three above.

| Clef | Position 0 | Position -6 | Position 14 |
| --- | --- | --- | --- |
| treble | E4 | F3 | E6 |
| bass | G2 | A1 | G4 |
| alto | F3 | G2 | F5 |
| tenor | D3 | E2 | D5 |

`range?: { low: Pitch; high: Pitch }` narrows it (never widens it); it is
converted with `stavePosition` and intersected with `-6..14`. Display has no
limit: a read-only passage with notes outside the range is drawn in full and
the system box grows (section 1.6). An existing note outside the editable
range can be selected, deleted and moved; its first move clamps it into range.

## 3. Input model (edit mode)

### 3.1 State

UI state held by the component (not in the passage):

```ts
interface EditUiState {
  caret: { bar: number; slot: number };                       // always defined in edit mode
  selection: { bar: number; event: number; pitchIndex: number } | null;   // pitchIndex 0 for rests
  armed: {
    value: NoteValue;            // sticky
    rest: boolean;               // sticky toggle
    dots: 0 | 1 | 2;             // one-shot: cleared after one insertion
    sign: Accidental | null;     // one-shot
    chord: boolean;              // sticky toggle: taps on an event add a head
  };
  gesture: null | PlacingGesture | MovingGesture;             // 3.4
}
```

The caret is drawn as a 1.5 unit dashed vertical line in `--stave-accent`
spanning the stave at `slotX[slot]`. When an event is selected the caret sits
in the slot after it. Initial caret: slot `n` (end) of the first editable bar.
Initial armed value: `palette.durations[0].value`.

### 3.2 Palette

Rendered by the stave, below the notation, as `role="toolbar"` with
`aria-label` "Note tools". Only controls enabled by `palette` and the edit
kind are rendered. Order, left to right, wrapping to further rows:

| Group | Controls | Behaviour |
| --- | --- | --- |
| Durations | one toggle button per `palette.durations` entry, showing the note glyph | Radio group. Arms the value. If an event is selected, also sets that event's value. |
| Rest | one toggle | Sticky. While on, duration buttons show rest glyphs and insertions create rests. If an event is selected, converts it (note to rest, or rest to note at the reference position, 3.6). |
| Dot | one button | With a selection: cycles that event's dots `0 -> 1 -> ... -> palette.dots -> 0`. Without: arms a dot for the next insertion only. |
| Accidentals | flat, natural, sharp; plus double flat, double sharp when `palette.accidentals === 'double'` | With a note selected: sets the selected head's sign; pressing the sign it already has removes the sign. Without: arms it for the next insertion only. |
| Tie | one toggle | Needs a selected note. Toggles `tieToNext` on it. |
| Chord | one toggle | Sticky. Shown only when `palette.chords`. |
| Step | previous, next, up, down, add | Previous/next move the selection (same as arrow keys). Up/down move the selected head one position. Add inserts at the caret (same as Enter). Always shown in kind `free` (single-note mode keeps only up and down); this is the precise path on a phone and the whole path for switch and screen reader users. |
| History | undo, redo, delete | Delete removes the selected event or, in a chord, the selected head. |

Every button has an `aria-label` built from engine names in the current
terminology (`rhythm.noteValueName`, `rhythm.restName`), `aria-pressed` for
toggles, and `disabled` when it cannot act. Buttons do not take focus away
from the stave on pointer use (`onPointerDown` prevents default), so keyboard
editing continues after a click. The toolbar uses roving tabindex: one Tab
stop, arrow keys between buttons.

On a 360 px screen, 7 buttons fit per row. A full palette is three rows;
single-note mode is one row.

### 3.3 Actions and gestures

"Tap" is press and release within the slop distance (10 CSS px touch, 6 CSS px
mouse) and any duration. There is no long-press and no double-tap gesture.

| Action | Touch | Mouse | Keyboard (stave focused) |
| --- | --- | --- | --- |
| Place a note | Tap a slot at the wanted height. Or press, drag to adjust height with the loupe (3.4), release. | Hover shows a ghost; click. Or press, drag, release. | Letter `A`-`G` (3.6), or Enter to add at the reference position. |
| Place a rest | Rest toggle on, tap a slot (height ignored). | Same with click. | `R`. |
| Select | Tap an event. Tapping a head selects that head; tapping a column off any head selects the nearest head. | Click, same. | Left/Right. |
| Clear selection | Tap outside every bar, or tap the selected event again. | Same. | Escape. |
| Move pitch | Press a head and drag vertically; release. Or select, then Up/Down buttons. | Press and drag; or select and use buttons. | Up/Down one position; Shift+Up/Down seven positions (an octave). |
| Change duration | Select, tap a duration button. | Same. | Digit (3.6). |
| Dot | Select, tap dot. | Same. | `.` |
| Accidental | Select, tap a sign. | Same. | `+`/`=`, `-`, `N` (3.6). |
| Tie | Select, tap tie. | Same. | `T`. |
| Note to rest and back | Select, tap rest. | Same. | (palette only) |
| Add a second note to make a chord | Chord toggle on, tap the event's column at a free height. Or drag as when placing. | Same with click. | Shift+letter. |
| Remove one note of a chord | Select that head, tap delete. | Same. | Select it (Alt+Up/Down changes head), Backspace. |
| Delete | Select, tap delete. | Same, or select and press Delete. | Backspace or Delete. |
| Undo / redo | Palette buttons. | Palette buttons. | Ctrl/Cmd+Z; Ctrl/Cmd+Shift+Z or Ctrl+Y. |
| Hear the selected note | (selecting sounds it) | (selecting sounds it) | Space. |

What a tap on the stave does, decided in this order:

1. Target `none`, or a locked bar or locked event: clear selection. No edit.
2. Target `slot`: insert the armed duration (note at the tap position, or rest)
   at that slot. The new event becomes the selection.
3. Target `event`, chord toggle on, the event is a note, and the tap position
   has no head: add a head there. It becomes the selection.
4. Target `event` otherwise: select it (or deselect if it was the selection
   and the same head).

Tapping a column never changes an existing head's pitch. Pitch changes only by
dragging a head, the step buttons or the arrow keys. This prevents the most
likely accident on a phone: meaning to select a note and moving it instead.

Edit kind `single-note` replaces rules 2 to 4 with one rule: a tap anywhere in
the editable bar sets the bar's single note to the tap position (section 5.1).

### 3.4 Dragging, and keeping the note visible under a finger

Two gestures, both driven by Pointer Events on `div.mtn-stave__surface`:

**Placing** starts at `pointerdown` on a slot (or on a column, in chord mode).
A ghost notehead is drawn in the overlay at the snapped position: armed note
value's head shape, `--stave-accent`, 60% opacity, with ledger lines as needed
and the armed sign. A horizontal guide (the line, or the space as a 5 unit
band, at 20% opacity across the bar) shows the snapped height. `pointermove`
updates the position only. `pointerup` commits one insertion.

**Moving** starts when a press on a head travels beyond the slop distance.
The real note gets `mtn-ev--lifted`; a ghost follows the snapped position.
`pointerup` commits one `move-pitch` if the position changed; if it did not,
nothing is emitted.

Neither gesture redraws VexFlow or calls `onChange` until `pointerup`.

Finger occlusion, for `pointerType === 'touch'` (and `'pen'` is treated as
mouse):

- A quick tap needs nothing: the note appears when the finger lifts, already
  selected, and the Up/Down buttons correct it by one position per press.
- During a touch drag a **loupe** is shown: a 96 x 96 CSS px circle, centred
  horizontally on the ghost and 72 px above the finger (below the finger when
  there is less than 110 px above it in the viewport). It contains a 2x view of
  the stave around the ghost, built with SVG `<use>`:

  ```
  <svg class="mtn-stave__loupe" viewBox="{gx - 16} {gy - 16} 32 32" aria-hidden="true">
    <use href="#{uid}-notation-svg" />   <!-- id set on ctx.svg after draw -->
    <use href="#{uid}-overlay" />
  </svg>
  ```

  The loupe never shows a note name, because many questions ask for exactly
  that.
- The ghost itself is not offset from the finger. An offset note is harder to
  aim than a hidden one with a loupe.

Surface CSS: `touch-action: none` on the regions of the surface that cover
editable bars; `touch-action: manipulation` everywhere else in the component;
`user-select: none`, `-webkit-user-select: none`,
`-webkit-touch-callout: none`, `-webkit-tap-highlight-color: transparent` on
the root. `contextmenu` is prevented on the surface. Consequence: a vertical
swipe that starts on an editable bar edits, and one that starts anywhere else
scrolls the page. Locked bars, the clef area, the palette and the page margins
all remain scroll handles.

`setPointerCapture(pointerId)` at `pointerdown`. A second pointer during a
gesture is ignored. `pointercancel`, `lostpointercapture` without `pointerup`,
Escape, and the window losing focus all abandon the gesture with no edit.

### 3.5 Undo and redo

The parent owns the passage; the stave owns history. `use-edit-history.ts`
keeps `past: Passage[]` (max 50) and `future: Passage[]`.

- Every accepted edit pushes the passage it replaced onto `past`, clears
  `future`, and calls `onChange(next)`.
- Undo calls `onChange(past.pop())` and pushes the current passage onto
  `future`. Redo is the mirror.
- The hook remembers the last passage it emitted. If the `passage` prop
  arrives as anything else (by reference, then by hash), the parent has reset
  it: history is cleared, selection cleared, caret reset.
- One gesture is one history entry. Selection and palette changes are not in
  history. After undo or redo the selection is cleared and the caret moves to
  the end of the first bar that differs.

### 3.6 Keyboard bindings

Active while `div.mtn-stave__surface` has focus, edit mode only. Keys not
listed are not handled and not prevented. Bindings for controls the palette
does not enable do nothing and announce "Not available here".

| Key | Effect |
| --- | --- |
| Left / Right | Move through stops. The stops of a bar are its unlocked events in order, then its end slot. Right from an end slot goes to the first stop of the next editable bar; Left is the reverse. On an event stop the event is selected (top head) and the caret is the slot after it. On an end stop nothing is selected. |
| Home / End | Caret to slot 0 / the end slot of the current bar, selection cleared. Slot 0 is reachable only this way. |
| Ctrl/Cmd + Left / Right | First stop of the previous / next editable bar. |
| Up / Down | Selected head up / down one position. In a chord a position already used by another head is skipped. No selection: nothing. |
| Shift + Up / Down | Selected head up / down seven positions. |
| Alt + Up / Down | In a chord, select the next head up / down. |
| `A`-`G` | Insert a note of the armed duration at the caret. Its position is the one with that letter nearest to the reference position; a tie between two candidates goes to the higher. Clamped into range by octave. |
| Shift + `A`-`G` | Add that letter to the selected note as a chord head: the nearest position with that letter above the top head; if out of range, the nearest below the bottom head. |
| `R` | Insert a rest of the armed duration at the caret. |
| Enter | Insert at the caret: a rest if rest is armed, else a note at the reference position. Same as the Add button. |
| `2` `3` `4` `5` `6` `7` `8` | Arm demisemiquaver, semiquaver, quaver, crotchet, minim, semibreve, breve; also applied to the selected event. |
| `.` | Dot (same as the dot button). |
| `+` or `=` | Selected head's sign cycles none, sharp, (double sharp), none. From any flat sign it goes to sharp. No selection: arms. |
| `-` | Cycles none, flat, (double flat), none. From any sharp sign it goes to flat. |
| `N` | Toggles a natural sign. |
| `T` | Tie toggle. |
| Backspace / Delete | Delete the selected event, or the selected head when the chord has more than one. With no selection, Backspace deletes the event before the caret. |
| Space | Sound the selected event. |
| Escape | Abandon a gesture; otherwise clear the selection. |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y | Undo, redo, redo. |

**Reference position**: the position of the top head of the nearest note
before the caret in the passage (any bar, locked or not); if there is none, 4
(the middle line).

After any insertion the new event is selected and the caret is the slot after
it, so repeated letters write left to right.

## 4. Editing rules

### 4.1 Bar length: wrong bars are allowed

The stave never judges bar length and never repairs it.

- **Short bar**: drawn exactly as written. Ghost padding (section 1.4) keeps
  the written events at their proportional places and leaves the unfilled time
  visibly blank at the right-hand end. No rest appears, nothing is tinted.
- **Overfull bar**: drawn exactly as written. All events sit inside the
  barlines; the bar's natural width grows, so the system may re-break
  (section 1.7). Nothing is tinted, nothing is moved to the next bar.
- **Capacity**: an edit is rejected (`bar-full`) only when the bar would
  exceed twice its nominal length or 32 events. That allows every real
  mistake while keeping layout bounded.
- **Showing that a bar is wrong** is the parent's decision, through `marks`
  with a bar key (section 5.4): a dashed bracket above the bar with a cross
  badge. During an unanswered question no mark is passed, so the learner gets
  no hint.

Rests are never auto-filled and deleting an event closes the gap rather than
leaving a rest. Reasons: writing the correct rests, correctly grouped, is the
examined skill in "complete the bar"; an auto-filled rest would both answer the
question and change the learner's work behind their back; and marking
(`rhythm.checkBarLength`, `rhythm.groupingProblems`) needs exactly what the
learner wrote.

### 4.2 Accidentals

Two pure functions in `edit/accidentals.ts` define everything. Both walk a bar
left to right keeping `inForce: Map<letter + octave, Accidental>`, where a
missing entry means the key signature's accidental for that letter
(`pitch.signatureAccidentals(pitch.keySignature(key))`). An accidental applies
to its own line or space in its own octave until the barline.

**Display rule**: `signsForBar(bar, key, tieIn): (Accidental | null)[][]`,
used by the draw stage for every bar, edited or authored. For each head:

1. If it is the continuation of a tie (the previous event, or the last event
   of the previous bar passed as `tieIn`, is a note with `tieToNext` and
   contains the identical pitch): sign `null`. A tie from the previous bar does
   not update `inForce`.
2. Else if the event has `showAccidental === true`: sign is the pitch's
   accidental (0 draws a natural); update `inForce`.
3. Else if `showAccidental === false`: sign `null`; `inForce` unchanged.
4. Else (`undefined`): sign is the pitch's accidental if it differs from
   `inForce`, otherwise `null`; when a sign is drawn, update `inForce`.

**Reading rule**: `readHead(position, sign, clef, inForce): Pitch`, used by the
reducer. Letter and octave from `pitch.pitchAtStavePosition`. Accidental is
`sign` if non-null (and `inForce` is updated), otherwise the tie source's
accidental for a tie continuation, otherwise `inForce`.

So a learner who puts a plain notehead on the top line in D major has written
F sharp, and the passage stores F sharp. What is on the page is what the pitch
means.

**How the reducer uses them.** Every action that touches bar `b`:

1. Converts bar `b` to written form with the display rule:
   `WrittenEvent = { kind, duration, tieToNext, heads: { position, sign }[] }`.
2. Applies the action to the written form.
3. Converts back with the reading rule, setting `showAccidental`:
   - single-note event: `true` if its sign is non-null, else `false`;
   - chord: omitted (see the limitation below).

The effect is that single notes keep their **appearance** and their pitch
follows. If the learner adds a sharp to an earlier F in the bar, a later plain
F in that octave becomes F sharp in the passage without any new sign
appearing, exactly as on paper. A learner who forgets to cancel an accidental
has therefore made a real, markable mistake, and one who writes a redundant
sharp on F in D major gets a drawn sharp (`showAccidental: true`) that a
question can mark as unnecessary.

Further rules:

- A sign from the palette sets both the head's sign and, through the reading
  rule, its pitch. Removing the sign returns the head to `inForce`.
- Moving a head (drag, step, arrow) clears its sign. The moved note reads as
  the plain note at its new position.
- A newly inserted note takes the armed sign, or none.
- Only bar `b` is rewritten. Other bars keep their exact authored events,
  including `showAccidental: undefined`.
- Chord limitation with the current contract: `showAccidental` is one flag per
  event, which cannot say "sign on the third but not the root". Chords are
  therefore stored with the flag omitted: their **pitches** are kept and signs
  follow rule 4. A redundant sign on a chord head cannot be stored and is not
  drawn (the palette action is accepted, changes the pitch if it changes
  anything, and the sign shows only if needed). The proposed contract change
  in section 13 removes this limitation; `fromWritten` is the only function
  that changes.
- Two heads on the same position in one chord (F and F sharp) are not
  supported: `position-occupied`.

### 4.3 Beaming

Automatic, never editable. For each bar:
`rhythm.beamGroups(bar, passage.time)` returns index groups. For each group
keep the indexes that are notes with value quaver or shorter; if at least two
remain, `new Beam(thoseStaveNotes, false)`. Wrap the engine call in
`try/catch`; on a `TheoryError` (for example an irregular metre the engine
does not group) draw flags and no beams. The call is made on wrong-length bars
too, with whatever the engine returns. Rests inside a group are skipped, not
beamed over with stemlets.

### 4.4 Stem direction

Set explicitly on every `StaveNote`; VexFlow's `autoStem` is not used, so that
our rule is the one being taught.

- Single note: position below 4, up; position 4 or above, down.
- Chord: compare the distance of the top head above the middle line
  (`max - 4`) with the distance of the bottom head below it (`4 - min`).
  Larger above, down; larger below, up; equal, down.
- Beamed group: the head furthest from the middle line in the whole group
  decides, by the single-note rule; equal distances, down. Every note in the
  group takes that direction.
- Semibreves and breves have no stem; pass `Stem.UP`.

Implemented as pure `stemDirections(bar, beamGroups, clef): (1 | -1)[]` in
`notation/stems.ts`.

### 4.5 Ties

- A tie is `tieToNext` on a note event. Its target is the next event in the
  bar, or the first event of the next bar.
- Drawn with `StaveTie` between each pair of identical pitches in source and
  target (`firstIndexes`/`lastIndexes`). Across a system break, draw two open
  ties (`lastNote: null` on the first system, `firstNote: null` on the second).
- A tie with no target yet (the learner tied the last note written) is kept in
  the passage and drawn as an open tie. This lets a learner write the tie
  first.
- Pruning: after every action the reducer clears `tieToNext` on events of the
  edited bar whose target exists and is a rest or shares no identical pitch.
  Events in other bars are never changed; if a locked source points at a target
  that no longer matches, it is drawn as an open tie.
- Changing the duration of either end keeps the tie.

## 5. Constrained modes

Selected by props (section 13). All are the same component and reducer.

### 5.1 Pitch only (`edit.kind: 'single-note'`)

For "place this note". `palette.durations` has one entry, which is the note
value used. Exactly one bar is editable and it holds zero or one learner event
(after any locked prefix).

- A tap, click or drag release anywhere in the editable bar, at any `x`, sets
  the note to that position: `set-single-note`. If no note exists it is
  created; if one exists it moves. There are no slots and no caret.
- The note is always the selection once it exists.
- Palette: Up, Down, accidentals (if enabled), undo, redo. No durations, rest,
  dot, tie, chord, add or delete.
- Keyboard: Up/Down, Shift+Up/Down, `A`-`G` (sets the note), sign keys, undo.
  With no note yet, Up or Down creates it at position 4.
- Typical props: `show.timeSignature: false`, `show.finalBarline: false`,
  `pitchSpeech: 'positions'` when the question is "which line is G".

### 5.2 Fill the gap (`edit.editable`)

For "complete the bar". `edit.editable` lists the bars that may change, each
with optional `lockedPrefix` and `lockedSuffix` counts: the first and last so
many events of that bar are given and fixed. Everything else is locked.

- Locked events get `mtn-ev--locked` (45% opacity). Locked bars also get a
  hatched overlay rectangle at 6% opacity behind the notes, so the editable
  region is distinguished by pattern as well as by contrast. Editable bars have
  a 1 unit accent underline beneath the stave.
- Slots before the locked prefix and after the locked suffix do not exist.
  Locked events are not keyboard stops, cannot be selected, dragged or deleted.
  Every reducer action re-checks this and returns `locked`.
- Because locking is by count from each end, learner insertions never shift
  what is locked.
- The description (6.5) says which bars are editable.

### 5.3 Read + tap (`mode: 'read'` with `onEventTap`)

For "spot the mistake" and tap-to-hear exhibits.

- `div.mtn-stave__surface` contains one transparent `<button>` per event,
  absolutely positioned: full system height, from `colLeft` to `colRight`.
  `aria-label` is the event's description (6.4).
- Activating a button calls `onEventTap(bar, event)`. The stave makes no sound
  and shows no selection of its own; the parent answers with `marks`.
- Roving tabindex: one Tab stop for the stave; Left/Right/Home/End move
  between event buttons across bars; Enter/Space activate (native button).
- Hover and focus-visible draw a rounded outline around the event's box in
  the overlay.
- `touch-action: manipulation`. Page scrolling works from anywhere.

### 5.4 Display only, with marks

`mode: 'read'`, no `onEventTap`. Root is `role="img"` with `aria-label` and
`aria-describedby` the description. Nothing is focusable.

`marks` keys are `"bar:event"` or `"bar"`. Each state has a colour, a class
and a shape; the shape alone is sufficient.

| State | Event rendering | Bar rendering (`"bar"` key) |
| --- | --- | --- |
| `correct` | `mtn-ev--correct`; badge: filled circle, 12 units, with a tick | Solid bracket above the bar, circle-tick badge at its centre |
| `wrong` | `mtn-ev--wrong`; badge: filled rounded square, 12 units, with a cross | Dashed bracket above the bar, square-cross badge |
| `highlight` | Rounded rectangle outline, 2 units, `--stave-accent`, around the event box; note colour unchanged; no badge | Same outline around the whole bar |

Badge position: centred on `centreX`, 4 units above the event box; if that
would leave the system box, 4 units below the box instead. Badge glyphs are
drawn in the page background colour on the state colour. Marks are also
appended to the description ("marked wrong").

The playback `cursor` adds `mtn-ev--playing` to the event and a 20% opacity
accent rectangle over its column, full stave height. It jumps; it does not
slide.

Marks and cursor work identically in edit mode (feedback after "Check").

## 6. Keyboard operation and accessibility

### 6.1 Focus model

| Mode | Tab stops | Role of the stop |
| --- | --- | --- |
| read, no tap | none | root is `role="img"` |
| read + tap | 1 (roving over event buttons) | `button` inside `role="group"` |
| edit | 2: the surface, then the palette | surface: `role="application"`, `aria-roledescription="music stave editor"`, `aria-label={ariaLabel}`, `aria-describedby` description and key help; palette: `role="toolbar"` |

`role="application"` is used so that screen readers pass arrow and letter keys
through. Tab is never trapped. A visible focus ring (2 px `--stave-accent`
outline, 2 px offset) surrounds the canvas on `:focus-visible`.

A second sr-only paragraph, `#<uid>-keys`, lists the bindings in one sentence
group ("Arrow keys move between notes. Letters A to G add a note..."). It
mentions only bindings available in the current palette and kind.

### 6.2 Screen reader users without a keyboard

VoiceOver and TalkBack users on phones cannot send arrow keys and cannot use
the drag gesture. The Step group of the palette (previous, next, up, down,
add) plus the other palette buttons perform every edit as plain labelled
buttons, each followed by an announcement. This path is required to be
complete: there is no edit that only a gesture or only a key can do.

### 6.3 Announcements

One `aria-live="polite"`, `aria-atomic="true"` region. Text comes from pure
functions in `a11y/describe.ts`; all fixed words are in `a11y/strings.ts`.

Naming:

- Note values: `rhythm.noteValueName(duration, terminology)`; rests:
  `rhythm.restName(duration, terminology)`.
- "bar" (uk) or "measure" (us), from `strings.ts` keyed by terminology.
- Pitches when `pitchSpeech` is `'names'`: letter, then "double flat", "flat",
  nothing, "sharp" or "double sharp", then the octave: "F sharp 4". This is
  built locally because `pitch.displayPitchClass` returns glyphs, which screen
  readers pronounce unreliably.
- Pitches when `pitchSpeech` is `'positions'`: "line 1" to "line 5" (bottom to
  top), "space 1" to "space 4", "space below the stave", "space above the
  stave", "ledger line 1 below", "space below ledger line 1 below", and so on
  outward; a drawn sign is added ("with a sharp"). Used when naming the pitch
  would give the answer away. US terminology says "staff".

| Event | Announcement (names mode, uk) |
| --- | --- |
| Note placed | "F sharp 4, crotchet. Bar 2, note 3 of 3." |
| Rest placed | "Crotchet rest. Bar 2, note 3 of 3." |
| Pitch moved | "G4." (short on purpose: it repeats on every arrow press) |
| Sign changed | "F sharp 4, sharp sign added." / "F4, sign removed." |
| Duration or dots changed | "Dotted minim." |
| Chord head added | "A4 added. Chord: D4, F sharp 4, A4." |
| Tie toggled | "Tied to next note." / "Tie removed." |
| Deleted | "Deleted. Bar 2 has 2 notes." |
| Selection moved | "Bar 2, note 1 of 3: F sharp 4, crotchet, tied." / "Bar 2, end." |
| Undo / redo | "Undone." / "Redone." |
| Rejected | "That note is fixed." / "This bar is full." / "Too high for this stave." / "Too low for this stave." / "Not available here." / "That note is already in the chord." |
| Playback cursor | not announced (the audio is the output) |

A pitch change caused indirectly by the reading rule (a later note changing
because an earlier sign was added) is not announced separately; it is in the
description.

### 6.4 Event descriptions

`describeEvent(passage, bar, event, opts)` gives, for read + tap button labels
and selection announcements: "Bar 2, note 1 of 3: F sharp 4, crotchet", with
", tied" and ", marked wrong" / ", marked correct" / ", highlighted" when they
apply. Chords: "chord D4, F sharp 4, A4, minim". Tuplet members add
", in a triplet" (or "in a tuplet of 5").

### 6.5 Passage description

`describePassage(passage, opts)` fills `#<uid>-desc`, recomputed on every
passage or marks change (cheap, pure):

"Treble clef. Key signature: 2 sharps. Time signature: 3 4. Bar 1: F sharp 4
crotchet; G4 quaver; A4 quaver, tied; crotchet rest. Bar 2: empty. Bars 2 to 2
can be edited."

- The key is given as a count of sharps or flats, never as a key name, so that
  "name this key" is not answered.
- Hidden items (`show` flags) are omitted.
- In `'positions'` mode pitches are given as positions.
- Bar-length status is not stated.

### 6.6 Reduced motion

The stave has three animations, all under 150 ms: a 3 px horizontal shake of
the ghost on a rejected edit, a fade-in of mark badges, and smooth
`scrollIntoView`. All are disabled when the `reducedMotion` prop is true or
`@media (prefers-reduced-motion: reduce)` matches. The playback cursor and
selection never animate.

## 7. Audio feedback

**Decision: the stave imports `getAudioEngine` from `src/audio` directly**, in
one file, `stave-sound.ts`. The dependency rules allow it ("components may
import engine, audio"), the keyboard component's contract sets the precedent
(`sound?: boolean`, "the component makes no sound itself" when false), and the
alternative (an `onNote` callback) would make every question type and game
re-implement the same unlock, timing and note-off logic. Global mute stays
where it belongs: the app calls `AudioEngine.setMuted`; the stave does not
read settings.

Prop `sound?: boolean`. Default `true` in edit mode, ignored in read mode
(read mode never sounds; playback is the parent's `playPassage`).

When the stave sounds, with `sound` true:

| Moment | What sounds |
| --- | --- |
| A note is placed | That pitch (as read, including key signature) |
| A head is moved, on commit | The new pitch |
| During a drag, each time the snapped position changes | The ghost's pitch, at most once per 80 ms |
| A sign is changed | The new pitch |
| A chord head is added | The whole chord |
| An event is selected, or Space | Every pitch of the event |
| Rests, deletes, durations, ties, undo | Nothing |

Mechanics: `noteOn(pitch)`, then `noteOff(pitch)` after 350 ms by timer;
a new sound first sends `noteOff` for anything still sounding; timers are
cleared on unmount. If `!engine.isUnlocked()`, call `engine.unlock()` from the
`pointerup` or `keydown` handler (both count as user gestures) and play when
it resolves; never call it from `pointermove`. The stave never calls
`playUi`: right and wrong sounds belong to the question.

Tests mock `@/audio` with `vi.mock`.

## 8. Performance budget

Target device: a mid-range Android phone (test with 4x CPU throttling in
Chrome DevTools).

| Operation | Budget | How |
| --- | --- | --- |
| Full draw, 4 bars | 12 ms | One clear and redraw; no measurement pass repeated when only width changes within the same break plan |
| Full draw, 1 bar | 5 ms | |
| `marks`, `cursor`, selection, caret change | 1 ms, zero VexFlow calls | Decorate stage only: class toggles on cached group elements, attribute updates on pooled overlay nodes |
| Ghost move during a drag | 0.3 ms, zero React renders | The gesture writes `transform`/`cy` on the ghost node through a ref; React state changes only on `pointerdown` and `pointerup` |
| Note Rush scrolling | zero React renders and zero layout per frame | See below |

Memoisation:

- `Stave` is `React.memo` with a comparator: `passage` by reference then hash;
  `marks` by shallow key and value equality; `cursor` by fields; `palette`,
  `edit`, `show`, `range` by shallow or small deep equality (so inline object
  literals from parents do not defeat it); callbacks ignored (kept in refs).
- Element lookups (`vf-<uid>-<bar>-<event>` groups, stems) are resolved once
  per draw into a `Map` and reused by the decorate stage.
- `LayoutModel`, `describePassage`, written forms and stem directions are
  `useMemo`'d on the passage hash.
- Overlay nodes for marks are pooled and reused, not re-created.

**Note Rush pattern.** The stave component must not be given a new `passage`
per frame. The folder exports a second, display-only component and a metrics
helper:

```ts
export function NoteSprite(props: {
  pitch: Pitch; clef: Clef; size: StaveSize; range?: { low: Pitch; high: Pitch };
  showAccidental?: boolean; state?: 'correct' | 'wrong';
}): JSX.Element;
export function staveMetrics(size: StaveSize, range?: { low: Pitch; high: Pitch }, clef?: Clef):
  { scale: number; heightPx: number; yForPositionPx(position: number): number };
```

- The game renders one static `<Stave mode="read">` with an empty bar (clef
  and lines, `show.timeSignature: false`), drawn once.
- Each flying note is a `NoteSprite`: a small SVG with one semibreve-style
  notehead (no stem), its ledger lines and optional sign, with the same height
  and vertical metrics as the stave so that `top: 0` aligns it. Its markup is
  produced once per `(pitch, clef, size, range)` and cached in a module-level
  `Map`. It is plain SVG with no VexFlow layout: the head is a `<text>`
  element holding the Bravura glyph U+E0A2 (`Glyphs.noteheadWhole`) at
  `font-size: 30pt`, the ledger lines are `<line>`s, and a sign is a second
  glyph `<text>`.
- The game moves sprites by writing `style.transform = translate3d(x, 0, 0)`
  from its own `requestAnimationFrame` loop. `NoteSprite` is `React.memo` and
  sets `will-change: transform`.
- What must not happen per frame: a `Stave` prop change, a VexFlow call, a
  `getBoundingClientRect`, or any style that triggers layout (`left`, `width`).

## 9. Edge cases

| # | Case | Required behaviour |
| --- | --- | --- |
| 1 | Second in a chord (adjacent positions) | VexFlow displaces one head. `HeadLayout.x` uses each head's own `getAbsoluteX()`; hit-testing picks by `y` first, so both heads are selectable. |
| 2 | Accidentals colliding in a chord | Left to VexFlow's column layout. The event box and core widen to the left to include them; the bar's natural width grows. |
| 3 | Two heads on one position (F and F sharp) | Rejected, `position-occupied`. |
| 4 | Tie across a barline | Drawn between the bars; the continuation shows no sign and does not set the accidental for the rest of the new bar (4.2 rule 1). |
| 5 | Tie across a system break | Two open ties. |
| 6 | Tie whose target is deleted or changed to a different pitch | Pruned on the edited bar's sources; a locked source is drawn as an open tie. |
| 7 | Tie on the last note, nothing after it | Kept; drawn open. |
| 8 | Tuplets | Displayed with a bracket and number. Tuplet events are locked: cannot be created, moved in pitch, re-valued or deleted in Phase 0 (`not-allowed`). A bar containing one is still editable around it. |
| 9 | Note beyond the editable range in the passage | Drawn in full; system box grows. Selectable; first move clamps into range. |
| 10 | Pointer dragged above or below the range | Position clamps; ghost stays at the limit; "Too high/low" is announced once per gesture. |
| 11 | Clef, key or time changed by the parent mid-edit | Treated as a new passage: history, selection and gesture cleared, caret reset. The stave has no clef-change action. |
| 12 | Overfull bar on a phone | Scale drops to 0.75 at most, then horizontal scroll with the edited event kept in view (1.7). |
| 13 | Bar at capacity (twice nominal length or 32 events) | Insertion and lengthening rejected, `bar-full`. |
| 14 | Double-tap | Two taps. No zoom: `touch-action` is `none` or `manipulation` everywhere in the component. No `dblclick` handler. |
| 15 | `pointercancel` (system gesture, incoming call, palm) | Gesture abandoned, ghost and loupe removed, no edit, no history entry. |
| 16 | Second finger during a drag | Ignored; the first pointer keeps the gesture. Pinch zoom does not start on editable bars. |
| 17 | Long press | Nothing. Context menu and iOS callout suppressed. |
| 18 | Page scroll while pressing | Cannot start from an editable bar. If the container scrolls for another reason, the cached rect is refreshed on `scroll`. |
| 19 | Resize or rotation during a drag | Gesture abandoned, then redraw. |
| 20 | Empty bar | Stave drawn with no voice. One slot at `noteStartX + 15`. Described as "empty". |
| 21 | Empty passage (`bars: []`) | One system with clef and signatures, no barline after them, nothing editable. |
| 22 | `passage` prop changes during a gesture | Gesture abandoned; new passage drawn. |
| 23 | Parent ignores `onChange` (does not update `passage`) | The stave shows the old passage; it holds no shadow copy. History entry is dropped at the next prop check. |
| 24 | `marks` key for an event that no longer exists | Ignored silently. |
| 25 | `cursor` on a rest or out of range | Rest: column highlight only. Out of range: ignored. |
| 26 | Selected event deleted by undo | Selection cleared (always, after undo/redo). |
| 27 | Dense bar with no slot between two events | Pointer cannot insert there; keyboard and Add button can (caret after the selected event). |
| 28 | Breve in a short metre (breve in 3/4) | Allowed if within capacity; drawn; it is the learner's mistake to make. |
| 29 | Semibreve rest for a whole bar in any metre | Drawn at its normal place among the events (left), not centred. Centring whole-bar rests is out of scope. |
| 30 | Font fails to load | After 3 s draw anyway, warn once; redraw when `document.fonts` later reports it loaded (`loadingdone` listener). |
| 31 | Several staves on one page | Ids are prefixed with `useId`; no selector is global; loader is shared. |
| 32 | Server render and hydration | Server output is the root, description, and a placeholder of one system's height. No VexFlow on the server. |
| 33 | Right-to-left page direction | Root sets `dir="ltr"`; notation is always left to right. |
| 34 | Browser zoom or pinch zoom of the page | Rect arithmetic stays correct because both rect and pointer are in client pixels. |
| 35 | Sign applied to a rest, tie on a rest, chord head on a rest | Rejected, `no-target`; the palette buttons are disabled in that state. |
| 36 | Head moved onto a position already in its chord | By arrow or step: skipped over. By drag: rejected on release, ghost shakes, note returns. |
| 37 | Earlier sign changes a later note's meaning | The later single note's pitch is rewritten by the reading rule in the same action; one history entry; appearance of the later note unchanged. |
| 38 | Stylus (`pointerType: 'pen'`) | Treated as mouse: hover ghost if the device reports hover, no loupe. |
| 39 | Keyboard focus arrives with an empty editable bar | Caret at slot 0 of that bar; "Bar 1, end." announced on first arrow key, not on focus (focus reads the label and description). |
| 40 | Duration not in `palette.durations` on an authored event | Displayed. Selecting it shows no pressed duration button. It can be changed to an offered value but not back. |

## 10. Test plan for P0-08

VexFlow needs a canvas 2D context to measure text, and jsdom has none. Add
`src/components/stave/test-utils.ts` that stubs
`HTMLCanvasElement.prototype.getContext` to return
`{ font: '', measureText: (t) => ({ width: t.length * 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 10 }) }`,
stubs `document.fonts` with `{ load: async () => [], addEventListener() {} }`,
stubs `ResizeObserver`, and gives the root a fixed `getBoundingClientRect`.
This was verified to be enough for VexFlow 5 to format and draw under jsdom.
The pitch and rhythm engines may not be merged when P0-08 starts; tests of
pure files take the engines as parameters or use small fakes built on the
contract in `src/engine/api.ts`.

### 10.1 Unit tests (pure functions, table-driven)

`layout/hit-test.test.ts`

- `clientToUnits`: identity scale, 1.5 scale, offset rect, scaled-down rect.
- `positionAtY` / `snapPosition`: exact line, exact space, 0.49 and 0.51 from a
  line on first contact; hysteresis holds at 0.6 and releases at 0.7; clamps at
  both ends of the range.
- `locate`: inside a core; in a wide gap (slot); in a narrow gap (splits to the
  nearer event); left of the first event (slot 0); append zone (slot n); empty
  bar; over the clef (`none`); between systems; far above (`none`); head
  selection within 1.5 positions and `null` outside; displaced head in a
  second.
- Column tiling: for random bar layouts, columns and slots cover the bar with
  no gap or overlap.

`edit/accidentals.test.ts`

- Display rule: key signature note shows nothing; chromatic note shows a sign;
  repeat in the same bar shows nothing; same letter in another octave shows
  it again; natural after a sharp; `showAccidental: true` redundant sign;
  `false` hides; tie continuation in the bar and across the barline; the note
  after a cross-bar tie needs its sign again.
- Reading rule: plain head in C, G, D, F and B flat major; after an earlier
  sign; different octave unaffected; explicit natural in a sharp key; doubles.
- Round trip: `fromWritten(toWritten(bar))` preserves pitches for every
  authored bar in a fixture set, and preserves signs for single notes.

`edit/reducer.test.ts` (one `describe` per action in section 11.2)

- Each action's normal case, focus result, and each rejection reason it can
  return.
- Locking: every action on a locked bar, a locked prefix event and a locked
  suffix event returns `locked` and the same passage reference.
- Immutability: the input passage is deep-frozen in every test.
- Untouched bars are reference-equal in the output.
- Reading-rule propagation: adding a sharp to the first F changes a later
  plain F's pitch and not its `showAccidental`.
- Moving a head clears its sign; heads stay sorted; chord of two collapsing is
  impossible (`position-occupied`).
- Capacity: insertion at exactly twice nominal length accepted, one more
  rejected.
- Tie pruning in each case of 4.5.
- `single-note` kind: `set-single-note` creates then moves; never two events.
- Chords are emitted with `showAccidental` omitted; single notes with it set.

`notation/stems.test.ts`: every row of 4.4, in all four clefs for the single
note rule.

`notation/to-vexflow.test.ts`: key strings, duration codes, rest positions per
clef, key signature specs for all 15 signatures, sign type strings.

`layout/plan.test.ts`: greedy breaking; max 4 per system; justification
threshold; single wide bar triggers the scale-down value; narrow widths 200,
218, 262, 400, 700 units.

`a11y/describe.test.ts`: every announcement in 6.3 in uk and us; positions
mode for positions -6 to 14; passage description for a fixture; key signature
given as a count; marks suffixes.

`use-edit-history.test.ts`: push, undo, redo, redo cleared by a new edit, cap
at 50, reset on a foreign passage.

### 10.2 Component tests (React Testing Library, jsdom, stubs above)

1. Read mode renders an `<svg>` with one `.vf-stavenote` per event and
   `role="img"` with the given label.
2. The description paragraph matches `describePassage`.
3. `marks` adds `mtn-ev--wrong` to the right group and renders a badge;
   changing only `marks` does not change the notation SVG's child node
   identities (no redraw).
4. `cursor` adds and moves `mtn-ev--playing` without a redraw.
5. Read + tap: one button per event with correct labels; click calls
   `onEventTap(bar, event)`; Right arrow moves focus; one Tab stop.
6. Edit: pointer down and up on a slot (coordinates computed from the stubbed
   rect and the exposed layout) calls `onChange` once with the inserted note.
7. Edit: press on a head, move beyond slop, release: one `onChange` with the
   moved pitch; release without moving: none.
8. `pointercancel` mid-drag: no `onChange`.
9. Keyboard: `C`, `D`, Up, `.`, Backspace, Ctrl+Z produce the expected
   sequence of passages (parent test harness holds state).
10. Palette shows only enabled controls; duration button with a selection
    changes that event; dot arms for one insertion only.
11. Locked bars: tap does nothing; events have `mtn-ev--locked`.
12. `single-note` kind: two taps at different heights leave one note.
13. Live region text after place, move and reject.
14. `sound`: mocked engine receives `noteOn` on place and move, nothing on
    delete; nothing at all with `sound={false}`.
15. Undo and redo buttons disabled state; history cleared when the parent
    swaps the passage.
16. Re-render with an equal but new `passage` object does not redraw.
17. `NoteSprite` renders once per key and is not re-rendered when its parent
    re-renders with the same props.

### 10.3 Manual checks (real devices; record results in the P0-08 report)

Devices: an iPhone (Safari), an Android phone (Chrome), a desktop with mouse
and keyboard, and one screen reader each of VoiceOver iOS and NVDA or
VoiceOver macOS.

1. Glyphs are Bravura on first paint; no flash of fallback boxes.
2. Light and dark theme: lines, notes, ledger lines, marks all follow tokens.
3. 320, 360, 390, 768 and 1280 px widths: no horizontal page scroll; system
   breaks sensible; rotation redraws.
4. Phone: place ten notes by tap at `lg`; count wrong-position placements
   (target: at most one in ten). Tune `CORE`, hysteresis and scale if worse.
5. Phone: drag with the loupe near the top, bottom, left and right edges; the
   loupe stays on screen and shows the ghost.
6. Phone: swipe vertically starting on a locked bar and on the palette scrolls
   the page; starting on an editable bar does not.
7. Phone: double-tap quickly on the stave does not zoom; long press shows no
   menu or callout.
8. Rest positions look right in all four clefs for every value, especially
   semibreve (hangs from the fourth line), minim (sits on the third) and breve.
9. Stems, beams (4/4, 3/4, 6/8, 2/2), seconds in chords, accidental columns on
   a triad with three signs, double dots, ties across a barline and a system
   break.
10. Notes at positions -6 and 14 in each clef: ledger lines complete, nothing
    clipped, badge visible.
11. Overfull bar on a phone: scale-down, then scroll; edited note kept in
    view.
12. Short bar: blank space at the right, nothing auto-filled.
13. Keyboard only: complete "write a bar of 3/4" without the mouse; focus ring
    visible; Tab order surface then palette then out.
14. Screen reader: label and description read on focus; each palette action
    announced; a full "place this note" question completed with the Step
    buttons alone; positions mode does not speak the letter name.
15. Reduced motion on: no shake, no fade, no smooth scroll.
16. Colour-blind check (greyscale screenshot): correct, wrong and highlight
    are distinguishable by shape.
17. Performance panel, 4x throttle: full draw of 4 bars within budget; marks
    toggle causes no layout of the notation; Note Rush demo holds 60 fps with
    six sprites.
18. Sound: first tap after page load unlocks and plays; mute silences; no
    stuck notes after rapid dragging.
19. Two staves on one page do not interfere (ids, focus, history).

## 11. File structure for `src/components/stave/`

```
index.ts                  named exports: Stave, NoteSprite, staveMetrics, types
types.ts                  StaveProps and friends (section 13), LayoutModel, EditUiState
constants.ts              every tunable number in this document
stave.tsx                 the component: wiring only (effects, refs, handlers); no theory, no VexFlow calls
stave.css
stave-palette.tsx         toolbar
stave-overlay.tsx         marks, cursor, selection, caret, ghost, locks (SVG)
stave-loupe.tsx
stave-event-buttons.tsx   read + tap buttons
note-sprite.tsx           Note Rush sprite + staveMetrics
stave-sound.ts            the only file importing @/audio
vexflow-loader.ts         the only dynamic import of vexflow
use-edit-history.ts
use-stave-gestures.ts     pointer state machine -> EditAction / UI updates
use-stave-keyboard.ts     key map -> EditAction / UI updates
render/
  draw.ts                 the only file that uses VexFlow classes; returns LayoutModel
  decorate.ts             classes and overlay from marks/cursor/selection
notation/                 PURE (engine types only)
  to-vexflow.ts           keys, duration codes, clef/key/time specs, sign types
  stems.ts
  tuplets.ts              chunking for display
layout/                   PURE
  plan.ts                 system breaking, widths, vertical box
  hit-test.ts             clientToUnits, positionAtY, snapPosition, locate
edit/                     PURE (Passage + action -> Passage)
  actions.ts              EditAction, EditResult, RejectReason, EditConstraints
  reducer.ts
  accidentals.ts          display rule, reading rule, toWritten, fromWritten
  ties.ts                 pruning, tie pairs for drawing
  constraints.ts          locks, range, capacity checks
  navigation.ts           stops, next/previous, reference position
a11y/                     PURE
  describe.ts
  strings.ts
test-utils.ts
*.test.ts(x)              beside each file
```

Import rules inside the folder: `edit/`, `layout/`, `notation/` and `a11y/`
import only `@/engine` types and API and each other. They never import React,
VexFlow, `@/audio` or the DOM. The engines are passed in
(`createReducer({ pitch, rhythm })`) so tests can run before P0-04 and P0-05
are merged.

### 11.1 Reducer signature

```ts
export interface EditConstraints {
  kind: 'free' | 'single-note';
  editable: { bar: number; lockedPrefix: number; lockedSuffix: number }[];
  range: { min: number; max: number };          // positions
  maxChordSize: 1 | 2 | 3 | 4;                   // 1 unless palette.chords, then 4
  allow: { values: NoteValue[]; rests: boolean; signs: Accidental[]; maxDots: 0 | 1 | 2; ties: boolean };
}
export type RejectReason =
  | 'locked' | 'out-of-range' | 'bar-full' | 'chord-full'
  | 'position-occupied' | 'not-allowed' | 'no-target';
export type EditFocus =
  | { kind: 'event'; bar: number; event: number; pitchIndex: number }
  | { kind: 'slot'; bar: number; slot: number };
export type EditResult =
  | { ok: true; passage: Passage; focus: EditFocus; sound: Pitch[] }
  | { ok: false; reason: RejectReason };
export function reduce(passage: Passage, action: EditAction, c: EditConstraints): EditResult;
```

`sound` is what the UI should play (empty for silent actions). `focus` is the
selection or caret the UI should adopt. On rejection the caller keeps the same
passage reference.

Every accepted action ends with the same tail: convert the edited bar back
with `fromWritten` (4.2), sort heads ascending, prune ties (4.5), and return a
new `Passage` sharing every untouched bar by reference.

### 11.2 Actions

`sign` is `Accidental | null`. All indexes refer to the passage before the
action. Every action first checks locks (`locked`) and that the target exists
(`no-target`).

| Action | Fields | Semantics | Can reject with |
| --- | --- | --- | --- |
| `insert-note` | `bar, slot, position, value, dots, sign` | Insert a one-head note at `slot`. Pitch by the reading rule. Events at and after `slot` shift right. Focus: the new event. | `out-of-range`, `bar-full`, `not-allowed` |
| `insert-rest` | `bar, slot, value, dots` | Insert a rest at `slot`. Focus: the new event. | `bar-full`, `not-allowed` |
| `set-single-note` | `bar, position, sign` | Kind `single-note` only. If the editable region of the bar is empty, insert a note of `allow.values[0]`; else replace its head's position and sign. Focus: that event. | `out-of-range`, `not-allowed` |
| `move-head` | `bar, event, pitchIndex, position` | Move one head to an absolute position; clear its sign; re-read. Focus: the head at its new sorted index. | `out-of-range`, `position-occupied`, `no-target` (rest), `not-allowed` (tuplet) |
| `add-head` | `bar, event, position, sign` | Add a head to a note. Focus: the new head. | `chord-full`, `position-occupied`, `out-of-range`, `no-target` (rest) |
| `remove-head` | `bar, event, pitchIndex` | Remove one head; if it was the only head, behaves as `delete-event`. Focus: nearest remaining head, or the slot. | |
| `set-sign` | `bar, event, pitchIndex, sign` | Set or clear the drawn sign; re-read this and later heads in the bar. | `not-allowed`, `no-target` (rest) |
| `set-value` | `bar, event, value` | Change the note value; dots kept if `allow.maxDots` permits, else reduced. | `bar-full`, `not-allowed` |
| `set-dots` | `bar, event, dots` | Set dots. | `bar-full`, `not-allowed` |
| `to-rest` | `bar, event` | Note becomes a rest of the same duration; its tie is dropped. | `not-allowed` |
| `to-note` | `bar, event, position` | Rest becomes a one-head note at `position`. | `out-of-range`, `not-allowed` |
| `toggle-tie` | `bar, event` | Flip `tieToNext` on a note. Turning on is allowed when there is no next event, or the next event shares an identical pitch. | `not-allowed`, `no-target` (rest, or next event shares no pitch) |
| `delete-event` | `bar, event` | Remove the event; later events shift left; nothing is inserted. Focus: the slot where it was. | `not-allowed` (tuplet) |

Undo and redo are not reducer actions; they replace the whole passage from
history (3.5).

## 12. Out of scope for Phase 0

- More than one stave or voice (grand stave, SATB), cross-stave beams.
- Creating or editing tuplets (they display only).
- Clef, key signature or time signature changes within a passage, and any
  learner editing of clef, key or time signature (those are separate question
  types).
- Reordering events by horizontal drag; copy and paste; multi-select.
- Slurs, articulations, dynamics, ornaments, grace notes, lyrics, text, tempo
  marks, repeat signs, voltas.
- Two heads on the same position in a chord; unisons with different signs.
- Courtesy (cautionary, bracketed) accidentals.
- Centred whole-bar rests and multi-bar rests.
- Manual beaming, manual stem direction, stemlets, beams over rests.
- Anacrusis handling (a pickup bar is simply a short bar).
- Pinch zoom or a user zoom control for the notation.
- A visible keyboard-shortcut help panel (the lesson shell may add one; the
  text exists in `a11y/strings.ts`).
- MIDI or microphone input; entering notes from the on-screen piano (a
  question can wire `KeyboardProps.onNote` to its own passage state).
- Incremental per-bar redraw; canvas backend.
- Printing and export (image, MusicXML).
- Smooth-scrolling playback and a sliding cursor.
- Localisation of announcement strings beyond uk and us terminology.

## 13. Proposed contract changes

Requests to the orchestrator. Nothing here has been edited in
`docs/architecture.md` or the engine contract files.

### 13.1 Revised `StaveProps`

Every existing prop keeps its name and meaning; a caller written against the
current contract still type-checks and behaves the same. Additions are
optional.

```ts
import type { Clef, Duration, Passage, Pitch, Terminology } from '@/engine/types';

export type StaveSize = 'sm' | 'md' | 'lg';
export type StaveMark = 'correct' | 'wrong' | 'highlight';

export interface StavePalette {
  /** Note values offered; the first is armed initially. `dots` on entries is ignored (see `dots`). */
  durations?: Duration[];
  /** true or 'single': flat, natural, sharp. 'double' adds double flat and double sharp. */
  accidentals?: boolean | 'single' | 'double';
  rests?: boolean;
  /** Highest number of dots the learner may add. Default 0. */
  dots?: 0 | 1 | 2;
  ties?: boolean;
  /** Allow more than one pitch per event (up to 4). */
  chords?: boolean;
}

export interface StaveEditOptions {
  /** 'single-note': the editable bar holds one note of palette.durations[0]; a tap sets its pitch. Default 'free'. */
  kind?: 'free' | 'single-note';
  /**
   * Bars the learner may change. Default: every bar, nothing locked.
   * The first `lockedPrefix` and last `lockedSuffix` events of a listed bar are fixed.
   */
  editable?: { bar: number; lockedPrefix?: number; lockedSuffix?: number }[];
}

export interface StaveProps {
  passage: Passage;
  /** 'read' shows notation only; 'edit' accepts input as designed in docs/stave-interaction.md. */
  mode: 'read' | 'edit';
  /** Called with the complete new passage after every edit, undo and redo. The parent owns state. */
  onChange?: (next: Passage) => void;
  /** What an edit may place. Omitted fields are not editable. */
  palette?: StavePalette;
  /** Constrained editing: single-note placement, locked bars and regions. */
  edit?: StaveEditOptions;
  /** Per-event visual state keyed "bar:event", or per-bar keyed "bar". */
  marks?: Record<string, StaveMark>;
  /** Tapping an event in read mode, for "tap the mistake" and playback. */
  onEventTap?: (bar: number, event: number) => void;
  /** Playback cursor position, or null. */
  cursor?: { bar: number; event: number } | null;
  ariaLabel: string;

  /** Default 'md' in read mode, 'lg' in edit mode. */
  size?: StaveSize;
  /** Lowest and highest pitch that can be placed; also fixes the vertical room. Default: three ledger lines each way. */
  range?: { low: Pitch; high: Pitch };
  /** Hide parts of the furniture. All default true. */
  show?: { clef?: boolean; keySignature?: boolean; timeSignature?: boolean; finalBarline?: boolean };
  /** Naming in announcements and palette labels. Default 'uk'. */
  terminology?: Terminology;
  /** 'positions' describes pitches as lines and spaces, for questions where the letter name is the answer. Default 'names'. */
  pitchSpeech?: 'names' | 'positions';
  /** Edit mode only: sound notes as they are placed and moved. Default true. */
  sound?: boolean;
  /** From LearnerSettings.reducedMotion. The CSS media query is honoured as well. */
  reducedMotion?: boolean;
}
```

Reasons:

| Change | Reason |
| --- | --- |
| `palette.accidentals` accepts `'single' \| 'double'` | Doubles are Grade 4 and above; showing five accidental buttons to a Grade 1 learner is clutter. `true` keeps its current meaning. |
| `palette.dots`, `palette.ties`, `palette.chords` | The current palette cannot express dots, ties or chords, all of which the brief requires and all of which must be switchable off for early grades. |
| `edit` | "Pitch only" and "fill the gap" cannot be expressed today. Locking by prefix and suffix counts stays valid while the learner inserts events; locking by event index would not. |
| `marks` accepts a `"bar"` key | A bar of the wrong length has no single wrong event to mark; "complete the bar" feedback needs a bar-level mark. |
| `size` | Note Rush and inline exhibits need a smaller stave than a writing question on a phone. |
| `range` | Lets beginner questions reserve less vertical space (162 px instead of 222 px per system) and stops impossible answers. Mirrors `KeyboardProps.low`/`high`. |
| `show` | "Place this note" and Note Rush need a stave with no time signature or final barline. |
| `terminology` | The stave speaks note value names; components may not read settings, so it must arrive as a prop. |
| `pitchSpeech` | Without it the screen reader output answers every "name this note" and "which line" question. |
| `sound` | Same switch the keyboard contract already has. |
| `reducedMotion` | Convention in architecture.md: animation respects `LearnerSettings.reducedMotion`, which a component can only receive as a prop. |

### 13.2 Additional exports from `src/components/stave`

`NoteSprite` and `staveMetrics` (signatures in section 8), for Note Rush.
Reason: a scrolling game must not re-lay-out notation per frame; a cached
sprite that shares the stave's vertical metrics is the only way to meet the
budget while keeping VexFlow inside this folder.

### 13.3 Engine contract (`src/engine/types.ts`, `src/engine/api.ts`)

1. **Per-pitch accidental display.** Change
   `NoteEvent.showAccidental?: boolean` to
   `showAccidental?: boolean | boolean[]`, where an array is parallel to
   `pitches`. Reason: a single flag cannot say "draw the sharp on the third of
   this chord but nothing on the root", so a learner's redundant or missing
   sign inside a chord cannot be stored (section 4.2, chord limitation). Until
   accepted, P0-08 implements the documented fallback; the only function that
   changes afterwards is `fromWritten`.
2. **The display rule belongs in the engine.** The comment on
   `showAccidental` says "omit to let the engine decide", but `PitchEngine`
   has no function that decides. Proposed addition:

   ```ts
   /**
    * Accidental sign drawn on each pitch of each event of a bar (null = none),
    * from the key signature, earlier notes in the bar, `showAccidental`, and a
    * tie into the bar. `tieIn` is the last event of the previous bar if it is tied.
    */
   accidentalSigns(bar: Bar, key: Key, tieIn?: NoteEvent): (Accidental | null)[][];
   ```

   Reason: marking code (which runs on the server later) needs the same answer
   as the stave. Until it exists the rule lives in
   `src/components/stave/edit/accidentals.ts`, written to move unchanged.
3. **Spoken pitch names.** Proposed addition
   `spokenPitch(pitch: Pitch): string` ("F sharp 4"). Reason: screen reader
   text needs words, and `displayPitchClass` returns glyphs. Until it exists
   the stave builds the string locally.

### 13.4 Not a contract change, but P0-08 needs to know

- The test stubs in section 10 live in the stave folder because
  `src/test/setup.ts` is not owned by P0-08. If the orchestrator prefers them
  global, move the canvas stub there.
- No new dependency is needed. `vexflow/bravura` is an export of the installed
  package.
