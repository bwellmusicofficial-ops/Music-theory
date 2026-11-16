import type { Passage, Pitch } from '@/engine/types';

/** docs/question-payloads.md 2.5 */
export interface PlayKeyboardPayload {
  /** Keyboard range. Both must be white keys. */
  low: Pitch;
  high: Pitch;
  /** Letter names printed on the keys. Default false. */
  showLabels?: boolean;
  /**
   * true (default): reasons name notes by letter ("F♯ does not belong"). false: reasons
   * describe position and colour only ("That key is two keys too far to the right"), with no
   * letter names or accidentals. For lessons before the note names are taught.
   */
  nameNotes?: boolean;
  /** 1 to 8 notes to play. */
  targets: Pitch[];
  /** 'sequence': one after another in this order. 'together': as a chord, any order. */
  mode: 'sequence' | 'together';
  /** 'exact': the right key. 'any': the right note name on any key in range. */
  octave: 'exact' | 'any';
  /** Notation shown above the keyboard (for "play what you see"). */
  passage?: Passage;
}

export interface PlayKeyboardAnswer {
  /** As reported by the keyboard (black keys as sharps). 'sequence': in the order played. 'together': low to high. */
  played: Pitch[];
}
