/** Shared test fixtures. Not imported by production code. */
import { pitch } from '@/engine/pitch';
import { rhythm } from '@/engine/rhythm';
import type { Bar, Clef, Duration, NoteEvent, NoteValue, Passage, Pitch, RestEvent, ScoreEvent } from '@/engine/types';
import type { EditConstraints } from './edit/actions';
import type { Engines } from './types';

export const engines: Engines = { pitch, rhythm };

export const P = (s: string): Pitch => pitch.parsePitch(s);
export const dur = (value: NoteValue, dots: 0 | 1 | 2 = 0): Duration => ({ value, dots });

export function note(p: string | string[], value: NoteValue = 'crotchet', extra: Partial<NoteEvent> = {}): NoteEvent {
  const ps = (Array.isArray(p) ? p : [p]).map(P);
  return { kind: 'note', pitches: ps, duration: dur(value), ...extra };
}
export function rest(value: NoteValue = 'crotchet'): RestEvent {
  return { kind: 'rest', duration: dur(value) };
}
export function bar(...events: ScoreEvent[]): Bar {
  return { events };
}

export function passage(
  bars: Bar[],
  opts: { clef?: Clef; key?: string; mode?: 'major' | 'minor'; beats?: number; unit?: 1 | 2 | 4 | 8 | 16 } = {},
): Passage {
  return {
    clef: opts.clef ?? 'treble',
    key: { tonic: pitch.parsePitchClass(opts.key ?? 'C'), mode: opts.mode ?? 'major' },
    time: { beats: opts.beats ?? 4, beatUnit: opts.unit ?? 4 },
    bars,
  };
}

export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

export function constraints(over: Partial<EditConstraints> & { bars?: number } = {}): EditConstraints {
  const { bars = 4, ...rest_ } = over;
  return {
    kind: 'free',
    editable: Array.from({ length: bars }, (_, bar) => ({ bar, lockedPrefix: 0, lockedSuffix: 0 })),
    range: { min: -6, max: 14 },
    maxChordSize: 4,
    allow: {
      values: ['semibreve', 'minim', 'crotchet', 'quaver', 'semiquaver'],
      rests: true,
      signs: [-2, -1, 0, 1, 2],
      maxDots: 2,
      ties: true,
    },
    ...rest_,
  };
}

/** Compact pitch string of an event, for assertions. */
export function pstr(ev: ScoreEvent): string {
  return ev.kind === 'rest' ? 'rest' : ev.pitches.map((p) => pitch.formatPitch(p)).join('+');
}
