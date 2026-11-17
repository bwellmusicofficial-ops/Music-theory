/**
 * Theory engine: shared types.
 *
 * CONTRACT FILE (P0-01). Owned by the orchestrator. Implementation tasks import
 * from here and must not edit it; request a change instead.
 *
 * The engine is pure TypeScript: no React, no DOM, no audio, no randomness
 * except through an injected Rng. Everything here must be serialisable as JSON
 * so it can live in lesson files and in the database.
 */

// ---------------------------------------------------------------------------
// Pitch
// ---------------------------------------------------------------------------

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

/** -2 double flat, -1 flat, 0 natural, 1 sharp, 2 double sharp. */
export type Accidental = -2 | -1 | 0 | 1 | 2;

/** A spelled note name without octave. Spelling matters: F# is not Gb. */
export interface PitchClass {
  letter: Letter;
  accidental: Accidental;
}

/** A spelled pitch in scientific pitch notation. Middle C is C4. */
export interface Pitch extends PitchClass {
  octave: number;
}

export type Clef = 'treble' | 'bass' | 'alto' | 'tenor';

export type IntervalQuality = 'perfect' | 'major' | 'minor' | 'augmented' | 'diminished';

/** `number` is 1-based (unison = 1, octave = 8). Compound intervals are > 8. */
export interface Interval {
  quality: IntervalQuality;
  number: number;
}

export type Mode = 'major' | 'minor';

export interface Key {
  tonic: PitchClass;
  mode: Mode;
}

/** Positive = sharps, negative = flats, 0 = none. Range -7..7. */
export type KeySignature = number;

export type ScaleType =
  | 'major'
  | 'natural-minor'
  | 'harmonic-minor'
  | 'melodic-minor'
  | 'chromatic';

export type ScaleDirection = 'ascending' | 'descending';

export type TriadQuality = 'major' | 'minor' | 'diminished' | 'augmented';

export interface Triad {
  root: PitchClass;
  quality: TriadQuality;
  /** 0 root position, 1 first inversion, 2 second inversion. */
  inversion: 0 | 1 | 2;
}

/** Scale degree 1..7. */
export type Degree = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ---------------------------------------------------------------------------
// Rhythm
// ---------------------------------------------------------------------------

/** Canonical ids use UK names; display names come from `naming`. */
export type NoteValue =
  | 'breve'
  | 'semibreve'
  | 'minim'
  | 'crotchet'
  | 'quaver'
  | 'semiquaver'
  | 'demisemiquaver';

export interface Duration {
  value: NoteValue;
  dots: 0 | 1 | 2;
  /** e.g. triplet = { actual: 3, normal: 2 }, duplet = { actual: 2, normal: 3 }. */
  tuplet?: { actual: number; normal: number };
}

/** Exact length in whole notes (semibreves), always in lowest terms, d > 0. */
export interface Fraction {
  n: number;
  d: number;
}

export interface TimeSignature {
  beats: number;
  beatUnit: 1 | 2 | 4 | 8 | 16;
}

export type MetreKind = 'simple' | 'compound' | 'irregular';

// ---------------------------------------------------------------------------
// Score fragments (what the stave renders and what questions are built from)
// ---------------------------------------------------------------------------

export interface NoteEvent {
  kind: 'note';
  /** One pitch = single note; several = chord. Never empty. */
  pitches: Pitch[];
  duration: Duration;
  tieToNext?: boolean;
  /**
   * Whether an accidental sign is drawn. Omit to let the stave decide from
   * key signature and earlier notes in the bar. A single boolean applies to
   * every pitch; an array is parallel to `pitches` (needed for chords).
   */
  showAccidental?: boolean | boolean[];
  /** Articulation signs on this note (docs/expression.md). Omit for none. */
  articulations?: Articulation[];
  /** A pause (fermata) over the note: held about twice as long. */
  fermata?: boolean;
}

export interface RestEvent {
  kind: 'rest';
  duration: Duration;
  /** A pause (fermata) over the rest. */
  fermata?: boolean;
}

export type ScoreEvent = NoteEvent | RestEvent;

export interface Bar {
  events: ScoreEvent[];
  /** A start-repeat sign at the beginning of this bar. */
  repeatStart?: boolean;
  /** The bar line at the end of this bar. Default 'single' ('final' on the last bar is drawn automatically only if given). */
  endBarline?: EndBarline;
  /** A navigation sign written at this bar (docs/expression.md section 4). */
  marker?: BarMarker;
}

/** A single-stave passage. Multi-stave (SATB) arrives in Phase 4. */
export interface Passage {
  clef: Clef;
  key: Key;
  time: TimeSignature;
  bars: Bar[];
  /** Dynamics, hairpins, slurs, tempo marks and words. Omit for none. */
  expression?: Expression;
}

// ---------------------------------------------------------------------------
// Expression (docs/expression.md). Everything here is optional, so passages
// written before it existed are unchanged in meaning, look and sound.
// ---------------------------------------------------------------------------

export type Articulation = 'staccato' | 'accent' | 'tenuto';

export type EndBarline = 'single' | 'double' | 'final' | 'repeat-end';

export type BarMarker = 'segno' | 'fine' | 'dc' | 'dc-al-fine' | 'ds' | 'ds-al-fine';

export type DynamicLevel = 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff';

/** Points at one event: `bars[bar].events[event]`, both zero-based. */
export interface EventRef {
  bar: number;
  event: number;
}

/** From one event to another, both inclusive; `to` is at or after `from`. */
export interface EventSpan {
  from: EventRef;
  to: EventRef;
}

export interface Expression {
  /** A dynamic letter under an event; it applies until the next one. */
  dynamics?: { at: EventRef; level: DynamicLevel }[];
  /** Getting louder ('cresc') or quieter ('dim') across a span, drawn as a wedge. */
  hairpins?: (EventSpan & { kind: 'cresc' | 'dim' })[];
  /** Curved lines joining different notes to be played smoothly (legato). */
  slurs?: EventSpan[];
  /**
   * The tempo marking at the start: an Italian word, a metronome mark, or both.
   * `bpm` counts `beat` notes per minute (default: the felt beat of the time signature).
   */
  tempo?: { text?: string; bpm?: number; beat?: Duration };
  /** Gradual or sudden tempo changes. `toBpm` defaults are in docs/expression.md section 3. */
  tempoChanges?: (
    | (EventSpan & { kind: 'accel' | 'rit' | 'rall'; toBpm?: number })
    | { at: EventRef; kind: 'a-tempo' }
  )[];
  /** Other words written above or below the stave: cresc., dim., dolce, cantabile, poco, molto... */
  words?: { at: EventRef; text: string; place?: 'above' | 'below'; lang?: 'it' | 'en' | 'fr' | 'de' }[];
}

// ---------------------------------------------------------------------------
// Naming and randomness
// ---------------------------------------------------------------------------

/** Site-wide terminology switch: crotchet/bar (uk) vs quarter note/measure (us). */
export type Terminology = 'uk' | 'us';

/**
 * Seeded random source. Generators take an Rng so that questions are
 * reproducible in tests and replayable from a stored seed.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}
