import type { Bar, Duration, NoteValue, ScoreEvent } from '@/engine/types';
import type { TapRhythmPayload } from './types';

const B4 = { letter: 'B', accidental: 0, octave: 4 } as const;

export const dur = (value: NoteValue, dots: 0 | 1 | 2 = 0): Duration => ({ value, dots });
export const note = (value: NoteValue, dots: 0 | 1 | 2 = 0, tie = false): ScoreEvent => ({
  kind: 'note',
  pitches: [{ ...B4 }],
  duration: dur(value, dots),
  ...(tie ? { tieToNext: true } : {}),
});
export const rest = (value: NoteValue, dots: 0 | 1 | 2 = 0): ScoreEvent => ({ kind: 'rest', duration: dur(value, dots) });
export const bar = (...events: ScoreEvent[]): Bar => ({ events });

export const payloadOf = (bars: Bar[], over: Partial<TapRhythmPayload> = {}): TapRhythmPayload => ({
  time: { beats: 4, beatUnit: 4 },
  bars,
  bpm: 80,
  countInBars: 1,
  showNotation: true,
  listenFirst: false,
  toleranceMs: 150,
  ...over,
});
