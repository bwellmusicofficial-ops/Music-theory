import { z } from 'zod';
import { expression } from '@/engine/expression';
import { wordKind } from '@/engine/expression/words';
import { rhythm } from '@/engine/rhythm';
import { pitch } from '@/engine/pitch';
import type { Bar, Passage, ScoreEvent } from '@/engine/types';
import { barSchema, expressionSchema, timeSchema } from '@/lesson/questions/face-view/face-schema';
import type { TapRhythmPayload } from './types';

const spell = (event: ScoreEvent & { kind: 'note' }) =>
  event.pitches.map((p) => pitch.formatPitch(p)).sort().join('|');

/** docs/question-payloads.md 2.6 "Validation" and the passage rules in 1.3. */
export const payloadSchema: z.ZodType<TapRhythmPayload> = z
  .strictObject({
    time: timeSchema,
    bars: z.array(barSchema).min(1).max(4),
    bpm: z.number().int().min(50).max(120),
    countInBars: z.union([z.literal(1), z.literal(2)]).default(1),
    showNotation: z.boolean(),
    listenFirst: z.boolean(),
    toleranceMs: z.number().min(60).max(250).default(150),
    /** Only so that tempo changes can be refused with a reason; the pad ignores the rest of it. */
    expression: expressionSchema.optional(),
  })
  .superRefine((payload, ctx) => {
    try {
      rhythm.beatLength(payload.time);
    } catch {
      ctx.addIssue({ code: 'custom', path: ['time'], message: 'This time signature has no felt beat the pad can click' });
    }
    // Expression the tap scorer does not understand (docs/expression.md section 3): it expects every
    // note at its written time at one steady tempo, once through the bars in order.
    const SCORER = 'the tap scorer expects every note at its written time at one steady tempo';
    payload.bars.forEach((bar, index) => {
      const signs = (['repeatStart', 'endBarline', 'marker'] as const).filter((key) => bar[key] !== undefined);
      if (signs.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['bars', index, signs[0]],
          message: `Repeat signs and markers (${signs.join(', ')}) are not supported in tap-rhythm: ${SCORER} and plays the bars once, in order`,
        });
      }
      bar.events.forEach((event, eventIndex) => {
        if (event.fermata) {
          ctx.addIssue({
            code: 'custom',
            path: ['bars', index, 'events', eventIndex, 'fermata'],
            message: `Fermatas are not supported in tap-rhythm: ${SCORER}, and a pause would hold the music back`,
          });
        }
      });
    });
    if (payload.expression?.tempoChanges?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['expression', 'tempoChanges'],
        message: `Tempo changes are not supported in tap-rhythm: ${SCORER}`,
      });
    }
    (payload.expression?.words ?? []).forEach((word, index) => {
      if (['rit', 'rall', 'accel'].includes(wordKind(word.text) ?? '')) {
        ctx.addIssue({
          code: 'custom',
          path: ['expression', 'words', index],
          message: `The words "${word.text}" change the tempo, which is not supported in tap-rhythm: ${SCORER}`,
        });
      }
    });
    if (payload.expression) {
      const asPassage = {
        clef: 'treble',
        key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
        time: payload.time,
        bars: payload.bars,
        expression: payload.expression,
      } as Passage;
      for (const message of expression.validateExpression(asPassage)) {
        ctx.addIssue({ code: 'custom', path: ['expression'], message });
      }
    }
    payload.bars.forEach((bar, index) => {
      // No tuplets in Phase 0 (2.6).
      bar.events.forEach((event, eventIndex) => {
        if (event.duration.tuplet) {
          ctx.addIssue({
            code: 'custom',
            path: ['bars', index, 'events', eventIndex, 'duration', 'tuplet'],
            message: 'Tuplets are not supported in tap-rhythm',
          });
        }
      });
      const check = rhythm.checkBarLength(bar as Bar, payload.time);
      if (check.status !== 'complete') {
        ctx.addIssue({
          code: 'custom',
          path: ['bars', index],
          message: `Bar ${index + 1} is ${check.status}: every bar must be exactly full`,
        });
      }
    });
    const events = payload.bars.flatMap((bar) => bar.events);
    if (!events.some((event) => event.kind === 'note')) {
      ctx.addIssue({ code: 'custom', path: ['bars'], message: 'The rhythm needs at least one note to tap' });
    }
    events.forEach((event, index) => {
      if (event.kind !== 'note' || !event.tieToNext) return;
      const next = events[index + 1];
      if (!next || next.kind !== 'note' || spell(next as ScoreEvent & { kind: 'note' }) !== spell(event as ScoreEvent & { kind: 'note' })) {
        ctx.addIssue({
          code: 'custom',
          path: ['bars'],
          message: `Tied note ${index + 1} must be followed by a note with the same pitches`,
        });
      }
    });
    if (!payload.showNotation && !payload.listenFirst) {
      ctx.addIssue({
        code: 'custom',
        path: ['showNotation'],
        message: 'At least one of `showNotation` and `listenFirst` must be true',
      });
    }
  });
