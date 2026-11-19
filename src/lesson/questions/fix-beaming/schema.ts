import { z } from 'zod';
import { rhythm } from '@/engine/rhythm';
import { passageShapeSchema, addBarLengthIssues } from '@/lesson/questions/notation/schemas';
import { isAcceptableJoins, isBeamable, joinsOf } from './beams';
import type { FixBeamingPayload } from './types';

/** docs/question-payloads.md 2.11 */
export const payloadSchema: z.ZodType<FixBeamingPayload> = z
  .strictObject({ passage: passageShapeSchema, barIndex: z.number().int().min(0) })
  .superRefine(({ passage, barIndex }, ctx) => {
    addBarLengthIssues(passage, ctx, ['passage'], null);
    const bar = passage.bars[barIndex];
    if (!bar) {
      ctx.addIssue({ code: 'custom', path: ['barIndex'], message: '`barIndex` must point at a bar of the passage' });
      return;
    }
    passage.bars.forEach((other, i) => {
      if (i !== barIndex && other.beams !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['passage', 'bars', i, 'beams'], message: `Bar ${i + 1}: only the bar at \`barIndex\` may have written beams` });
      }
    });
    if (!bar.beams) {
      ctx.addIssue({ code: 'custom', path: ['passage', 'bars', barIndex, 'beams'], message: 'The bar at `barIndex` must have written `beams`' });
      return;
    }
    const beamable = bar.events.filter(isBeamable).length;
    if (beamable < 4) {
      ctx.addIssue({ code: 'custom', path: ['passage', 'bars', barIndex], message: `The bar needs at least four notes of quaver value or shorter that can be beamed, not ${beamable}` });
    }
    if (rhythm.checkBarLength(bar, passage.time).status === 'complete' && isAcceptableJoins(bar, passage.time, joinsOf(bar, bar.beams))) {
      ctx.addIssue({ code: 'custom', path: ['passage', 'bars', barIndex, 'beams'], message: 'The written beams are the standard beaming: there is nothing to fix' });
    }
  });
