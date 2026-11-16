'use client';

import { Button } from '@/components/ui';
import type { GameResult } from './engine';
import { describeSignature, signaturePassage } from './questions';
import { SignatureView, signatureSpeech } from './signature-view';

export interface ResultsScreenProps {
  result: GameResult;
  /** Previous best for this mode, when the parent knows one. */
  bestScore?: number;
  reducedMotion: boolean;
  onPlayAgain: () => void;
  onExit: () => void;
}

const TOP_MISTAKES = 4;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="kh-stat">
      <dt className="text-xs font-bold uppercase tracking-widest text-muted">{label}</dt>
      <dd className="m-0 text-2xl font-black tabular-nums">{value}</dd>
    </div>
  );
}

export function ResultsScreen({ result, bestScore, reducedMotion, onPlayAgain, onExit }: ResultsScreenProps) {
  const isBest = bestScore !== undefined && result.score > bestScore;
  const worst = result.mistakes.slice(0, TOP_MISTAKES);
  return (
    <div className="flex flex-col gap-5 p-5 sm:p-8">
      <div>
        <h1 className="m-0 text-sm font-bold uppercase tracking-widest text-fg-secondary">Round over</h1>
        <p className="kh-score m-0 mt-1" data-testid="kh-final-score">
          {result.score}
        </p>
        <p className="m-0 text-sm font-bold uppercase tracking-widest text-muted">points</p>
        {isBest ? (
          <p className="mt-3 inline-block rounded-full bg-warning px-4 py-1 text-base font-black text-on-warning" data-testid="kh-pb">
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
      <section aria-labelledby="kh-practise">
        <h2 id="kh-practise" className="m-0 text-lg font-black">
          {worst.length > 0 ? 'Keys to practise' : 'No slips'}
        </h2>
        {worst.length > 0 ? (
          <ul className="m-0 mt-2 grid list-none grid-cols-1 gap-2 p-0 min-[480px]:grid-cols-2" data-testid="kh-mistakes">
            {worst.map((m) => {
              const passage = signaturePassage('treble', m.key);
              return (
                <li key={m.name} className="kh-stat flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <SignatureView passage={passage} ariaLabel={signatureSpeech(passage, m.signature)} reducedMotion={reducedMotion} />
                  </div>
                  <div>
                    <p className="m-0 text-lg font-black">{m.name}</p>
                    <p className="m-0 text-sm text-fg-secondary">{describeSignature(m.key)}</p>
                    <p className="m-0 text-sm font-bold text-fg-secondary">
                      {m.wrong > 0 ? `wrong ${m.wrong}` : null}
                      {m.wrong > 0 && m.timedOut > 0 ? ', ' : null}
                      {m.timedOut > 0 ? `timed out ${m.timedOut}` : null}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 mt-1 text-fg-secondary">Every question was answered correctly.</p>
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
