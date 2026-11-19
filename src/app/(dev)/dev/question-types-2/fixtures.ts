import { pitch } from '@/engine/pitch';
import type { Bar, Clef, NoteValue, Passage, ScoreEvent } from '@/engine/types';

/** Passages for the question-types-2 harness. Every pitch comes from the engine's parser. */
const n = (p: string, value: NoteValue = 'crotchet'): ScoreEvent => ({ kind: 'note', pitches: [pitch.parsePitch(p)], duration: { value, dots: 0 } });
const rest = (value: NoteValue = 'crotchet'): ScoreEvent => ({ kind: 'rest', duration: { value, dots: 0 } });

function make(bars: Bar[], clef: Clef = 'treble'): Passage {
  return { clef, key: { tonic: pitch.parsePitchClass('C'), mode: 'major' }, time: { beats: 4, beatUnit: 4 }, bars };
}

/**
 * Three bars with written beams that differ from the standard:
 * bar 1 all eight quavers in one beam, bar 2 no beams at all (`[]`), bar 3 a beam across the middle of beat 2 into beat 3.
 */
export const WRONG_BEAMS: Passage = make([
  { events: ['C5', 'D5', 'E5', 'F5', 'G5', 'F5', 'E5', 'D5'].map((p) => n(p, 'quaver')), beams: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { events: [...['B4', 'C5', 'D5', 'C5'].map((p) => n(p, 'quaver')), n('G4', 'minim')], beams: [] },
  { events: [n('E5'), ...['D5', 'C5', 'D5', 'E5'].map((p) => n(p, 'quaver')), rest()], beams: [[2, 3]] },
]);

/** Two bars of crotchets with a gap offered after every event but the last. */
export const GAP_PASSAGE: Passage = make([
  { events: ['C5', 'D5', 'E5', 'F5'].map((p) => n(p)) },
  { events: ['G5', 'F5', 'E5', 'D5'].map((p) => n(p)) },
]);

/** After every event but the very last. */
export const GAPS_OFFERED = GAP_PASSAGE.bars.flatMap((b, bar) => b.events.map((_, event) => ({ bar, event }))).slice(0, -1);
/** Gaps on at the start: after note 2 and after note 4 (the bar line). */
export const GAPS_ON_AT_START = [
  { bar: 0, event: 1 },
  { bar: 0, event: 3 },
];

/** A stave for the key-signature edit: the clef is all the component takes from the passage. */
export const keySignaturePassage = (clef: Clef): Passage => make([{ events: [rest('semibreve')] }], clef);
