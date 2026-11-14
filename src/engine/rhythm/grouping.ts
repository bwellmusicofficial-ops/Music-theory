import type { Bar, Duration, Fraction, ScoreEvent, TimeSignature } from '../types';
import { layout, noteValueName, plainDuration, restName } from './duration';
import {
  ZERO,
  div,
  eq,
  floorDiv,
  frac,
  isMultipleOf,
  le,
  lt,
  mul,
  sub,
} from './fraction';
import { barLength, beatsPerBar, feltBeat, metreKind, validateTime } from './metre';

export interface GroupingProblem {
  eventIndex: number;
  message: string;
}

const isPlain = (d: Duration): boolean => d.dots === 0 && !d.tuplet;

function ordinal(n: number): string {
  return `beat ${n}`;
}

/**
 * Convention problems in how a bar is written. At most one problem is
 * reported per event (the first rule that applies), sorted by event index.
 */
export function groupingProblems(bar: Bar, time: TimeSignature): GroupingProblem[] {
  validateTime(time);
  const events: ScoreEvent[] = bar.events;
  if (events.length === 0) return [];

  const pos = layout(events);
  const barLen = barLength(time);
  const beat = feltBeat(time);
  const kind = metreKind(time);
  const nBeats = kind === 'irregular' ? time.beats : beatsPerBar(time);
  const quad = kind !== 'irregular' && nBeats === 4;
  const triple = kind !== 'irregular' && nBeats === 3;
  const mid = div(barLen, frac(2));
  const timeText = `${time.beats}/${time.beatUnit}`;

  const found = new Map<number, string>();
  const flag = (i: number, message: string) => {
    if (!found.has(i)) found.set(i, message);
  };
  const result = (): GroupingProblem[] =>
    [...found.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([eventIndex, message]) => ({ eventIndex, message }));

  const beatStart = (k: number): Fraction => mul(beat, frac(k));
  const onBeat = (p: Fraction): boolean => isMultipleOf(p, beat);
  const beatIndex = (p: Fraction): number => floorDiv(p, beat);
  const level = (k: number): number => (quad ? [3, 1, 2, 1][k] ?? 1 : k === 0 ? 2 : 1);
  const levelAt = (p: Fraction): number => (onBeat(p) ? level(beatIndex(p)) : 0);
  const where = (p: Fraction): string =>
    onBeat(p)
      ? `on ${ordinal(beatIndex(p) + 1)}`
      : `part-way through ${ordinal(beatIndex(p) + 1)}`;
  const beatName = (): string => {
    const d = plainDuration(beat);
    return d ? restName(d, 'uk') : 'rest';
  };

  /** Beat starts that fall strictly inside (s, e) and inside the bar. */
  const hiddenBeats = (s: Fraction, e: Fraction): number[] => {
    const out: number[] = [];
    for (let k = beatIndex(s) + 1; ; k++) {
      const p = beatStart(k);
      if (!lt(p, e) || !lt(p, barLen)) break;
      out.push(k);
    }
    return out;
  };

  // (d) A bar that is wholly silent is one whole-bar rest. The conventional
  // whole-bar glyph (semibreve rest, breve rest in 4/2) is accepted on its own
  // whatever the bar's arithmetic length (9/8, 12/8, 3/4, ...).
  {
    const only = events[0].duration;
    const glyph = time.beats === 4 && time.beatUnit === 2 ? 'breve' : 'semibreve';
    if (events.length === 1 && events[0].kind === 'rest' && only.value === glyph && isPlain(only)) {
      return [];
    }
  }
  const total = pos[pos.length - 1].end;
  if (events.every((e) => e.kind === 'rest') && eq(total, barLen)) {
    const breveBar = time.beats === 4 && time.beatUnit === 2;
    const want = breveBar ? 'breve' : 'semibreve';
    const only = events[0].duration;
    const ok = events.length === 1 && only.value === want && isPlain(only);
    if (!ok) {
      flag(
        0,
        `A whole bar of silence is written as a single ${want} rest, whatever the time signature (${timeText}).`,
      );
    }
    return result();
  }

  events.forEach((e, i) => {
    const { start: s, end: en } = pos[i];
    const len = sub(en, s);
    const name = e.kind === 'note' ? noteValueName(e.duration, 'uk') : restName(e.duration, 'uk');

    if (e.kind === 'note') {
      const hidden = hiddenBeats(s, en);
      if (kind === 'simple' && quad) {
        const crosses = lt(s, mid) && lt(mid, en);
        const allowed =
          (eq(s, ZERO) && eq(len, barLen)) ||
          (eq(s, ZERO) && eq(len, mul(beat, frac(3)))) ||
          (eq(s, beat) && eq(len, mul(beat, frac(2))));
        if (crosses && !allowed) {
          flag(
            i,
            `This ${name} starts ${where(s)} and carries across the middle of the bar. Split it into two tied notes so the middle of the bar (the start of beat 3) can be seen.`,
          );
        }
      } else if (kind === 'compound') {
        const wholeBeats = onBeat(s) && isMultipleOf(len, beat);
        if (hidden.length > 0 && !wholeBeats) {
          flag(
            i,
            `This ${name} starts ${where(s)} and hides the start of ${ordinal(hidden[0] + 1)}. In compound time show each dotted beat: split the note and tie the parts.`,
          );
        }
      }
      return;
    }

    // Rests.
    const twoBeats = eq(len, mul(beat, frac(2)));
    if (quad && twoBeats && !(onBeat(s) && (beatIndex(s) === 0 || beatIndex(s) === 2))) {
      flag(
        i,
        `This ${name} lasts two beats but starts ${where(s)}. In a bar of four beats a two-beat rest may only start on beat 1 or beat 3. Use two separate ${beatName()}s instead.`,
      );
      return;
    }
    if (triple && le(mul(beat, frac(2)), len) && lt(len, barLen)) {
      flag(
        i,
        `This ${name} joins beats together. In ${timeText} write a separate ${beatName()} for each beat instead.`,
      );
      return;
    }
    if (quad && lt(s, mid) && lt(mid, en)) {
      flag(
        i,
        `This ${name} starts ${where(s)} and carries across the middle of the bar. Split it so the start of beat 3 is shown.`,
      );
      return;
    }
    if (hiddenBeats(s, en).some((k) => level(k) > levelAt(s))) {
      flag(
        i,
        `This ${name} starts ${where(s)} and carries over a stronger beat. Split the rest so that beat can be seen.`,
      );
    }
  });

  // A silent beat must be one rest (in compound time, also rest + rest as
  // two-thirds then one-third of the beat).
  for (let k = 0; k < nBeats; k++) {
    const bs = beatStart(k);
    const be = beatStart(k + 1);
    const first = pos.findIndex((p) => eq(p.start, bs));
    if (first < 0) continue;
    let j = first;
    while (j < events.length && events[j].kind === 'rest' && le(pos[j].end, be)) {
      if (eq(pos[j].end, be)) break;
      j++;
    }
    if (j >= events.length || events[j].kind !== 'rest' || !eq(pos[j].end, be)) continue;
    const group = events.slice(first, j + 1);
    if (group.length === 1 || group.some((g) => g.duration.tuplet)) continue;
    const okCompound =
      kind === 'compound' &&
      group.length === 2 &&
      eq(sub(pos[first].end, pos[first].start), mul(beat, frac(2, 3))) &&
      eq(sub(pos[j].end, pos[j].start), mul(beat, frac(1, 3)));
    if (okCompound) continue;
    flag(
      first,
      kind === 'compound'
        ? `These rests fill all of ${ordinal(k + 1)}. In compound time a silent beat is one ${beatName()}, or a crotchet-sized rest followed by a quaver-sized rest (in that order), not several smaller rests.`
        : `These rests fill all of ${ordinal(k + 1)}. Write one ${beatName()} instead of several smaller rests.`,
    );
  }

  // Quadruple metres: two one-beat rests filling a whole half bar are one
  // two-beat rest instead (beats 2-3 stay as two separate rests).
  if (quad) {
    const twoBeat = plainDuration(mul(beat, frac(2)));
    const oneBeatRest = (i: number, at: Fraction): boolean =>
      i >= 0 &&
      i < events.length &&
      events[i].kind === 'rest' &&
      !events[i].duration.tuplet &&
      eq(pos[i].start, at) &&
      eq(sub(pos[i].end, pos[i].start), beat);
    for (const h of [0, 2]) {
      const first = pos.findIndex((p) => eq(p.start, beatStart(h)));
      if (oneBeatRest(first, beatStart(h)) && oneBeatRest(first + 1, beatStart(h + 1))) {
        const one = beatName();
        const two = twoBeat ? restName(twoBeat, 'uk') : 'two-beat rest';
        flag(
          first,
          `Beats ${h + 1} and ${h + 2} are completely silent, so write them as one ${two} instead of two ${one}s.`,
        );
      }
    }
  }

  return result();
}
