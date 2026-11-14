import type { Clef, Key, Passage, Pitch } from '@/engine/types';

/** One 4/4 bar holding a semibreve at `note`, or an empty bar when `note` is null. */
export function singleNotePassage(clef: Clef, key: Key, note: Pitch | null): Passage {
  return {
    clef,
    key,
    time: { beats: 4, beatUnit: 4 },
    bars: [
      {
        events: note
          ? [{ kind: 'note', pitches: [note], duration: { value: 'semibreve', dots: 0 } }]
          : [],
      },
    ],
  };
}
