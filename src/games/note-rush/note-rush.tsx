'use client';

import { useCallback, useMemo, useState } from 'react';
import { getAudioEngine } from '@/audio';
import type { LearnerSettings } from '@/lesson/contracts';
import { resolveConfig, type AnswerMode, type GameResult, type NoteRushConfig, type RushClef } from './engine';
import './note-rush.css';
import { PlayScreen } from './play-screen';
import { ResultsScreen } from './results-screen';
import { StartScreen } from './start-screen';

export interface NoteRushProps {
  settings: LearnerSettings;
  /** Partial; anything missing takes the engine default. */
  config?: Partial<NoteRushConfig>;
  /** The learner's previous best, for the "new personal best" message. */
  bestScore?: number;
  onFinish: (result: GameResult) => void;
  onExit: () => void;
  /** Fixes the note sequence (tests, replays). Default: from the clock at each start. */
  seed?: number;
}

type Screen = { name: 'start' } | { name: 'play'; run: number; clef: RushClef; mode: AnswerMode; seed: number } | { name: 'results'; result: GameResult };

/** Runs an audio call without letting a failure reach the UI. */
function safely(fn: () => unknown) {
  try {
    void Promise.resolve(fn()).catch(() => {});
  } catch {
    // Audio is best effort.
  }
}

export function NoteRush({ settings, config, bestScore, onFinish, onExit, seed }: NoteRushProps) {
  const base = useMemo(() => resolveConfig(config), [config]);
  const [screen, setScreen] = useState<Screen>({ name: 'start' });
  const [choice, setChoice] = useState<{ clef: RushClef; mode: AnswerMode }>({ clef: base.clef, mode: base.answerMode });
  const [runs, setRuns] = useState(0);
  const untimed = settings.untimed || base.untimed;

  const begin = useCallback(
    (clef: RushClef, mode: AnswerMode) => {
      // The Start press is the user gesture that lets audio play.
      if (settings.soundOn) {
        const engine = getAudioEngine();
        safely(() => engine.unlock());
        safely(() => engine.load());
      }
      setChoice({ clef, mode });
      setRuns((n) => n + 1);
      setScreen({ name: 'play', run: runs + 1, clef, mode, seed: seed ?? Date.now() + runs });
    },
    [runs, seed, settings.soundOn],
  );

  const handleFinished = useCallback(
    (result: GameResult) => {
      setScreen({ name: 'results', result });
      onFinish(result);
    },
    [onFinish],
  );

  const playConfig = useMemo(
    () =>
      screen.name === 'play' ? resolveConfig({ ...base, clef: screen.clef, answerMode: screen.mode, untimed }) : base,
    [screen, base, untimed],
  );

  return (
    <section className="nr-root" aria-label="Note Rush" data-reduced={settings.reducedMotion ? 'true' : undefined}>
      {screen.name === 'start' ? (
        <StartScreen
          terminology={settings.terminology}
          untimed={untimed}
          initialClef={choice.clef}
          initialMode={choice.mode}
          bestScore={bestScore}
          onStart={({ clef, answerMode }) => begin(clef, answerMode)}
          onExit={onExit}
        />
      ) : null}
      {screen.name === 'play' ? (
        <PlayScreen
          key={screen.run}
          settings={settings}
          config={playConfig}
          seed={screen.seed}
          onFinished={handleFinished}
          onExit={onExit}
        />
      ) : null}
      {screen.name === 'results' ? (
        <ResultsScreen
          result={screen.result}
          bestScore={bestScore}
          onPlayAgain={() => begin(choice.clef, choice.mode)}
          onExit={onExit}
        />
      ) : null}
    </section>
  );
}
