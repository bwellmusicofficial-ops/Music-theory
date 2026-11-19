import type { QuestionTypeModule } from '@/lesson/contracts';
import { FixBeaming } from './component';
import { mark } from './mark';
import { payloadSchema } from './schema';
import type { FixBeamingAnswer, FixBeamingPayload } from './types';

export type { FixBeamingAnswer, FixBeamingPayload } from './types';

export const fixBeaming: QuestionTypeModule<FixBeamingPayload, FixBeamingAnswer> = {
  type: 'fix-beaming',
  payloadSchema,
  Component: FixBeaming,
  mark,
};
