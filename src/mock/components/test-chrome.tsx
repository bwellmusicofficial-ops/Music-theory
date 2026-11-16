'use client';

import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import { answeredCount, type Paper, type TestState } from '../engine';
import { plural } from '../format';
import { Countdown } from './countdown';
import { QuestionNavigator } from './question-navigator';

export interface TestChromeProps {
  paper: Paper;
  state: TestState;
  onGoTo: (index: number) => void;
  onFlag: (index: number) => void;
  onFinish: () => void;
}

/** Everything above the question: where you are, the clock, the question list and Finish. */
export function TestHeader({ paper, state, onGoTo, onFinish }: Omit<TestChromeProps, 'onFlag'>) {
  const [showList, setShowList] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const n = paper.questions.length;
  const q = paper.questions[state.current];
  const section = paper.sections.find((s) => s.id === q?.sectionId);
  const answered = answeredCount(state);
  const unanswered = n - answered;
  const flagged = state.flagged.filter(Boolean).length;

  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-border-subtle bg-bg px-4 pt-3 pb-3" data-testid="test-header">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold leading-tight" data-testid="position">
            Question {state.current + 1} of {n}
          </h1>
          <p className="truncate text-sm text-fg-secondary">{section?.title}</p>
        </div>
        <Countdown secondsLeft={state.secondsLeft} />
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          variant="secondary"
          size="md"
          className="flex-1"
          aria-expanded={showList}
          aria-controls="mock-question-list"
          onClick={() => setShowList((v) => !v)}
        >
          {showList ? 'Hide question list' : `Question list (${answered} of ${n} answered)`}
        </Button>
        <Button variant="primary" size="md" onClick={() => setConfirming(true)}>
          Finish test
        </Button>
      </div>

      <div id="mock-question-list" hidden={!showList} className={cn('mt-3 max-h-[45dvh] overflow-y-auto p-1')}>
        {showList ? (
          <QuestionNavigator
            count={n}
            current={state.current}
            answers={state.answers}
            flagged={state.flagged}
            onSelect={(i) => {
              onGoTo(i);
              setShowList(false);
            }}
          />
        ) : null}
      </div>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="Finish the test?">
        <div className="flex flex-col gap-4">
          <p className="text-lg" data-testid="finish-summary">
            {unanswered === 0 ? (
              <>You have answered all {n} questions.</>
            ) : (
              <>
                You have <strong>{plural(unanswered, 'unanswered question')}</strong>. Unanswered questions count as
                wrong.
              </>
            )}
          </p>
          {flagged > 0 ? <p className="text-fg-secondary">{plural(flagged, 'question')} flagged for review.</p> : null}
          <p className="text-fg-secondary">You cannot change your answers after you finish.</p>
          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button
              size="lg"
              onClick={() => {
                setConfirming(false);
                onFinish();
              }}
            >
              Finish test
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setConfirming(false)}>
              Keep working
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Previous / Flag / Next, pinned to the bottom of the screen. */
export function TestFooter({ paper, state, onGoTo, onFlag }: Omit<TestChromeProps, 'onFinish'>) {
  const n = paper.questions.length;
  const i = state.current;
  const flagged = state.flagged[i] === true;
  return (
    <div
      className="sticky bottom-0 z-10 -mx-4 mt-6 flex gap-2 border-t border-border-subtle bg-bg px-4 pt-3 pb-4"
      data-testid="test-footer"
    >
      <Button variant="secondary" size="lg" className="min-w-0 flex-1 px-3!" disabled={i === 0} onClick={() => onGoTo(i - 1)}>
        Previous
      </Button>
      <Button
        variant={flagged ? 'primary' : 'secondary'}
        size="lg"
        className="px-3!"
        aria-label="Flag for review"
        aria-pressed={flagged}
        onClick={() => onFlag(i)}
      >
        <span aria-hidden="true">{'⚑'}</span>
        {flagged ? 'Flagged' : 'Flag'}
      </Button>
      <Button variant="secondary" size="lg" className="min-w-0 flex-1 px-3!" disabled={i === n - 1} onClick={() => onGoTo(i + 1)}>
        Next
      </Button>
    </div>
  );
}
