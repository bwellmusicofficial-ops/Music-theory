'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS } from '@/components/ui/button-styles';
import { cn } from '@/components/ui/cn';
import type { QuestionProps } from '@/lesson/contracts';
import { FaceView, ResultMark, plainText } from '@/lesson/questions/face-view';
import type { OrderingAnswer, OrderingPayload } from './types';

type Direction = 'up' | 'down';

/**
 * A vertical list the learner reorders with "Move up" and "Move down" buttons.
 * Items keep their starting order until the learner moves them.
 */
export function Ordering({ payload, locked, result, onAnswer }: QuestionProps<OrderingPayload, OrderingAnswer>) {
  const [order, setOrder] = useState<string[]>(() => payload.items.map((item) => item.id));
  const pendingFocus = useRef<{ id: string; direction: Direction } | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  // Keep keyboard focus on the moved item after it changes position.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const other: Direction = pending.direction === 'up' ? 'down' : 'up';
    const same = buttons.current.get(`${pending.id}:${pending.direction}`);
    const fallback = buttons.current.get(`${pending.id}:${other}`);
    (same && !same.disabled ? same : fallback)?.focus();
  }, [order]);

  function move(id: string, direction: Direction) {
    if (locked) return;
    const from = order.indexOf(id);
    const to = direction === 'up' ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to] as string, next[from] as string];
    pendingFocus.current = { id, direction };
    setOrder(next);
  }

  const itemById = new Map(payload.items.map((item) => [item.id, item]));
  const isRightPlace = (id: string, index: number) => payload.correctOrder[index] === id;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted">{plainText(payload.ends.first)}</p>
      <ol aria-label="Items to put in order" className="flex flex-col gap-3">
        {order.map((id, index) => {
          const item = itemById.get(id);
          if (!item) return null;
          const inPlace = isRightPlace(id, index);
          const stateClass =
            result === null ? 'border-border' : inPlace ? 'border-success' : 'border-danger';
          return (
            <li
              key={id}
              data-state={result === null ? 'idle' : inPlace ? 'in-place' : 'out-of-place'}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-lg border-2 bg-surface p-3 text-fg',
                stateClass,
              )}
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-md border-2 border-border text-sm font-bold text-fg-secondary"
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 text-lg font-semibold">
                <FaceView face={item.face} />
              </span>
              {result !== null ? (
                inPlace ? (
                  <ResultMark tone="right">In the right place</ResultMark>
                ) : (
                  <ResultMark tone="wrong">Out of place</ResultMark>
                )
              ) : null}
              <div className="flex gap-2">
                {(['up', 'down'] as const).map((direction) => {
                  const disabled = locked || (direction === 'up' ? index === 0 : index === order.length - 1);
                  return (
                    <button
                      key={direction}
                      ref={(element) => {
                        const key = `${id}:${direction}`;
                        if (element) buttons.current.set(key, element);
                        else buttons.current.delete(key);
                      }}
                      type="button"
                      disabled={disabled}
                      onClick={() => move(id, direction)}
                      className={cn(
                        BUTTON_BASE,
                        BUTTON_VARIANTS.secondary,
                        BUTTON_SIZES.md,
                        'disabled:opacity-40',
                      )}
                    >
                      {direction === 'up' ? 'Move up' : 'Move down'}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-sm font-semibold uppercase tracking-wide text-muted">{plainText(payload.ends.last)}</p>
      <div>
        <Button size="lg" className="w-full sm:w-auto" disabled={locked} onClick={() => onAnswer({ order })}>
          Check
        </Button>
      </div>
    </div>
  );
}
