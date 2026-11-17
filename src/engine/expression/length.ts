import type { SoundingDetail } from '../api';
import type { Passage } from '../types';
import { exprOf, layoutOf, resolve } from './util';

/** Staccato never sounds shorter than this many seconds (but never longer than the written length). */
export const STACCATO_MIN_SECONDS = 0.06;
/** A slurred note that is not the last of its slur sounds this much into the next note. */
export const SLUR_OVERLAP_SECONDS = 0.02;

export const PLAIN_FRACTION = 0.85;
export const STACCATO_FRACTION = 0.4;

/**
 * How each note sounds, `result[bar][event]`; null for rests and for tied
 * continuations (a continuation starts no sound of its own).
 *
 * Ties: the entry of the FIRST note of a tie describes the merged sound. Its
 * written length is the sum of the whole chain (use the sum of the chain's
 * `durationOf` values from the tempo map so fermatas and tempo changes count),
 * so `sounding seconds = fraction * chainSeconds`, then the staccato floor and
 * the slur overlap as flagged. The articulations of continuations are ignored
 * (validateExpression forbids them).
 *
 * Rules: no articulation (accent counts as one) and no slur anywhere gives
 * fraction 1 everywhere. Otherwise, per tie chain: covered by a slur and not
 * the chain holding that slur's last note: 1.0 with overlap (a slur beats the
 * note's own staccato or tenuto); else staccato 0.4, else tenuto 1.0, else
 * plain 0.85 (an accent alone changes loudness, not length; staccato beats
 * tenuto if both are written).
 */
export function soundingDetails(passage: Passage): (SoundingDetail | null)[][] {
  const layout = layoutOf(passage);
  const x = exprOf(passage);
  const spans: [number, number][] = [];
  for (const s of x.slurs) {
    const a = resolve(layout, s.from);
    const b = resolve(layout, s.to);
    if (a !== undefined && b !== undefined && b >= a) spans.push([a, b]);
  }
  const anyMarking =
    x.slurs.length > 0 || layout.flat.some((f) => f.ev.kind === 'note' && (f.ev.articulations ?? []).length > 0);

  const out: (SoundingDetail | null)[][] = passage.bars.map((bar) => bar.events.map(() => null));
  layout.flat.forEach((f, k) => {
    if (f.ev.kind !== 'note' || layout.continuation[k]) return;
    let detail: SoundingDetail = { fraction: 1, overlap: false, staccato: false };
    if (anyMarking) {
      const end = layout.tail[k]!;
      const arts = f.ev.articulations ?? [];
      const slurred = spans.some(([a, b]) => a <= end && b >= k && b > end);
      if (slurred) detail = { fraction: 1, overlap: true, staccato: false };
      else if (arts.includes('staccato')) detail = { fraction: STACCATO_FRACTION, overlap: false, staccato: true };
      else if (arts.includes('tenuto')) detail = { fraction: 1, overlap: false, staccato: false };
      else detail = { fraction: PLAIN_FRACTION, overlap: false, staccato: false };
    }
    out[f.bar]![f.event] = detail;
  });
  return out;
}

/** The `fraction` of `soundingDetails`: written-length fraction per note, null for rests and tied continuations. */
export function soundingLengths(passage: Passage): (number | null)[][] {
  return soundingDetails(passage).map((row) => row.map((d) => (d ? d.fraction : null)));
}
