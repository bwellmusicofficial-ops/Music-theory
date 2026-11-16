'use client';

import { useMemo } from 'react';
import type { Terminology } from '@/engine/types';
import type { QuestionTypeRegistry } from '@/lesson/contracts';
import { QuestionBoundary, RichTextView, makeGlossaryLookup, type GlossarySource } from '@/lesson/player';
import type { PaperQuestion, QuestionResult } from '../engine';

export interface QuestionPanelsProps {
  questions: readonly PaperQuestion[];
  /** Index of the question to show, or null to show none. */
  visible: number | null;
  /** 'test': editable, no marks. 'review': locked, marked with the results. */
  mode: 'test' | 'review';
  answers: readonly unknown[];
  /** Required in review mode. */
  results?: readonly QuestionResult[];
  questionTypes: QuestionTypeRegistry;
  terminology: Terminology;
  glossary: GlossarySource;
  /** The question's answer changed to a complete answer. */
  onAnswer: (index: number, answer: unknown) => void;
  /** The question's answer became incomplete or was cleared. */
  onClear: (index: number) => void;
  onSkip: (index: number) => void;
}

/**
 * Shows the one question on screen. Only that question is mounted: the
 * components restore the learner's answer from `initialAnswer` when it comes
 * back, and report every change through `onAnswerChange`, so nothing is held
 * in a hidden component. In review the same component is shown locked and
 * marked, with the learner's answer in it.
 */
export function QuestionPanels(props: QuestionPanelsProps) {
  const { questions, visible, mode } = props;
  const question = visible === null ? undefined : questions[visible];
  return (
    <div className="mock-question flex flex-1 flex-col" data-testid="question-panels">
      {question ? (
        <div key={`${mode}:${question.index}`} data-question-index={question.index} data-mode={mode}>
          <QuestionPanel {...props} question={question} />
        </div>
      ) : null}
    </div>
  );
}

function QuestionPanel({
  question,
  mode,
  answers,
  results,
  questionTypes,
  terminology,
  glossary,
  onAnswer,
  onClear,
  onSkip,
}: QuestionPanelsProps & { question: PaperQuestion }) {
  const mod = questionTypes[question.type];
  const lookup = useMemo(() => makeGlossaryLookup(glossary), [glossary]);
  const answer = answers[question.index];
  const review = mode === 'review';
  const mark = review ? (results?.[question.index]?.mark ?? null) : null;

  if (!mod) return null;
  const Comp = mod.Component;

  return (
    <article aria-label={`Question ${question.index + 1}`} className="flex flex-col gap-5">
      <h2 className="text-xl font-bold leading-snug sm:text-2xl">
        <RichTextView text={question.prompt} terminology={terminology} glossary={lookup} />
      </h2>
      <div>
        <QuestionBoundary questionId={question.id} onSkip={() => onSkip(question.index)}>
          <Comp
            payload={question.payload}
            terminology={terminology}
            locked={review}
            result={mark}
            initialAnswer={answer}
            hideCheck
            onAnswer={(a: unknown) => onAnswer(question.index, a)}
            onAnswerChange={(a: unknown) => (a === null ? onClear(question.index) : onAnswer(question.index, a))}
          />
        </QuestionBoundary>
      </div>
      {review ? null : (
        <p className="text-sm text-fg-secondary" data-testid="answer-status">
          {answer === undefined ? 'Not answered yet. ' : 'Answer saved. '}
          Your answer is saved as you go. You can change it until you finish the test.
        </p>
      )}
    </article>
  );
}
