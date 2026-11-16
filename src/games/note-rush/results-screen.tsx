'use client';

import { Button } from '@/components/ui';
import type { GameResult } from './engine';

export interface ResultsScreenProps {
  result: GameResult;
  /** Previous best, when the parent knows one. */
  bestScore?: number;
  onPlayAgain: () => void;
  onExit: () => void;
}

const TOP_MISTAKES = 5;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="nr-stat">
      <dt className="text-xs font-bold uppercase tracking-widest text-muted">{label}</dt>
      <dd className="m-0 text-2xl font-black tabular-nums">{value}</dd>
    </div>
  );
}

export function ResultsScreen({ result, bestScore, onPlayAgain, onExit }: ResultsScreenProps) {
  const isBest = bestScore !== undefined && result.score > bestScore;
  const worst = result.mistakes.slice(0, TOP_MISTAKES);
  return (
    <div className="flex flex-col gap-5 p-5 sm:p-8">
      <div>
        <h1 className="m-0 text-sm font-bold uppercase tracking-widest text-fg-secondary">Round over</h1>
        <p className="nr-score m-0 mt-1" data-testid="nr-final-score">
          {result.score}
        </p>
        <p className="m-0 text-sm font-bold uppercase tracking-widest text-muted">points</p>
        {isBest ? (
          <p className="mt-3 inline-block rounded-full bg-warning px-4 py-1 text-base font-black text-on-warning" data-testid="nr-pb">
            <span aria-hidden="true">★ </span>New personal best!
          </p>
        ) : null}
      </div>
      <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Accuracy" value={`${Math.round(result.accuracy * 100)}%`} />
        <Stat label="Best streak" value={String(result.bestStreak)} />
        <Stat label="Top level" value={String(result.maxLevel)} />
        <Stat label="Correct" value={String(result.correct)} />
      </dl>
      <section aria-labelledby="nr-practise">
        <h2 id="nr-practise" className="m-0 text-lg font-black">
          {worst.length > 0 ? 'Practise these' : 'No slips'}
        </h2>
        {worst.length > 0 ? (
          <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
            {worst.map((m) => (
              <li key={m.key} className="nr-stat flex items-baseline gap-2">
                <span className="text-xl font-black">{m.key}</span>
                <span className="text-sm text-fg-secondary">
                  {m.missed > 0 ? `missed ${m.missed}` : null}
                  {m.missed > 0 && m.wrong > 0 ? ', ' : null}
                  {m.wrong > 0 ? `wrong ${m.wrong}` : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 mt-1 text-fg-secondary">Every note was named correctly.</p>
        )}
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={onPlayAgain}>
          Play again
        </Button>
        <Button size="lg" variant="ghost" onClick={onExit}>
          Exit
        </Button>
      </div>
    </div>
  );
}
