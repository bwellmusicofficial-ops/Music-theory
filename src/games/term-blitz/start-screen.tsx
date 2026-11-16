'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { UNTIMED_CARDS, ROUND_SECONDS } from './deck-data';
import type { Deck } from './decks';

export interface StartScreenProps {
  decks: readonly Deck[];
  initialDeckId: string;
  untimed: boolean;
  roundSeconds?: number;
  untimedCards?: number;
  bests: Readonly<Record<string, number>>;
  onStart: (deckId: string) => void;
  onExit: () => void;
}

export function StartScreen({
  decks,
  initialDeckId,
  untimed,
  roundSeconds = ROUND_SECONDS,
  untimedCards = UNTIMED_CARDS,
  bests,
  onStart,
  onExit,
}: StartScreenProps) {
  const [deckId, setDeckId] = useState(decks.some((d) => d.id === initialDeckId) ? initialDeckId : decks[0]?.id ?? '');

  // Enter starts, unless it is already going to press a button.
  useEffect(() => {
    if (!deckId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      e.preventDefault();
      onStart(deckId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deckId, onStart]);

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-8">
      <div>
        <h1 className="tb-title m-0">Term Blitz</h1>
        <p className="mt-3 max-w-prose text-lg font-medium text-fg-secondary">
          {untimed
            ? `Words and signs, ${untimedCards} cards. Take your time: there is no clock.`
            : `Words and signs, fast! ${roundSeconds} seconds, one card at a time. Keys 1 to 4 answer.`}
        </p>
      </div>
      {decks.length === 0 ? (
        <p className="m-0 text-fg-secondary">There are no words to play with yet.</p>
      ) : (
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-sm font-bold uppercase tracking-widest text-fg-secondary">Choose a deck</legend>
          <div className="flex flex-col gap-2">
            {decks.map((d) => {
              const best = bests[d.id];
              return (
                <label key={d.id} className="block">
                  <input
                    type="radio"
                    name="tb-deck"
                    value={d.id}
                    checked={deckId === d.id}
                    onChange={() => setDeckId(d.id)}
                    className="sr-only"
                  />
                  <span className="tb-deck">
                    <span className="min-w-0">
                      <span className="block text-lg font-black leading-tight">{d.name}</span>
                      <span className="block text-sm font-medium text-fg-secondary">
                        {d.entryIds.length} words. {d.blurb}
                      </span>
                    </span>
                    {best !== undefined && best > 0 ? (
                      <span className="shrink-0 text-right text-sm font-bold text-strand-terms">
                        <span className="block text-xs uppercase tracking-widest text-muted">Best</span>
                        {best}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => onStart(deckId)} disabled={!deckId} autoFocus>
          Start
        </Button>
        <Button size="lg" variant="ghost" onClick={onExit}>
          Exit
        </Button>
      </div>
    </div>
  );
}
