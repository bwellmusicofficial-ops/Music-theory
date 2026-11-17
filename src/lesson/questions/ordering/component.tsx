'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS } from '@/components/ui/button-styles';
import { cn } from '@/components/ui/cn';
import { rhythm } from '@/engine/rhythm';
import type { Terminology } from '@/engine/types';
import type { QuestionProps } from '@/lesson/contracts';
import { FaceView, ResultMark, plainText } from '@/lesson/questions/face-view';
import { useAnswerReporting } from '@/lesson/questions/use-answer-reporting';
import type { OrderingAnswer, OrderingPayload } from './types';

type Direction = 'up' | 'down';

function isPermutation(payload: OrderingPayload, order: readonly string[]): boolean {
  return (
    order.length === payload.items.length &&
    payload.items.every((item) => order.includes(item.id)) &&
    new Set(order).size === order.length
  );
}

/** A restored order if it holds every item once, otherwise the starting order. */
function restoreOrder(payload: OrderingPayload, answer: OrderingAnswer | undefined): string[] {
  return answer && isPermutation(payload, answer.order) ? [...answer.order] : payload.items.map((item) => item.id);
}
type Item = OrderingPayload['items'][number];

/** What a screen reader calls an item: its text, its note name, or its place in the starting order. */
function itemLabel(item: Item, startIndex: number, terminology: Terminology): string {
  switch (item.face.kind) {
    case 'text':
      return plainText(item.face.text);
    case 'glyph':
      return item.face.glyph.kind === 'rest'
        ? rhythm.restName(item.face.glyph.duration, terminology)
        : rhythm.noteValueName(item.face.glyph.duration, terminology);
    case 'passage':
      return `notation ${startIndex + 1}`;
  }
}

/**
 * A vertical list the learner reorders with "Move up" and "Move down" buttons.
 * Items keep their starting order until the learner moves them.
 */
export function Ordering({
  payload,
  terminology,
  locked,
  result,
  onAnswer,
  initialAnswer,
  onAnswerChange,
  hideCheck = false,
}: QuestionProps<OrderingPayload, OrderingAnswer>) {
  const [order, setOrder] = useState<string[]>(() => restoreOrder(payload, initialAnswer));
  // The starting order is not an answer until the learner moves something (or one is restored).
  const [moved, setMoved] = useState(() => initialAnswer !== undefined && isPermutation(payload, initialAnswer.order));
  useAnswerReporting<OrderingAnswer>(moved ? { order } : null, onAnswerChange);
  const [announcement, setAnnouncement] = useState('');
  /** After a move, focus returns to the row (arrow keys) or to the same button (buttons). */
  const pendingFocus = useRef<{ id: string; via: Direction | 'row' } | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const rows = useRef(new Map<string, HTMLLIElement>());
  const hintId = useId();

  // Every label is unique, so every Move button has a unique accessible name.
  const labels = new Map<string, string>();
  const raw = payload.items.map((item, index) => itemLabel(item, index, terminology));
  payload.items.forEach((item, index) => {
    const label = raw[index] as string;
    labels.set(item.id, raw.filter((other) => other === label).length > 1 ? `${label} (item ${index + 1})` : label);
  });

  // Keep keyboard focus on the moved item after it changes position.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    if (pending.via === 'row') {
      rows.current.get(pending.id)?.focus();
      return;
    }
    const other: Direction = pending.via === 'up' ? 'down' : 'up';
    const same = buttons.current.get(`${pending.id}:${pending.via}`);
    const fallback = buttons.current.get(`${pending.id}:${other}`);
    (same && !same.disabled ? same : fallback)?.focus();
  }, [order]);

  function move(id: string, direction: Direction, via: Direction | 'row' = direction) {
    if (locked) return;
    const label = labels.get(id) ?? id;
    const from = order.indexOf(id);
    const to = direction === 'up' ? from - 1 : from + 1;
    if (from === -1) return;
    if (to < 0 || to >= order.length) {
      setAnnouncement(`${label} is already ${direction === 'up' ? 'first' : 'last'}.`);
      return;
    }
    const next = [...order];
    [next[from], next[to]] = [next[to] as string, next[from] as string];
    pendingFocus.current = { id, via };
    setOrder(next);
    setMoved(true);
    setAnnouncement(`${label} moved to position ${to + 1} of ${order.length}.`);
  }

  function onRowKeyDown(event: React.KeyboardEvent<HTMLLIElement>, id: string) {
    // Only when the row itself has focus; the buttons inside keep their own keys.
    if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    move(id, event.key === 'ArrowUp' ? 'up' : 'down', 'row');
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
              ref={(element) => {
                if (element) rows.current.set(id, element);
                else rows.current.delete(id);
              }}
              tabIndex={locked ? undefined : 0}
              aria-describedby={hintId}
              aria-keyshortcuts="ArrowUp ArrowDown"
              onKeyDown={(event) => onRowKeyDown(event, id)}
              data-state={result === null ? 'idle' : inPlace ? 'in-place' : 'out-of-place'}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-lg border-2 bg-surface p-3 text-fg',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                stateClass,
              )}
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-md border-2 border-border text-sm font-bold text-fg-secondary"
              >
                {index + 1}
              </span>
              {/* Notation does not shrink: below its width the buttons wrap under it instead of clipping the notes. */}
              <span className={cn('flex-1 text-lg font-semibold', item.face.kind === 'passage' ? 'min-w-[9rem]' : 'min-w-0')}>
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
                      aria-label={`Move ${labels.get(id) ?? id} ${direction}`}
                      onClick={() => move(id, direction)}
                      className={cn(
                        BUTTON_BASE,
                        BUTTON_VARIANTS.secondary,
                        BUTTON_SIZES.md,
                        'disabled:opacity-40',
                      )}
                    >
                      <span aria-hidden="true">{direction === 'up' ? '\u2191' : '\u2193'}</span>
                      {direction === 'up' ? 'Up' : 'Down'}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-sm font-semibold uppercase tracking-wide text-muted">{plainText(payload.ends.last)}</p>
      <p id={hintId} className="sr-only">
        Focus an item, then press the up or down arrow key to move it.
      </p>
      <p role="status" aria-live="polite" className="sr-only" data-testid="ordering-announcement">
        {announcement}
      </p>
      {/* Without a move there is no answer, so a learner who thinks the starting order is right says so here. */}
      {result === null && !moved ? (
        <div>
          <Button
            variant="secondary"
            size="lg"
            className="w-full sm:w-auto"
            disabled={locked}
            onClick={() => {
              setMoved(true);
              setAnnouncement('You chose to keep this order.');
              if (!hideCheck) onAnswer({ order });
            }}
          >
            This order is correct
          </Button>
        </div>
      ) : null}
      {result === null && moved && hideCheck ? (
        <p className="text-sm text-fg-secondary">Your answer is this order. Move an item to change it.</p>
      ) : null}
      {hideCheck ? null : (
        <div>
          <Button size="lg" className="w-full sm:w-auto" disabled={locked} onClick={() => onAnswer({ order })}>
            Check
          </Button>
        </div>
      )}
    </div>
  );
}
