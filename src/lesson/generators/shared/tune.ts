import { pitch } from '@/engine/pitch';
import type { Bar, Pitch, Rng } from '@/engine/types';

const C_MAJOR = { letter: 'C', accidental: 0 } as const;

/**
 * The notes of C major from C4 up to A5, all from the engine's scale: the range a stepwise tune walks in
 * (treble clef, at most one ledger line below).
 */
export function tuneRange(): Pitch[] {
  const low = pitch.scale(C_MAJOR, 'major', 4);
  const high = pitch.scale(C_MAJOR, 'major', 5).slice(1, 7);
  return [...low, ...high];
}

/**
 * `count` pitches that move by step: one `rng.int(4, 8)` for the start (G4 to E5), then one
 * `rng.pick([-1, 1])` per further note. A step that would leave the range goes the other way.
 */
export function stepwiseTune(rng: Rng, count: number): Pitch[] {
  const range = tuneRange();
  let at = rng.int(4, 8);
  const out: Pitch[] = [{ ...range[at]! }];
  for (let i = 1; i < count; i += 1) {
    let step = rng.pick([-1, 1]);
    if (at + step < 0 || at + step >= range.length) step = -step;
    at += step;
    out.push({ ...range[at]! });
  }
  return out;
}

/** The bars with each note's pitch replaced, in order, by the next pitch of `pitches`. */
export function withPitches(bars: Bar[], pitches: Pitch[]): Bar[] {
  let next = 0;
  return bars.map((bar) => ({
    ...bar,
    events: bar.events.map((event) => (event.kind === 'note' ? { ...event, pitches: [{ ...pitches[next++]! }] } : event)),
  }));
}

export const noteCount = (bars: Bar[]): number => bars.reduce((sum, bar) => sum + bar.events.filter((e) => e.kind === 'note').length, 0);
