import type { QuestionTypeRegistry } from '@/lesson/contracts';
import { byEar } from './by-ear';
import { completeBar } from './complete-bar';
import { findInPassage } from './find-in-passage';
import { fixBeaming } from './fix-beaming';
import { matchUp } from './match-up';
import { multipleChoice } from './multiple-choice';
import { noteOnStave } from './note-on-stave';
import { ordering } from './ordering';
import { placeBarLines } from './place-bar-lines';
import { playKeyboard } from './play-keyboard';
import { spotMistake } from './spot-mistake';
import { tapRhythm } from './tap-rhythm';
import { writeKeySignature } from './write-key-signature';

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
  'place-bar-lines': placeBarLines,
  'fix-beaming': fixBeaming,
  'write-key-signature': writeKeySignature,
  'find-in-passage': findInPassage,
};
