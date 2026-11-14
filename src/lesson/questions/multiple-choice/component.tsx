'use client';

import { useState } from 'react';
import { cn } from '@/components/ui/cn';
import type { QuestionProps } from '@/lesson/contracts';
import { FaceView, ResultMark } from '@/lesson/questions/face-view';
import type { MultipleChoiceAnswer, MultipleChoicePayload } from './types';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

/** Large option buttons. Choosing one commits the answer at once. Options keep their array order. */
export function MultipleChoice({
  payload,
  locked,
  result,
  onAnswer,
}: QuestionProps<MultipleChoicePayload, MultipleChoiceAnswer>) {
  const [chosen, setChosen] = useState<string | null>(null);

  function choose(optionId: string) {
    if (locked) return;
    setChosen(optionId);
    onAnswer({ optionId });
  }

  return (
    <ul className="flex flex-col gap-3" aria-label="Answer options">
      {payload.options.map((option, index) => {
        const isCorrect = option.id === payload.correct;
        const isChosen = chosen === option.id;
        const state = result === null ? 'idle' : isCorrect ? 'right' : isChosen ? 'wrong' : 'other';
        return (
          <li key={option.id}>
            <button
              type="button"
              disabled={locked}
              data-state={state}
              onClick={() => choose(option.id)}
              className={cn(
                'flex min-h-14 w-full items-center gap-4 rounded-lg border-2 bg-surface px-4 py-3 text-left text-fg',
                'transition-[border-color,opacity] duration-(--motion-duration-fast) ease-standard',
                'enabled:cursor-pointer enabled:hover:border-accent',
                'disabled:cursor-default',
                state === 'idle' && 'border-border',
                state === 'right' && 'border-success',
                state === 'wrong' && 'border-danger',
                state === 'other' && 'border-border-subtle opacity-60',
              )}
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-md border-2 border-border text-sm font-bold text-fg-secondary"
              >
                {LETTERS[index]}
              </span>
              <span className="flex min-w-0 flex-1 items-center text-lg font-semibold">
                <FaceView face={option.face} />
              </span>
              {state === 'right' ? <ResultMark tone="right">Correct answer</ResultMark> : null}
              {state === 'wrong' ? <ResultMark tone="wrong">Your answer</ResultMark> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
