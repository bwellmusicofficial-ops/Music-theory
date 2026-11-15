import type { QuestionTypeModule } from '@/lesson/contracts';
import { TapRhythm } from './component';
import { mark } from './mark';
import { payloadSchema } from './schema';
import type { TapRhythmAnswer, TapRhythmPayload } from './types';

export type { TapRhythmAnswer, TapRhythmPayload } from './types';
export { setTapRhythmNotationRenderer, type TapRhythmNotationLive } from './component';

export const tapRhythm: QuestionTypeModule<TapRhythmPayload, TapRhythmAnswer> = {
  type: 'tap-rhythm',
  payloadSchema,
  Component: TapRhythm,
  mark,
};
