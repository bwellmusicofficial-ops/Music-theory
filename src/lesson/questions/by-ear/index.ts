import type { QuestionTypeModule } from '@/lesson/contracts';
import { ByEar } from './component';
import { mark } from './mark';
import { payloadSchema } from './schema';
import type { ByEarAnswer, ByEarPayload } from './types';

export type { ByEarAnswer, ByEarOption, ByEarPayload } from './types';
export { setByEarNotationRenderer } from './component';

export const byEar: QuestionTypeModule<ByEarPayload, ByEarAnswer> = {
  type: 'by-ear',
  payloadSchema,
  Component: ByEar,
  mark,
};
