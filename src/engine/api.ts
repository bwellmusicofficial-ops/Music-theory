/**
 * Theory engine: public API contract.
 *
 * CONTRACT FILE (P0-01). Owned by the orchestrator.
 *
 * P0-04 implements `PitchEngine` in `src/engine/pitch/` and exports
 *   `export const pitch: PitchEngine`
 * P0-05 implements `RhythmEngine` in `src/engine/rhythm/` and exports
 *   `export const rhythm: RhythmEngine`
 * P0-04 also provides `createRng(seed: number): Rng` in `src/engine/rng.ts`.
 *
 * Rules for implementers:
 * - Pure functions. No mutation of arguments. No I/O.
 * - Invalid input throws `TheoryError` with a message a developer can act on.
 * - Spelling is always correct for the key: never return an enharmonic
 *   shortcut (D major's third degree is F#, not Gb).
 * - Every function is covered by table-driven tests.
 */

import type {
  Bar,
  Clef,
  Degree,
  Duration,
  Fraction,
  Interval,
  Key,
  KeySignature,
  MetreKind,
  NoteValue,
  Pitch,
  PitchClass,
  ScaleDirection,
  ScaleType,
  ScoreEvent,
  Terminology,
  TimeSignature,
  Triad,
  TriadQuality,
} from './types';

export class TheoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TheoryError';
  }
}

export interface PitchEngine {
  // --- parsing and formatting ---------------------------------------------
  /** "C4", "F#3", "Bb5", "Ebb2", "Fx4" (x = double sharp). */
  parsePitch(text: string): Pitch;
  /** "C", "F#", "Bb". */
  parsePitchClass(text: string): PitchClass;
  /** ASCII form, the inverse of parsePitch. */
  formatPitch(pitch: Pitch): string;
  /** Display form with real accidental glyphs (♯ ♭ 𝄪 𝄫), no octave. */
  displayPitchClass(pc: PitchClass): string;

  // --- numeric relationships ----------------------------------------------
  /** MIDI note number. C4 = 60. */
  toMidi(pitch: Pitch): number;
  /** Semitones above C, 0..11. */
  chroma(pc: PitchClass): number;
  enharmonicallyEqual(a: PitchClass, b: PitchClass): boolean;
  /** Negative if a is lower than b, 0 if same sounding pitch, else positive. */
  comparePitch(a: Pitch, b: Pitch): number;

  // --- stave positions ----------------------------------------------------
  /**
   * Diatonic steps above the bottom line of the stave for this clef.
   * Bottom line = 0, first space = 1, top line = 8. Ledger lines extend
   * below 0 and above 8. Accidentals do not affect position.
   */
  stavePosition(pitch: Pitch, clef: Clef): number;
  /** Inverse of stavePosition; returns a natural (accidental 0). */
  pitchAtStavePosition(position: number, clef: Clef): Pitch;

  // --- intervals ----------------------------------------------------------
  /** Interval from the lower to the higher of the two pitches. */
  intervalBetween(a: Pitch, b: Pitch): Interval;
  /** Throws if the result would need more than a double accidental. */
  transpose(pitch: Pitch, interval: Interval, direction: 'up' | 'down'): Pitch;
  semitones(interval: Interval): number;
  /** "major 3rd", "perfect 5th", "augmented 4th", "minor 10th". */
  intervalName(interval: Interval): string;

  // --- keys and scales ----------------------------------------------------
  /** All 15 major and 15 minor keys with signatures of up to 7 sharps/flats. */
  allKeys(): Key[];
  keySignature(key: Key): KeySignature;
  keyFromSignature(signature: KeySignature, mode: Key['mode']): Key;
  /** Sharps or flats in the order they are written: F C G D A E B / B E A D G C F. */
  signatureAccidentals(signature: KeySignature): PitchClass[];
  relativeKey(key: Key): Key;
  /** "D major", "F♯ minor". */
  keyName(key: Key): string;
  /**
   * One octave of the scale, tonic to tonic inclusive (8 notes; chromatic 13).
   * Melodic minor differs by direction; other types ignore it apart from order.
   */
  scale(
    tonic: PitchClass,
    type: ScaleType,
    startOctave: number,
    direction?: ScaleDirection,
  ): Pitch[];
  /** Pitch class on a degree of the key's scale (harmonic form for minor keys). */
  degree(key: Key, degree: Degree): PitchClass;
  /** tonic, supertonic, mediant, subdominant, dominant, submediant, leading note. */
  degreeName(degree: Degree): string;

  // --- triads -------------------------------------------------------------
  /** Notes from the bass upward, closest spacing, bass in `bassOctave`. */
  triadPitches(triad: Triad, bassOctave: number): Pitch[];
  /** Diatonic triad on a degree (harmonic minor in minor keys). */
  triadOnDegree(key: Key, degree: Degree): { root: PitchClass; quality: TriadQuality };
  /** "I", "ii", "IV", "V", "vii°"; with inversion suffix "b"/"c" when not root position. */
  romanNumeral(key: Key, triad: Triad): string;
  /** Identify a triad from any three pitches, or null if they do not form one. */
  identifyTriad(pitches: Pitch[]): Triad | null;
}

export interface RhythmEngine {
  // --- durations ----------------------------------------------------------
  /** Length in whole notes, including dots and tuplet ratio. */
  durationLength(duration: Duration): Fraction;
  /** Length of one full bar. */
  barLength(time: TimeSignature): Fraction;
  eventsLength(events: ScoreEvent[]): Fraction;
  addFractions(a: Fraction, b: Fraction): Fraction;
  compareFractions(a: Fraction, b: Fraction): number;

  // --- naming -------------------------------------------------------------
  /** uk: "crotchet", "dotted minim"; us: "quarter note", "dotted half note". */
  noteValueName(duration: Duration, terminology: Terminology): string;
  /** uk: "crotchet rest"; us: "quarter rest". */
  restName(duration: Duration, terminology: Terminology): string;
  /** Maps each NoteValue to its length; exposed for UI pickers. */
  noteValues(): readonly NoteValue[];

  // --- metre --------------------------------------------------------------
  metreKind(time: TimeSignature): MetreKind;
  /** Felt beats per bar: 6/8 = 2, 9/8 = 3, 3/4 = 3, 2/2 = 2. */
  beatsPerBar(time: TimeSignature): number;
  /** Length of one felt beat: 6/8 = dotted crotchet = 3/8. Irregular metres throw. */
  beatLength(time: TimeSignature): Fraction;
  /** uk: "simple triple", "compound duple". */
  metreName(time: TimeSignature): string;

  // --- bar validation and grouping ----------------------------------------
  /** Exactly full, under or over, with the difference. */
  checkBarLength(
    bar: Bar,
    time: TimeSignature,
  ): { status: 'complete' | 'short' | 'long'; difference: Fraction };
  /**
   * Beam groups for a bar following standard conventions: beam within the
   * beat; in 4/4 quavers may beam across beats 1-2 and 3-4 but never across
   * the middle of the bar; in compound time beam in dotted-beat groups.
   * Returns arrays of indexes into `bar.events`; unbeamed notes are omitted.
   */
  beamGroups(bar: Bar, time: TimeSignature): number[][];
  /**
   * Convention problems in how a bar is written (not its total length):
   * a note that hides a beat it should show, rests grouped wrongly, and so on.
   * Empty array means the bar is correctly grouped.
   */
  groupingProblems(
    bar: Bar,
    time: TimeSignature,
  ): { eventIndex: number; message: string }[];
  /** Fewest correctly grouped rests that fill a gap starting at `offset` in the bar. */
  restsToFill(offset: Fraction, length: Fraction, time: TimeSignature): Duration[];

  // --- performance timing (for the rhythm pad and playback) -----------------
  /**
   * Onset time in seconds of every sounded note (rests and tied continuations
   * excluded) at the given tempo, where bpm counts felt beats per minute.
   */
  onsetTimes(bars: Bar[], time: TimeSignature, bpm: number): number[];
}
