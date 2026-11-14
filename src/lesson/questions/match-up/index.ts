import type { QuestionTypeModule } from '@/lesson/contracts';
import { MatchUp } from './component';
import { mark } from './mark';
import { payloadSchema } from './schema';
import type { MatchUpAnswer, MatchUpPayload } from './types';

export type { MatchUpAnswer, MatchUpLeft, MatchUpPayload, MatchUpRight } from './types';

export const matchUp: QuestionTypeModule<MatchUpPayload, MatchUpAnswer> = {
  type: 'match-up',
  payloadSchema,
  Component: MatchUp,
  mark,
};
