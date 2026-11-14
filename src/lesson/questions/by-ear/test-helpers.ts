import type { Passage } from '@/engine/types';
import type { ByEarPayload } from './types';

const G4 = { letter: 'G', accidental: 0, octave: 4 } as const;

export const passageOf = (...values: ('crotchet' | 'minim')[]): Passage => ({
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time: { beats: 2, beatUnit: 4 },
  bars: [{ events: values.map((value) => ({ kind: 'note' as const, pitches: [{ ...G4 }], duration: { value, dots: 0 as const } })) }],
});

/** The spec example: two clips, "Clip A" (two crotchets) and "Clip B" (one minim). */
export const specExample: ByEarPayload = {
  clips: [
    { bpm: 80, passage: passageOf('crotchet', 'crotchet') },
    { bpm: 90, passage: passageOf('minim') },
  ],
  options: [
    {
      id: 'a',
      face: { kind: 'text', text: 'Clip A' },
      reason: 'Clip A has two short notes of 1 beat each. The long 2-beat note is in clip B.',
    },
    { id: 'b', face: { kind: 'text', text: 'Clip B' } },
  ],
  correct: 'b',
};
