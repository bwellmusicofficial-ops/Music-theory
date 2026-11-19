import { QuestionTypes2Harness } from './harness';

/**
 * Test harness (dev routes only): the stave support for the four new question types
 * (docs/question-types-2.md section 1): written beams, gap toggles, key-signature edit.
 * /dev/question-types-2
 */
export default function DevQuestionTypes2Page() {
  return (
    <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
      <QuestionTypes2Harness />
    </main>
  );
}
