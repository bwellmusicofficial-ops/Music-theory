import type {
  Accidental,
  Clef,
  Duration,
  NoteValue,
  Passage,
  Pitch,
  Terminology,
} from '@/engine/types';
import type { PitchEngine, RhythmEngine } from '@/engine/api';

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

export interface StaveShow {
  clef?: boolean;
  keySignature?: boolean;
  timeSignature?: boolean;
  finalBarline?: boolean;
}

export interface StaveRange {
  low: Pitch;
  high: Pitch;
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
  /** Lowest and highest pitch that can be placed; also fixes the vertical room. */
  range?: StaveRange;
  /** Hide parts of the furniture. All default true. */
  show?: StaveShow;
  /** Naming in announcements and palette labels. Default 'uk'. */
  terminology?: Terminology;
  /** 'positions' describes pitches as lines and spaces. Default 'names'. */
  pitchSpeech?: 'names' | 'positions';
  /** Edit mode only: sound notes as they are placed and moved. Default true. */
  sound?: boolean;
  /** From LearnerSettings.reducedMotion. The CSS media query is honoured as well. */
  reducedMotion?: boolean;
}

/** Engines are passed into pure code so tests can substitute them. */
export interface Engines {
  pitch: PitchEngine;
  rhythm: RhythmEngine;
}

// --- layout model (section 2.1) -------------------------------------------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface HeadLayout {
  pitchIndex: number;
  position: number;
  x: number;
  y: number;
}
export interface EventLayout {
  bar: number;
  event: number;
  isRest: boolean;
  centreX: number;
  box: Box;
  heads: HeadLayout[];
  colLeft: number;
  colRight: number;
}
export interface BarLayout {
  bar: number;
  system: number;
  x: number;
  width: number;
  noteStartX: number;
  noteEndX: number;
  events: EventLayout[];
  slotX: number[];
}
export interface SystemLayout {
  index: number;
  top: number;
  height: number;
  bottomLineY: number;
  bars: number[];
}
export interface LayoutModel {
  width: number;
  height: number;
  scale: number;
  clef: Clef;
  systems: SystemLayout[];
  bars: BarLayout[];
  /** Width in units of one notehead (for core widths). */
  headWidth: number;
}

// --- edit UI state (section 3.1) -------------------------------------------

export interface Selection {
  bar: number;
  event: number;
  pitchIndex: number;
}
export interface Caret {
  bar: number;
  slot: number;
}
export interface Armed {
  value: NoteValue;
  rest: boolean;
  dots: 0 | 1 | 2;
  sign: Accidental | null;
  chord: boolean;
}
