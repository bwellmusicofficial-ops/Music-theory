import type { Accidental, NoteValue, Passage, Pitch } from '@/engine/types';

export type Sign = Accidental | null;

export type EditAction =
  | { type: 'insert-note'; bar: number; slot: number; position: number; value: NoteValue; dots: 0 | 1 | 2; sign: Sign }
  | { type: 'insert-rest'; bar: number; slot: number; value: NoteValue; dots: 0 | 1 | 2 }
  | { type: 'set-single-note'; bar: number; position: number; sign: Sign }
  | { type: 'move-head'; bar: number; event: number; pitchIndex: number; position: number }
  | { type: 'add-head'; bar: number; event: number; position: number; sign: Sign }
  | { type: 'remove-head'; bar: number; event: number; pitchIndex: number }
  | { type: 'set-sign'; bar: number; event: number; pitchIndex: number; sign: Sign }
  | { type: 'set-value'; bar: number; event: number; value: NoteValue }
  | { type: 'set-dots'; bar: number; event: number; dots: 0 | 1 | 2 }
  | { type: 'to-rest'; bar: number; event: number }
  | { type: 'to-note'; bar: number; event: number; position: number }
  | { type: 'toggle-tie'; bar: number; event: number }
  | { type: 'delete-event'; bar: number; event: number };

export type EditActionType = EditAction['type'];

export interface EditConstraints {
  kind: 'free' | 'single-note';
  editable: { bar: number; lockedPrefix: number; lockedSuffix: number }[];
  /** Positions. */
  range: { min: number; max: number };
  maxChordSize: 1 | 2 | 3 | 4;
  allow: {
    values: NoteValue[];
    rests: boolean;
    signs: Accidental[];
    maxDots: 0 | 1 | 2;
    ties: boolean;
  };
}

export type RejectReason =
  | 'locked'
  | 'out-of-range'
  | 'bar-full'
  | 'chord-full'
  | 'position-occupied'
  | 'not-allowed'
  | 'no-target';

export type EditFocus =
  | { kind: 'event'; bar: number; event: number; pitchIndex: number }
  | { kind: 'slot'; bar: number; slot: number };

export type EditResult =
  | { ok: true; passage: Passage; focus: EditFocus; sound: Pitch[] }
  | { ok: false; reason: RejectReason };
