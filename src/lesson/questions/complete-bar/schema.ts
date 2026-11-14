import { z } from 'zod';
import { rhythm } from '@/engine/rhythm';
import type { Fraction, Passage } from '@/engine/types';
import { glyphSchema } from '@/lesson/questions/face-view';
import { addBarLengthIssues, passageShapeSchema, pitchSchema } from '@/lesson/questions/notation/schemas';
import type { Glyph } from '@/lesson/questions/shared';
import { glyphLength, sameGlyph } from './glyphs';
import { MAX_ADDED, type CompleteBarPayload } from './types';

/**
 * Can some sequence of palette glyphs, at most `MAX_ADDED` long and exactly
 * `count` long when given, fill `gap` exactly?
 */
export function canFill(palette: readonly Glyph[], gap: Fraction, count: number | undefined): boolean {
  const lengths = palette.map(glyphLength);
  const seen = new Map<string, boolean>();
  const reach = (rem: Fraction, left: number): boolean => {
    if (rem.n === 0) return count === undefined ? true : left === 0;
    if (left === 0) return false;
    const key = `${rem.n}/${rem.d}|${left}`;
    const known = seen.get(key);
    if (known !== undefined) return known;
    const found = lengths.some((len) => {
      const next = rhythm.addFractions(rem, { n: -len.n, d: len.d });
      return next.n >= 0 && reach(next, left - 1);
    });
    seen.set(key, found);
    return found;
  };
  return reach(gap, count ?? MAX_ADDED);
}

const payloadObject = z.strictObject({
  passage: passageShapeSchema,
  barIndex: z.number().int().min(0),
  palette: z.array(glyphSchema).min(2).max(6),
  fillPitch: pitchSchema,
  count: z.number().int().min(1).max(8).optional(),
  checkGrouping: z.boolean().default(false),
});

/** docs/question-payloads.md 2.8 */
export const payloadSchema: z.ZodType<CompleteBarPayload> = payloadObject.superRefine((payload, ctx) => {
  const passage: Passage = payload.passage;
  const bar = passage.bars[payload.barIndex];
  if (!bar) {
    ctx.addIssue({ code: 'custom', path: ['barIndex'], message: '`barIndex` must point at a bar of the passage' });
    return;
  }
  addBarLengthIssues(passage, ctx, ['passage'], payload.barIndex);
  const check = rhythm.checkBarLength(bar, passage.time);
  if (check.status !== 'short') {
    ctx.addIssue({
      code: 'custom',
      path: ['passage', 'bars', payload.barIndex],
      message: `The bar at \`barIndex\` must be short, but it is ${check.status}`,
    });
  }

  const palette = payload.palette;
  const distinct = palette.every((g, i) => palette.findIndex((other) => sameGlyph(g, other)) === i);
  if (!distinct) ctx.addIssue({ code: 'custom', path: ['palette'], message: 'The palette symbols must all be different' });

  if (check.status === 'short' && !canFill(palette, check.difference, payload.count)) {
    ctx.addIssue({
      code: 'custom',
      path: ['palette'],
      message:
        payload.count === undefined
          ? `No sequence of at most ${MAX_ADDED} palette symbols fills the bar exactly`
          : `No sequence of exactly ${payload.count} palette symbols fills the bar exactly`,
    });
  }
});
