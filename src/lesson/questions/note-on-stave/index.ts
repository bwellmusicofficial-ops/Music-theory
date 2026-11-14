import type { QuestionTypeModule } from '@/lesson/contracts';
import { NoteOnStave } from './component';
import { mark } from './mark';
import { payloadSchema } from './schema';
import type { NoteOnStaveAnswer, NoteOnStavePayload } from './types';

export type {
  NoteOnStaveAnswer,
  NoteOnStaveIdentify,
  NoteOnStavePayload,
  NoteOnStavePlace,
} from './types';

export const noteOnStave: QuestionTypeModule<NoteOnStavePayload, NoteOnStaveAnswer> = {
  type: 'note-on-stave',
  payloadSchema,
  Component: NoteOnStave,
  mark,
};
