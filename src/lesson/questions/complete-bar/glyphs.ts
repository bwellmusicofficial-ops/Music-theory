import type { Duration, Fraction, NoteEvent, Pitch, RestEvent, ScoreEvent } from '@/engine/types';
import { rhythm } from '@/engine/rhythm';
import type { Glyph } from '@/lesson/questions/shared';

/** The event a glyph becomes when added to a bar. */
export function glyphToEvent(glyph: Glyph, fillPitch: Pitch): ScoreEvent {
  const duration: Duration = { value: glyph.duration.value, dots: glyph.duration.dots };
  if (glyph.kind === 'rest') return { kind: 'rest', duration } satisfies RestEvent;
  return { kind: 'note', pitches: [fillPitch], duration } satisfies NoteEvent;
}

/** The glyph an event reads as, or null when it is not a plain note or rest (tuplet, chord, tie). */
export function eventToGlyph(event: ScoreEvent): Glyph | null {
  if (event.duration.tuplet) return null;
  if (event.kind === 'note' && (event.pitches.length !== 1 || event.tieToNext)) return null;
  return { kind: event.kind, duration: { value: event.duration.value, dots: event.duration.dots } };
}

export const sameGlyph = (a: Glyph, b: Glyph): boolean =>
  a.kind === b.kind && a.duration.value === b.duration.value && a.duration.dots === b.duration.dots;

export function glyphLength(glyph: Glyph): Fraction {
  return rhythm.durationLength(glyph.duration);
}
