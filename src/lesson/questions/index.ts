import type { QuestionTypeRegistry } from '@/lesson/contracts';
import { byEar } from './by-ear';
import { completeBar } from './complete-bar';
import { matchUp } from './match-up';
import { multipleChoice } from './multiple-choice';
import { noteOnStave } from './note-on-stave';
import { ordering } from './ordering';
import { playKeyboard } from './play-keyboard';
import { spotMistake } from './spot-mistake';
import { tapRhythm } from './tap-rhythm';

/** Every question type the lesson player can render. */
export const questionTypes: QuestionTypeRegistry = {
  'note-on-stave': noteOnStave,
  'play-keyboard': playKeyboard,
  'tap-rhythm': tapRhythm,
  'by-ear': byEar,
  'complete-bar': completeBar,
  'spot-mistake': spotMistake,
  ordering,
  'multiple-choice': multipleChoice,
  'match-up': matchUp,
};
