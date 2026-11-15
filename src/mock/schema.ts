/**
 * Mock test config schema. A mock test is a JSON file in `content/mocks/`:
 * later grades need a new file and no code.
 *
 *   config -> sections -> items -> questions
 *
 * An item is either `generated` (a generator id, its params and how many
 * questions to draw from it) or `authored` (a small bank of complete
 * questions, in the same shape as an authored lesson question, of which
 * `draw` are picked at random for each paper).
 */

import { z } from 'zod';
import { authoredQuestionSchema, gradeSchema, richTextSchema, skillIdSchema, strandSchema } from '@/lesson/schema';

/** kebab-case ids, as in lesson files. */
const idSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const DEFAULT_PASS_MARK = 0.66;
export const DEFAULT_MERIT_MARK = 0.8;
export const DEFAULT_DISTINCTION_MARK = 0.9;

export const generatedItemSchema = z.strictObject({
  kind: z.literal('generated'),
  id: idSchema,
  generator: z.strictObject({
    /** Registered generator id, e.g. "choose-note-value". */
    id: idSchema,
    params: z.record(z.string(), z.unknown()).default({}),
  }),
  /** The single skill every question drawn from this item gives evidence for. */
  skill: skillIdSchema,
  /** Shown when the generator gives no prompt of its own (some, like name-note-on-stave identify, do not). */
  prompt: richTextSchema.optional(),
  /** How many questions to draw from the generator (each with its own seed). */
  count: z.number().int().min(1).max(10).default(1),
});

export const authoredItemSchema = z
  .strictObject({
    kind: z.literal('authored'),
    id: idSchema,
    /** Complete questions; each carries its own skill. */
    bank: z.array(authoredQuestionSchema).min(1),
    /** How many to pick at random from the bank. Default: all of them. */
    draw: z.number().int().min(1).optional(),
  })
  .superRefine((item, ctx) => {
    const ids = item.bank.map((q) => q.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['bank'], message: 'Question ids in a bank must be unique' });
    }
    if (item.draw !== undefined && item.draw > item.bank.length) {
      ctx.addIssue({ code: 'custom', path: ['draw'], message: '`draw` cannot exceed the number of questions in the bank' });
    }
  });

export const mockItemSchema = z.discriminatedUnion('kind', [generatedItemSchema, authoredItemSchema]);

export const mockSectionSchema = z
  .strictObject({
    id: idSchema,
    title: z.string().min(1).max(60),
    strand: strandSchema,
    items: z.array(mockItemSchema).min(1),
  })
  .superRefine((section, ctx) => {
    const ids = section.items.map((i) => i.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Item ids in a section must be unique' });
    }
  });

export const mockConfigSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: idSchema,
    grade: gradeSchema,
    title: z.string().min(1).max(60),
    /** One or two sentences for the intro screen and the list. */
    summary: z.string().min(1).max(200),
    /** Time allowed, in minutes. */
    minutes: z.number().int().min(1).max(240),
    /** Fraction of the marks needed to pass. */
    passMark: z.number().min(0).max(1).default(DEFAULT_PASS_MARK),
    meritMark: z.number().min(0).max(1).default(DEFAULT_MERIT_MARK),
    distinctionMark: z.number().min(0).max(1).default(DEFAULT_DISTINCTION_MARK),
    sections: z.array(mockSectionSchema).min(1),
  })
  .superRefine((config, ctx) => {
    if (!(config.passMark <= config.meritMark && config.meritMark <= config.distinctionMark)) {
      ctx.addIssue({
        code: 'custom',
        path: ['passMark'],
        message: 'Marks must satisfy passMark <= meritMark <= distinctionMark',
      });
    }
    const ids = config.sections.map((s) => s.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['sections'], message: 'Section ids must be unique' });
    }
  });

export type MockConfig = z.infer<typeof mockConfigSchema>;
export type MockSection = z.infer<typeof mockSectionSchema>;
export type MockItem = z.infer<typeof mockItemSchema>;
export type GeneratedMockItem = z.infer<typeof generatedItemSchema>;
export type AuthoredMockItem = z.infer<typeof authoredItemSchema>;

/** Number of questions an item adds to a paper. */
export function itemQuestionCount(item: MockItem): number {
  return item.kind === 'generated' ? item.count : (item.draw ?? item.bank.length);
}

/** Number of questions in a paper built from this config. */
export function configQuestionCount(config: MockConfig): number {
  return config.sections.reduce((n, s) => n + s.items.reduce((m, i) => m + itemQuestionCount(i), 0), 0);
}
