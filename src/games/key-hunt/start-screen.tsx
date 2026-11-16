'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { questionMs } from './engine';
import { describePool, GRADE_POOLS, type GradeId } from './pools';
import type { AskMode } from './questions';

export interface StartScreenProps {
  untimed: boolean;
  untimedQuestions: number;
  initialMode: AskMode;
  initialGrade: GradeId;
  /** Best score for the currently chosen mode and grade, from the parent. */
  bestFor: (mode: AskMode, grade: GradeId) => number | undefined;
  onStart: (choice: { mode: AskMode; grade: GradeId }) => void;
  onExit: () => void;
}

const MODES: { id: AskMode; label: string; hint: string }[] = [
  { id: 'sig-to-key', label: 'Signature to key', hint: 'See the signature, pick the key' },
  { id: 'key-to-sig', label: 'Key to signature', hint: 'See the key, pick the signature' },
];

export function StartScreen({ untimed, untimedQuestions, initialMode, initialGrade, bestFor, onStart, onExit }: StartScreenProps) {
  const [mode, setMode] = useState<AskMode>(initialMode);
  const [grade, setGrade] = useState<GradeId>(initialGrade);
  const best = bestFor(mode, grade);
  return (
    <div className="flex flex-col gap-5 p-5 sm:p-8">
      <div>
        <h1 className="kh-title m-0">Key Hunt</h1>
        <p className="mt-3 max-w-prose text-lg font-medium text-fg-secondary">
          {untimed
            ? `Name the key from its signature, or the signature from its key. Take your time: no clock, ${untimedQuestions} questions.`
            : `Name the key from its signature, or the signature from its key, before the bar runs out. It gets faster: ${questionMs(1) / 1000} seconds at first, down to ${questionMs(8) / 1000}.`}
        </p>
        {best !== undefined && best > 0 ? <p className="mt-2 text-sm font-bold text-strand-scales-keys">Best score: {best}</p> : null}
      </div>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 text-sm font-bold uppercase tracking-widest text-fg-secondary">Mode</legend>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((m) => (
            <label key={m.id} className="flex">
              <input
                type="radio"
                name="kh-mode"
                value={m.id}
                checked={mode === m.id}
                onChange={() => setMode(m.id)}
                className="sr-only"
              />
              <span className="kh-choice">
                <span>{m.label}</span>
                <span className="text-xs font-semibold text-fg-secondary">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 text-sm font-bold uppercase tracking-widest text-fg-secondary">Which keys</legend>
        <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
          {GRADE_POOLS.map((pool) => (
            <label key={pool.id} className="flex">
              <input
                type="radio"
                name="kh-grade"
                value={pool.id}
                checked={grade === pool.id}
                disabled={!pool.available}
                onChange={() => pool.available && setGrade(pool.id)}
                className="sr-only"
              />
              <span className="kh-choice">
                <span>{pool.label}</span>
                <span className="text-xs font-semibold text-fg-secondary">
                  {pool.available ? describePool(pool) : (pool.lockedNote ?? 'Coming soon')}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => onStart({ mode, grade })}>
          Start
        </Button>
        <Button size="lg" variant="ghost" onClick={onExit}>
          Exit
        </Button>
      </div>
    </div>
  );
}
