import type { Duration, Rng, Terminology } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import { dur, lengthOf, plain } from '../shared/bars';
import { beatsText } from '../shared/beats-text';
import { glyphLink } from '../shared/terms';
import { paramsSchema, type MatchNoteValuesParams } from './params';

const idOf = (kind: 'note' | 'rest', d: Duration): string =>
  `${d.value}${d.dots === 1 ? '-dotted' : d.dots === 2 ? '-double-dotted' : ''}${kind === 'rest' ? '-rest' : ''}`;

/**
 * docs/generators-grade-1.md 3.2. Rng calls: (1) shuffle(values) is the left order;
 * (2) shuffle(rights), repeated up to 10 times until at least two differ from the
 * matching order, then a deterministic rotation by one place.
 */
export function generate(params: MatchNoteValuesParams, rng: Rng, t: Terminology): GeneratedQuestion {
  const kind = params.kind ?? 'note';
  const values = params.values ?? [dur('crotchet'), dur('minim'), dur('semibreve')];
  const match = params.match ?? 'beats';

  const lefts = rng.shuffle(values);
  const rights = lefts.map((d) => ({
    id: `r-${idOf(kind, d)}`,
    face: {
      kind: 'text' as const,
      text: match === 'beats' ? beatsText(lengthOf(d)) : glyphLink(kind, d, t),
    },
  }));
  const differs = (order: typeof rights) => order.filter((r, i) => r.id !== rights[i]!.id).length >= 2;
  let right = rng.shuffle(rights);
  for (let attempt = 1; attempt < 10 && !differs(right); attempt += 1) right = rng.shuffle(rights);
  if (!differs(right)) right = [...right.slice(1), right[0]!];

  return {
    type: 'match-up',
    prompt: match === 'beats' ? 'Match each symbol with how long it lasts.' : 'Match each symbol with its name.',
    payload: {
      left: lefts.map((d) => ({
        id: idOf(kind, d),
        face: { kind: 'glyph' as const, glyph: { kind, duration: plain(d) } },
        match: `r-${idOf(kind, d)}`,
        reason:
          match === 'beats'
            ? `The ${glyphLink(kind, d, t)} lasts ${beatsText(lengthOf(d))}, so it belongs with ${beatsText(lengthOf(d))}.`
            : `This symbol lasts ${beatsText(lengthOf(d))}, so it is the ${glyphLink(kind, d, t)}.`,
      })),
      right,
    },
  };
}

export const matchNoteValues: QuestionGenerator<MatchNoteValuesParams> = {
  id: 'match-note-values',
  paramsSchema,
  generate: (params, rng, t) => generate(params, rng, t),
};
