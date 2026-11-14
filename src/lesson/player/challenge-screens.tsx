'use client';

import { Badge, Button } from '@/components/ui';
import { ActionBar } from './action-bar';
import type { ChallengeResult } from './machine';
import { ScreenHeading } from './screen-heading';

/** How many correct answers pass a round. */
export function neededToPass(count: number, passMark: number): number {
  return Math.ceil(count * passMark - 1e-9);
}

export function ChallengeIntro({
  count,
  seconds,
  passMark,
  timed,
  onStart,
}: {
  count: number;
  seconds: number;
  passMark: number;
  timed: boolean;
  onStart: () => void;
}) {
  return (
    <>
      <div className="flex flex-1 flex-col gap-6">
        <ScreenHeading eyebrow="Challenge">Ready for the challenge?</ScreenHeading>
        <ul className="flex flex-col gap-3 text-lg" data-testid="challenge-rules">
          <li>
            <strong>{count}</strong> questions
          </li>
          <li>{timed ? <><strong>{seconds}</strong> seconds on the clock</> : <>No clock: take your time</>}</li>
          <li>
            Get <strong>{neededToPass(count, passMark)}</strong> right to complete the lesson
          </li>
          <li>No hints this time</li>
        </ul>
      </div>
      <ActionBar>
        <Button size="lg" onClick={onStart}>
          Start
        </Button>
      </ActionBar>
    </>
  );
}

export function ChallengeResultScreen({
  result,
  passMark,
  alreadyComplete,
  onRetry,
  onContinue,
}: {
  result: ChallengeResult;
  passMark: number;
  alreadyComplete: boolean;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const need = neededToPass(result.total, passMark);
  return (
    <>
      <div className="flex flex-1 flex-col gap-6">
        <ScreenHeading eyebrow="Challenge result">{result.passed ? 'Challenge passed' : 'Not this time'}</ScreenHeading>
        <div className="flex flex-col items-start gap-3">
          <p className="text-5xl font-extrabold tabular-nums" data-testid="score">
            {result.correct} / {result.total}
          </p>
          <Badge tone={result.passed ? 'success' : 'warning'} data-testid="verdict">
            {result.passed ? 'Passed' : 'Not passed'}
          </Badge>
          <p className="text-lg text-fg-secondary">
            {result.passed
              ? 'Lesson complete.'
              : alreadyComplete
                ? `You needed ${need} right. This lesson stays complete from your earlier pass.`
                : `You needed ${need} right to complete the lesson.`}
          </p>
          {result.timedOut ? <p className="text-fg-secondary">Time ran out. Unanswered questions count as wrong.</p> : null}
        </div>
      </div>
      <ActionBar>
        <Button variant={result.passed ? 'secondary' : 'primary'} size="lg" onClick={onRetry}>
          Try again
        </Button>
        <Button variant={result.passed ? 'primary' : 'secondary'} size="lg" onClick={onContinue}>
          Continue
        </Button>
      </ActionBar>
    </>
  );
}
