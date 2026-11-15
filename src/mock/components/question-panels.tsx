'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Terminology } from '@/engine/types';
import type { QuestionTypeRegistry } from '@/lesson/contracts';
import { RichTextView, makeGlossaryLookup, type GlossarySource } from '@/lesson/player';
import { QuestionBoundary } from '@/lesson/player/question-boundary';
import type { PaperQuestion, QuestionResult } from '../engine';
import { SELECTION_CSS, markSelection } from './selection-marker';

/** Question types whose own button commits the answer. */
const HAS_CHECK_BUTTON = new Set(['match-up', 'ordering', 'complete-bar', 'spot-mistake', 'play-keyboard']);

export interface QuestionPanelsProps {
  questions: readonly PaperQuestion[];
  /** Index of the question to show, or null to show none (the others stay mounted, hidden). */
  visible: number | null;
  /** 'test': editable, no marks. 'review': locked, marked with the results. */
  mode: 'test' | 'review';
  answers: readonly unknown[];
  /** Required in review mode. */
  results?: readonly QuestionResult[];
  questionTypes: QuestionTypeRegistry;
  terminology: Terminology;
  glossary: GlossarySource;
  onAnswer: (index: number, answer: unknown) => void;
  onSkip: (index: number) => void;
}

/**
 * Every question the learner has opened stays mounted, and only the one on
 * screen is visible. That is what keeps an answer that is still editable
 * (the components keep their own state) when the learner moves between
 * questions, and lets the review show the same components, now locked and
 * marked, with the learner's answer still in them.
 */
export function QuestionPanels(props: QuestionPanelsProps) {
  const { questions, visible, mode } = props;
  const [opened, setOpened] = useState<ReadonlySet<number>>(() => new Set());
  if (visible !== null && !opened.has(visible)) {
    setOpened(new Set(opened).add(visible));
  }

  return (
    <div className="mock-question flex flex-1 flex-col" data-testid="question-panels">
      <style>{SELECTION_CSS}</style>
      {questions.map((q) =>
        opened.has(q.index) || q.index === visible ? (
          <div key={q.index} hidden={q.index !== visible} data-question-index={q.index} data-mode={mode}>
            <QuestionPanel {...props} question={q} />
          </div>
        ) : null,
      )}
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
  onSkip,
}: QuestionPanelsProps & { question: PaperQuestion }) {
  const mod = questionTypes[question.type];
  const lookup = useMemo(() => makeGlossaryLookup(glossary), [glossary]);
  const rootRef = useRef<HTMLDivElement>(null);
  const answer = answers[question.index];
  const review = mode === 'review';
  const mark = review ? (results?.[question.index]?.mark ?? null) : null;

  useLayoutEffect(() => {
    if (rootRef.current) {
      markSelection(rootRef.current, question.type, question.payload, review ? undefined : answer);
    }
  });

  if (!mod) return null;
  const Comp = mod.Component;
  const hint = HAS_CHECK_BUTTON.has(question.type)
    ? 'Press Check to save your answer. You can change it until you finish the test.'
    : 'Tap your answer. You can change it until you finish the test.';

  return (
    <article aria-label={`Question ${question.index + 1}`} className="flex flex-col gap-5">
      <h2 className="text-xl font-bold leading-snug sm:text-2xl">
        <RichTextView text={question.prompt} terminology={terminology} glossary={lookup} />
      </h2>
      <div ref={rootRef}>
        <QuestionBoundary questionId={question.id} onSkip={() => onSkip(question.index)}>
          <Comp
            payload={question.payload}
            terminology={terminology}
            locked={review}
            result={mark}
            onAnswer={(a: unknown) => onAnswer(question.index, a)}
          />
        </QuestionBoundary>
      </div>
      {review ? null : (
        <p className="text-sm text-fg-secondary" data-testid="answer-status">
          {answer === undefined ? 'Not answered yet. ' : 'Answer saved. '}
          {hint}
        </p>
      )}
    </article>
  );
}
