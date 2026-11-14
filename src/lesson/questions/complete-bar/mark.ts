import { TheoryError } from '@/engine/api';
import { rhythm } from '@/engine/rhythm';
import type { Bar, Fraction } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { BAR, beats } from '@/lesson/questions/notation/reason-helpers';
import type { Glyph } from '@/lesson/questions/shared';
import { glyphToEvent } from './glyphs';
import { MAX_ADDED, type CompleteBarAnswer, type CompleteBarPayload } from './types';

const NOTE_VALUES: readonly string[] = rhythm.noteValues();

function checkGlyph(glyph: Glyph): void {
  const ok =
    glyph &&
    (glyph.kind === 'note' || glyph.kind === 'rest') &&
    glyph.duration &&
    NOTE_VALUES.includes(glyph.duration.value) &&
    [0, 1, 2].includes(glyph.duration.dots);
  if (!ok) throw new TheoryError(`complete-bar: ${JSON.stringify(glyph)} is not a note or rest symbol`);
}

const absDiff = (a: Fraction, b: Fraction): Fraction =>
  rhythm.compareFractions(a, b) >= 0
    ? rhythm.addFractions(a, { n: -b.n, d: b.d })
    : rhythm.addFractions(b, { n: -a.n, d: a.d });

/** docs/question-payloads.md 2.8. Throws `TheoryError` for an answer the component could never produce. */
export function mark(payload: CompleteBarPayload, answer: CompleteBarAnswer): MarkResult {
  const existing = payload.passage.bars[payload.barIndex];
  if (!existing) throw new TheoryError(`complete-bar: there is no bar ${payload.barIndex}`);
  if (!answer || !Array.isArray(answer.added)) throw new TheoryError('complete-bar: answer has no `added` list');
  if (answer.added.length > MAX_ADDED) {
    throw new TheoryError(`complete-bar: at most ${MAX_ADDED} symbols can be added, got ${answer.added.length}`);
  }
  answer.added.forEach(checkGlyph);

  const { time } = payload.passage;
  const bar: Bar = { events: [...existing.events, ...answer.added.map((g) => glyphToEvent(g, payload.fillPitch))] };
  const status = rhythm.checkBarLength(bar, time).status;
  const total = rhythm.eventsLength(bar.events);
  const full = rhythm.barLength(time);
  const n = answer.added.length;
  const fail = (reason: string): MarkResult => ({ correct: false, score: 0, reason });

  if (status === 'short') {
    return fail(
      `That ${BAR} now holds ${beats(total, time)}, but it needs ${beats(full, time)}. It is still ${beats(absDiff(full, total), time)} short.`,
    );
  }
  if (status === 'long') {
    return fail(
      `That ${BAR} now holds ${beats(total, time)}, but there is only room for ${beats(full, time)}. Take ${beats(absDiff(total, full), time)} away.`,
    );
  }
  const { count } = payload;
  if (count !== undefined && n !== count) {
    return n > count
      ? fail(
          `That fills the ${BAR}, but with ${n} symbols. The question asks for ${count}, so use ${count === 1 ? 'a longer one' : 'longer ones'}.`,
        )
      : fail(
          `That fills the ${BAR}, but with ${n} ${n === 1 ? 'symbol' : 'symbols'}. The question asks for ${count}, so use shorter ones.`,
        );
  }
  if (payload.checkGrouping === true) {
    const problem = rhythm.groupingProblems(bar, time)[0];
    if (problem) return fail(`The beats add up, but the ${BAR} is not written the standard way: ${problem.message}`);
  }
  return { correct: true, score: 1 };
}
