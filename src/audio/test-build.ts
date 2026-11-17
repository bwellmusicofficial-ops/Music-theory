import type {
  Bar,
  Duration,
  EndBarline,
  Expression,
  NoteValue,
  Passage,
  Pitch,
  ScoreEvent,
  TimeSignature,
} from '@/engine/types';

/** Small builders for hand-written test passages. */
export const pitch = (letter: Pitch['letter'], octave: number, accidental: Pitch['accidental'] = 0): Pitch => ({
  letter,
  accidental,
  octave,
});
export const C4 = pitch('C', 4);
export const D4 = pitch('D', 4);
export const E4 = pitch('E', 4);
export const F4 = pitch('F', 4);
export const G4 = pitch('G', 4);
export const A4 = pitch('A', 4);
export const B4 = pitch('B', 4);
export const C5 = pitch('C', 5);

/** Frequencies in Hz (equal temperament, A4 = 440). */
export const HZ = { C4: 261.6256, D4: 293.6648, E4: 329.6276, F4: 349.2282, G4: 391.9954, A4: 440, B4: 493.8833, C5: 523.2511 };

export const dur = (value: NoteValue, dots: Duration['dots'] = 0): Duration => ({ value, dots });
export const crotchet = dur('crotchet');

export interface NoteExtras {
  tie?: boolean;
  art?: ('staccato' | 'accent' | 'tenuto')[];
  fermata?: boolean;
}
export const note = (pitches: Pitch | Pitch[], duration: Duration = crotchet, extras: NoteExtras = {}): ScoreEvent => ({
  kind: 'note',
  pitches: Array.isArray(pitches) ? pitches : [pitches],
  duration,
  ...(extras.tie ? { tieToNext: true } : {}),
  ...(extras.art ? { articulations: extras.art } : {}),
  ...(extras.fermata ? { fermata: true } : {}),
});
export const rest = (duration: Duration = crotchet, fermata = false): ScoreEvent => ({
  kind: 'rest',
  duration,
  ...(fermata ? { fermata: true } : {}),
});

export interface BarExtras {
  repeatStart?: boolean;
  end?: EndBarline;
  marker?: Bar['marker'];
}
export const bar = (events: ScoreEvent[], extras: BarExtras = {}): Bar => ({
  events,
  ...(extras.repeatStart ? { repeatStart: true } : {}),
  ...(extras.end ? { endBarline: extras.end } : {}),
  ...(extras.marker ? { marker: extras.marker } : {}),
});

/** Four crotchets C D E F, or the given pitches. */
export const fourCrotchets = (extras: BarExtras = {}, pitches: Pitch[] = [C4, D4, E4, F4]): Bar =>
  bar(pitches.map((p) => note(p)), extras);

export const passageOf = (
  bars: Bar[],
  expression?: Expression,
  time: TimeSignature = { beats: 4, beatUnit: 4 },
): Passage => ({
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time,
  bars,
  ...(expression ? { expression } : {}),
});

export const at = (bar: number, event: number) => ({ bar, event });
