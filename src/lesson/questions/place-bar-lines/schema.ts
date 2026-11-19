import { z } from 'zod';
import { pitch } from '@/engine/pitch';
import type { Letter, Passage } from '@/engine/types';
import { addBarLengthIssues, passageShapeSchema } from '@/lesson/questions/notation/schemas';
import type { PlaceBarLinesPayload } from './types';

/** docs/question-payloads.md 2.10 */
export const payloadSchema: z.ZodType<PlaceBarLinesPayload> = z
  .strictObject({ passage: passageShapeSchema })
  .superRefine((payload, ctx) => {
    const passage: Passage = payload.passage;
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path: ['passage', ...path], message });

    if (passage.bars.length < 2 || passage.bars.length > 4) issue(['bars'], 'The passage needs 2 to 4 bars');
    const total = passage.bars.reduce((sum, bar) => sum + bar.events.length, 0);
    if (total < 4 || total > 12) issue(['bars'], `The passage needs 4 to 12 notes and rests in all, not ${total}`);
    addBarLengthIssues(passage, ctx, ['passage'], null);

    if (passage.expression) issue(['expression'], 'Expression markings are not allowed: moving a bar line would move them');
    passage.bars.forEach((bar, b) => {
      if (bar.repeatStart || bar.endBarline === 'repeat-end') issue(['bars', b], `Bar ${b + 1}: repeat bar lines are not allowed`);
      if (bar.marker) issue(['bars', b, 'marker'], `Bar ${b + 1}: navigation signs are not allowed`);
      if (bar.beams) issue(['bars', b, 'beams'], `Bar ${b + 1}: written beams are not allowed (the question beams the notes itself)`);
    });

    // Moving a bar line must never change which accidentals are shown: every pitch is what the key signature gives.
    let given = new Map<Letter, number>();
    try {
      given = new Map(pitch.signatureAccidentals(pitch.keySignature(passage.key)).map((pc) => [pc.letter, pc.accidental]));
    } catch {
      issue(['key'], 'The key is not a key with a key signature of up to seven sharps or flats');
    }
    let number = 0;
    passage.bars.forEach((bar, b) =>
      bar.events.forEach((event, e) => {
        number += 1;
        if (event.kind === 'rest') return;
        if (event.tieToNext) issue(['bars', b, 'events', e], `Note ${number} is tied: ties are not allowed`);
        if (event.pitches.some((p) => p.accidental !== (given.get(p.letter) ?? 0))) {
          issue(['bars', b, 'events', e], `Note ${number} has an accidental that the key signature does not give`);
        }
      }),
    );
  });
