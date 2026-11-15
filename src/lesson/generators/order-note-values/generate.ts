import { rhythm } from '@/engine/rhythm';
import type { Duration, Rng, Terminology } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import { dur, lengthOf, plain } from '../shared/bars';
import { beatsText } from '../shared/beats-text';
import { glyphLink } from '../shared/terms';
import { paramsSchema, type OrderNoteValuesParams } from './params';

const idOf = (kind: 'note' | 'rest', d: Duration): string =>
  `${d.value}${d.dots === 1 ? '-dotted' : d.dots === 2 ? '-double-dotted' : ''}${kind === 'rest' ? '-rest' : ''}`;

/**
 * docs/generators-grade-1.md 3.3. Rng calls: (1) only for `either`: pick the direction;
 * (2) shuffle(values), the first `count` are shown; (3) shuffle(shown) is the starting
 * order, rotated by one place if it happens to be the answer.
 */
export function generate(params: OrderNoteValuesParams, rng: Rng, t: Terminology): GeneratedQuestion {
  const kind = params.kind ?? 'note';
  const values = params.values ?? [dur('crotchet'), dur('minim'), dur('semibreve')];
  const count = params.count ?? Math.min(values.length, 4);
  const direction =
    params.direction === 'either' ? rng.pick(['shortest-first', 'longest-first'] as const) : (params.direction ?? 'shortest-first');

  const shown = rng.shuffle(values).slice(0, count);
  const sorted = [...shown].sort((a, b) => rhythm.compareFractions(lengthOf(a), lengthOf(b)));
  const correct = direction === 'shortest-first' ? sorted : [...sorted].reverse();
  let start = rng.shuffle(shown);
  if (start.every((d, i) => d === correct[i])) start = [...start.slice(1), start[0]!];

  const rule = correct.map((d) => `${glyphLink(kind, d, t)} ${beatsText(lengthOf(d))}`).join(', ');
  return {
    type: 'ordering',
    prompt: `Put these in order, ${direction === 'shortest-first' ? 'shortest' : 'longest'} first.`,
    payload: {
      items: start.map((d) => ({
        id: idOf(kind, d),
        face: { kind: 'glyph' as const, glyph: { kind, duration: plain(d) } },
      })),
      correctOrder: correct.map((d) => idOf(kind, d)),
      ends:
        direction === 'shortest-first' ? { first: 'shortest', last: 'longest' } : { first: 'longest', last: 'shortest' },
      reason: `${direction === 'shortest-first' ? 'Shortest to longest' : 'Longest to shortest'}: ${rule}.`,
    },
  };
}

export const orderNoteValues: QuestionGenerator<OrderNoteValuesParams> = {
  id: 'order-note-values',
  paramsSchema,
  generate: (params, rng, t) => generate(params, rng, t),
};
