'use client';

import { useCallback, useMemo, useState } from 'react';
import { getAudioEngine } from '@/audio';
import type { LearnerSettings } from '@/lesson/contracts';
import { resolveConfig, type GameResult, type KeyHuntConfig } from './engine';
import './key-hunt.css';
import { PlayScreen } from './play-screen';
import { gradePool, type GradeId } from './pools';
import type { AskMode } from './questions';
import { ResultsScreen } from './results-screen';
import { StartScreen } from './start-screen';

export interface KeyHuntProps {
  settings: LearnerSettings;
  /** Partial; anything missing takes the engine default. */
  config?: Partial<KeyHuntConfig>;
  /** Previous best scores by variant (see `variantOf`). */
  bests?: Record<string, number>;
  /** `variant` says which best the score belongs to. */
  onFinish: (result: GameResult, variant: string) => void;
  onExit: () => void;
  /** Fixes the question sequence (tests, replays). Default: from the clock at each start. */
  seed?: number;
}

/** The key under which a score is kept: grade, way of asking, and timed or untimed. */
export function variantOf(grade: GradeId, mode: AskMode, untimed: boolean): string {
  return `${grade}:${mode}:${untimed ? 'untimed' : 'timed'}`;
}

type Screen =
  | { name: 'start' }
  | { name: 'play'; run: number; mode: AskMode; grade: GradeId; seed: number }
  | { name: 'results'; result: GameResult; variant: string; previousBest: number | undefined };

/** Runs an audio call without letting a failure reach the UI. */
function safely(fn: () => unknown) {
  try {
    void Promise.resolve(fn()).catch(() => {});
  } catch {
    // Audio is best effort.
  }
}

export function KeyHunt({ settings, config, bests, onFinish, onExit, seed }: KeyHuntProps) {
  const base = useMemo(() => resolveConfig(config), [config]);
  const untimed = settings.untimed || base.untimed;
  const [screen, setScreen] = useState<Screen>({ name: 'start' });
  const [choice, setChoice] = useState<{ mode: AskMode; grade: GradeId }>({
    mode: base.mode,
    grade: gradePool(base.grade).available ? base.grade : 'grade-1',
  });
  const [runs, setRuns] = useState(0);

  const begin = useCallback(
    (mode: AskMode, grade: GradeId) => {
      // The Start press is the user gesture that lets audio play.
      if (settings.soundOn) {
        const engine = getAudioEngine();
        safely(() => engine.unlock());
        safely(() => engine.load());
      }
      setChoice({ mode, grade });
      setRuns((n) => n + 1);
      setScreen({ name: 'play', run: runs + 1, mode, grade, seed: seed ?? Date.now() + runs });
    },
    [runs, seed, settings.soundOn],
  );

  const handleFinished = useCallback(
    (result: GameResult) => {
      const variant = variantOf(choice.grade, choice.mode, result.untimed);
      // The best before this round: the caller may update `bests` as soon as `onFinish` runs.
      setScreen({ name: 'results', result, variant, previousBest: bests?.[variant] });
      onFinish(result, variant);
    },
    [onFinish, bests, choice],
  );

  const playConfig = useMemo(
    () => (screen.name === 'play' ? resolveConfig({ ...base, mode: screen.mode, grade: screen.grade, untimed }) : base),
    [screen, base, untimed],
  );

  return (
    <section className="kh-root" aria-label="Key Hunt" data-reduced={settings.reducedMotion ? 'true' : undefined}>
      {screen.name === 'start' ? (
        <StartScreen
          untimed={untimed}
          untimedQuestions={base.untimedQuestions}
          initialMode={choice.mode}
          initialGrade={choice.grade}
          bestFor={(mode, grade) => bests?.[variantOf(grade, mode, untimed)]}
          onStart={({ mode, grade }) => begin(mode, grade)}
          onExit={onExit}
        />
      ) : null}
      {screen.name === 'play' ? (
        <PlayScreen key={screen.run} settings={settings} config={playConfig} seed={screen.seed} onFinished={handleFinished} onExit={onExit} />
      ) : null}
      {screen.name === 'results' ? (
        <ResultsScreen
          result={screen.result}
          bestScore={screen.previousBest}
          reducedMotion={settings.reducedMotion}
          onPlayAgain={() => begin(choice.mode, choice.grade)}
          onExit={onExit}
        />
      ) : null}
    </section>
  );
}
