'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import type { QuestionProps } from '@/lesson/contracts';
import { FaceView, ResultMark } from '@/lesson/questions/face-view';
import type { MatchUpAnswer, MatchUpPayload } from './types';

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

/**
 * Tap a left item, then a right item, to pair them. Tapping a paired item (either side) unpairs it.
 * Every control is a button, so the same steps work with the keyboard.
 */
export function MatchUp({ payload, locked, result, onAnswer }: QuestionProps<MatchUpPayload, MatchUpAnswer>) {
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);

  const complete = payload.left.every((item) => Object.hasOwn(pairs, item.id));
  const rightLetter = (rightId: string) => LETTERS[payload.right.findIndex((item) => item.id === rightId)];
  const leftNumber = (leftId: string) => payload.left.findIndex((item) => item.id === leftId) + 1;
  const partnerOf = (rightId: string): string | undefined =>
    Object.keys(pairs).find((leftId) => pairs[leftId] === rightId);

  function unpair(leftId: string) {
    setPairs((current) => {
      const next = { ...current };
      delete next[leftId];
      return next;
    });
  }

  function tapLeft(leftId: string) {
    if (locked) return;
    if (Object.hasOwn(pairs, leftId)) {
      unpair(leftId);
      setActive(null);
      return;
    }
    setActive(active === leftId ? null : leftId);
  }

  function tapRight(rightId: string) {
    if (locked) return;
    const owner = partnerOf(rightId);
    if (active !== null) {
      setPairs((current) => {
        const next = { ...current };
        if (owner !== undefined) delete next[owner];
        next[active] = rightId;
        return next;
      });
      setActive(null);
      return;
    }
    if (owner !== undefined) unpair(owner);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <ul aria-label="Left items" className="flex flex-col gap-3">
          {payload.left.map((item, index) => {
            const paired = pairs[item.id];
            const isRight = result !== null && paired === item.match;
            const isWrong = result !== null && paired !== undefined && paired !== item.match;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={locked}
                  aria-pressed={active === item.id}
                  data-state={active === item.id ? 'selected' : 'idle'}
                  onClick={() => tapLeft(item.id)}
                  className={cn(
                    'flex min-h-14 w-full items-center gap-3 rounded-lg border-2 bg-surface px-4 py-3 text-left text-fg',
                    'transition-[border-color] duration-(--motion-duration-fast) ease-standard',
                    'enabled:cursor-pointer enabled:hover:border-accent',
                    'disabled:cursor-default',
                    active === item.id ? 'border-accent' : 'border-border',
                    isRight && 'border-success',
                    isWrong && 'border-danger',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-md border-2 border-border text-sm font-bold text-fg-secondary"
                  >
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-lg font-semibold">
                      <FaceView face={item.face} />
                    </span>
                    <span className="text-sm text-fg-secondary">
                      {paired !== undefined ? `Paired with ${rightLetter(paired)}` : 'Not paired'}
                      {isWrong ? `. Should be paired with ${rightLetter(item.match)}` : null}
                    </span>
                  </span>
                  {isRight ? <ResultMark tone="right">Right pair</ResultMark> : null}
                  {isWrong ? <ResultMark tone="wrong">Wrong pair</ResultMark> : null}
                </button>
              </li>
            );
          })}
        </ul>

        <ul aria-label="Right items" className="flex flex-col gap-3">
          {payload.right.map((item, index) => {
            const owner = partnerOf(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => tapRight(item.id)}
                  className={cn(
                    'flex min-h-14 w-full items-center gap-3 rounded-lg border-2 bg-surface px-4 py-3 text-left text-fg',
                    'transition-[border-color] duration-(--motion-duration-fast) ease-standard',
                    'enabled:cursor-pointer enabled:hover:border-accent',
                    'disabled:cursor-default',
                    owner !== undefined ? 'border-accent' : 'border-border',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-md border-2 border-border text-sm font-bold text-fg-secondary"
                  >
                    {LETTERS[index]}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-lg font-semibold">
                      <FaceView face={item.face} />
                    </span>
                    <span className="text-sm text-fg-secondary">
                      {owner !== undefined ? `Paired with ${leftNumber(owner)}` : 'Not paired'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <Button
          size="lg"
          className="w-full sm:w-auto"
          disabled={locked || !complete}
          onClick={() => onAnswer({ pairs })}
        >
          Check
        </Button>
      </div>
    </div>
  );
}
