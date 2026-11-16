'use client';

import { Button } from '@/components/ui';
import type { GameResult } from './engine';

export interface ResultsScreenProps {
  result: GameResult;
  /** Previous best for this round length, when the parent knows one. */
  bestScore?: number;
  onPlayAgain: () => void;
  onExit: () => void;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ti-stat">
      <dt className="text-xs font-bold uppercase tracking-widest text-muted">{label}</dt>
      <dd className="m-0 text-2xl font-black tabular-nums">{value}</dd>
    </div>
  );
}

export function ResultsScreen({ result, bestScore, onPlayAgain, onExit }: ResultsScreenProps) {
  const isBest = !result.practice && bestScore !== undefined && result.score > bestScore;
  const hits = result.perfects + result.closes;
  return (
    <div className="flex flex-col gap-5 p-5 sm:p-8">
      {result.practice ? (
        <div>
          <h2 className="m-0 text-sm font-bold uppercase tracking-widest text-fg-secondary">Practice over</h2>
          <p className="m-0 mt-1 text-4xl font-black tabular-nums" data-testid="ti-practice-summary">
            {hits} of {result.onsets} notes hit
          </p>
          <p className="m-0 mt-1 text-lg text-fg-secondary">{result.misses} missed. No score in practice: well done for having a go.</p>
        </div>
      ) : (
        <div>
          <h2 className="m-0 text-sm font-bold uppercase tracking-widest text-fg-secondary">Round over</h2>
          <p className="ti-score m-0 mt-1" data-testid="ti-final-score">
            {result.score}
          </p>
          <p className="m-0 text-sm font-bold uppercase tracking-widest text-muted">points</p>
          {isBest ? (
            <p className="mt-3 inline-block rounded-full bg-warning px-4 py-1 text-base font-black text-on-warning" data-testid="ti-pb">
              <span aria-hidden="true">★ </span>New personal best!
            </p>
          ) : null}
        </div>
      )}
      <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {result.practice ? (
          <>
            <Stat label="Hit" value={String(hits)} />
            <Stat label="Missed" value={String(result.misses)} />
            <Stat label="Extra taps" value={String(result.extraTaps)} />
            <Stat label="Rhythms" value={String(result.rhythms)} />
          </>
        ) : (
          <>
            <Stat label="Accuracy" value={`${Math.round(result.accuracy * 100)}%`} />
            <Stat label="Best streak" value={String(result.bestStreak)} />
            <Stat label="Top level" value={String(result.maxLevel)} />
            <Stat label="Rhythms" value={String(result.rhythms)} />
          </>
        )}
      </dl>
      {result.practice ? null : (
        <section aria-labelledby="ti-practise">
          <h3 id="ti-practise" className="m-0 text-lg font-black">
            {result.practise ? 'Next time' : 'No slips'}
          </h3>
          <p className="m-0 mt-1 text-fg-secondary" data-testid="ti-practise-line">
            {result.practise ? `${result.practise}.` : 'Every note was a hit.'}
          </p>
        </section>
      )}
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
