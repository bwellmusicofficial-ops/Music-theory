import { TheoryError } from '../api';
import type { Fraction, MetreKind, ScoreEvent, TimeSignature } from '../types';
import { frac } from './fraction';

const BEAT_UNITS = [1, 2, 4, 8, 16];

export function validateTime(time: TimeSignature): void {
  if (!Number.isInteger(time.beats) || time.beats < 1) {
    throw new TheoryError(`Time signature needs a positive whole number of beats, got ${time.beats}`);
  }
  if (!BEAT_UNITS.includes(time.beatUnit)) {
    throw new TheoryError(`Beat unit must be 1, 2, 4, 8 or 16, got ${String(time.beatUnit)}`);
  }
}

export function barLength(time: TimeSignature): Fraction {
  validateTime(time);
  return frac(time.beats, time.beatUnit);
}

export function metreKind(time: TimeSignature): MetreKind {
  validateTime(time);
  if (time.beats === 2 || time.beats === 3 || time.beats === 4) return 'simple';
  if (time.beats === 6 || time.beats === 9 || time.beats === 12) return 'compound';
  return 'irregular';
}

/**
 * Felt beats per bar. Irregular metres return the written top number
 * (5/4 = 5), since there is no single felt grouping.
 */
export function beatsPerBar(time: TimeSignature): number {
  return metreKind(time) === 'compound' ? time.beats / 3 : time.beats;
}

export function beatLength(time: TimeSignature): Fraction {
  const kind = metreKind(time);
  if (kind === 'irregular') {
    throw new TheoryError(
      `${time.beats}/${time.beatUnit} is an irregular metre and has no single felt beat length`,
    );
  }
  return kind === 'compound' ? frac(3, time.beatUnit) : frac(1, time.beatUnit);
}

/** Like beatLength, but irregular metres fall back to the written beat unit. */
export function feltBeat(time: TimeSignature): Fraction {
  return metreKind(time) === 'irregular' ? frac(1, time.beatUnit) : beatLength(time);
}

export function metreName(time: TimeSignature): string {
  const kind = metreKind(time);
  if (kind === 'irregular') return 'irregular';
  const beats = beatsPerBar(time);
  const word = beats === 2 ? 'duple' : beats === 3 ? 'triple' : 'quadruple';
  return `${kind} ${word}`;
}

/**
 * True when the events are just the conventional whole-bar rest: a lone
 * semibreve rest in any time signature, or a lone breve rest in 4/2. Such a
 * bar is complete whatever its arithmetic length.
 */
export function isWholeBarRest(events: ScoreEvent[], time: TimeSignature): boolean {
  if (events.length !== 1 || events[0].kind !== 'rest') return false;
  const d = events[0].duration;
  const glyph = time.beats === 4 && time.beatUnit === 2 ? 'breve' : 'semibreve';
  return d.value === glyph && d.dots === 0 && !d.tuplet;
}
