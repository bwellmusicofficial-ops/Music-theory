'use client';

import { termLabel, meaningLabel, languageLabel, type Bank } from './bank';
import { Button } from '@/components/ui';
import type { Terminology } from '@/engine/types';
import type { GameResult } from './engine';

export interface ResultsScreenProps {
  bank: Bank;
  terminology: Terminology;
  deckName: string;
  result: GameResult;
  /** The learner's best for this deck before this round, when known. */
  previousBest?: number;
  onPlayAgain: () => void;
  onChangeDeck: () => void;
  onExit: () => void;
}

/** The revision list stays short enough to read on a phone. */
export const REVISION_LIMIT = 8;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="tb-stat">
      <dt className="text-xs font-bold uppercase tracking-widest text-muted">{label}</dt>
      <dd className="m-0 text-2xl font-black tabular-nums">{value}</dd>
    </div>
  );
}

export function ResultsScreen({
  bank,
  terminology,
  deckName,
  result,
  previousBest,
  onPlayAgain,
  onChangeDeck,
  onExit,
}: ResultsScreenProps) {
  const isBest = result.score > 0 && result.score > (previousBest ?? 0);
  const shown = result.missed.slice(0, REVISION_LIMIT);
  const more = result.missed.length - shown.length;
  return (
    <div className="flex flex-col gap-5 p-4 sm:p-8">
      <div>
        <h2 className="m-0 text-sm font-bold uppercase tracking-widest text-fg-secondary">Round over: {deckName}</h2>
        <p className="tb-score m-0 mt-1" data-testid="tb-final-score">
          {result.score}
        </p>
        <p className="m-0 text-sm font-bold uppercase tracking-widest text-muted">points</p>
        {isBest ? (
          <p className="mt-3 inline-block rounded-full bg-warning px-4 py-1 text-base font-black text-on-warning" data-testid="tb-pb">
            <span aria-hidden="true">★ </span>New personal best!
          </p>
        ) : previousBest !== undefined && previousBest > 0 ? (
          <p className="mt-2 text-sm font-bold text-fg-secondary">Your best: {previousBest}</p>
        ) : null}
      </div>
      <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Accuracy" value={`${Math.round(result.accuracy * 100)}%`} />
        <Stat label="Best streak" value={String(result.bestStreak)} />
        <Stat label="Cards seen" value={String(result.answered)} />
        <Stat label="Correct" value={String(result.correct)} />
      </dl>
      <section aria-labelledby="tb-revise">
        <h3 id="tb-revise" className="m-0 text-lg font-black">
          {shown.length > 0 ? 'Words to revise' : 'No slips'}
        </h3>
        {shown.length > 0 ? (
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {shown.map((m) => {
              const info = bank.byId.get(m.entryId);
              if (!info) return null;
              const language = languageLabel(info);
              return (
                <li key={m.entryId} className="tb-stat" data-testid="tb-revise-item">
                  <p className="m-0 text-lg font-black">
                    {termLabel(info, terminology)}
                    {info.abbreviations.length > 0 ? (
                      <span className="ml-2 font-serif text-base font-bold italic text-fg-secondary">
                        {info.abbreviations.join(', ')}
                      </span>
                    ) : null}
                    {language ? <span className="tb-tag ml-2 align-middle">{language}</span> : null}
                  </p>
                  <p className="m-0 text-base font-medium text-fg-secondary">{meaningLabel(info, terminology)}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 mt-1 text-fg-secondary">Every card was answered correctly.</p>
        )}
        {more > 0 ? <p className="m-0 mt-2 text-sm font-bold text-fg-secondary">And {more} more.</p> : null}
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={onPlayAgain} autoFocus>
          Play again
        </Button>
        <Button size="lg" variant="secondary" onClick={onChangeDeck}>
          Change deck
        </Button>
        <Button size="lg" variant="ghost" onClick={onExit}>
          Exit
        </Button>
      </div>
    </div>
  );
}
