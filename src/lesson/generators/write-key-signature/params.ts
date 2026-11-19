import { z } from 'zod';
import { pitch } from '@/engine/pitch';
import type { Clef, Key } from '@/engine/types';
import { keySchema } from '@/lesson/questions/face-view/face-schema';
import { clefChoiceSchema } from '../shared/params';

const major = (letter: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B', accidental: -1 | 0 | 1 = 0): Key => ({
  tonic: { letter, accidental },
  mode: 'major',
});

/** The Grade 1 keys with a key signature: G, D and F major. */
export const GRADE_1_KEYS: Key[] = [major('G'), major('D'), major('F')];

/** docs/generators-grade-1.md 3.23 */
export interface WriteKeySignatureParams {
  keys?: Key[];
  clefs?: Clef[];
  placement?: 'standard' | 'any-octave';
}

export const paramsSchema: z.ZodType<WriteKeySignatureParams> = z
  .strictObject({
    keys: z.array(keySchema).min(1).max(28).default(GRADE_1_KEYS),
    clefs: z.array(clefChoiceSchema).min(1).max(2).default(['treble', 'bass']),
    placement: z.enum(['standard', 'any-octave']).optional(),
  })
  .superRefine((p, ctx) => {
    const names = new Set<string>();
    p.keys.forEach((key, i) => {
      let signature = 0;
      try {
        signature = pitch.keySignature(key);
      } catch {
        /* reported below */
      }
      if (signature === 0 || Math.abs(signature) > 7) {
        ctx.addIssue({ code: 'custom', path: ['keys', i], message: 'Every key needs 1 to 7 sharps or flats (not C major or A minor)' });
      } else {
        const name = pitch.keyName(key);
        if (names.has(name)) ctx.addIssue({ code: 'custom', path: ['keys', i], message: `${name} is listed twice` });
        names.add(name);
      }
    });
    if (new Set(p.clefs).size !== p.clefs.length) ctx.addIssue({ code: 'custom', path: ['clefs'], message: 'List each clef once' });
  });
