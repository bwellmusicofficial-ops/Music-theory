'use client';

import { useCallback, useMemo, useState } from 'react';
import { getAudioEngine } from '@/audio';
import type { LearnerSettings } from '@/lesson/contracts';
import { resolveConfig, type GameResult, type StartChoice, type TapItConfig } from './engine';
import { PlayScreen } from './play-screen';
import { ResultsScreen } from './results-screen';
import { StartScreen } from './start-screen';
import './tap-it.css';

export interface TapItProps {
  settings: LearnerSettings;
  /** Partial; anything missing takes the engine default. `roundSeconds` here overrides the start screen (tests). */
  config?: Partial<TapItConfig>;
  /** The learner's previous best score for each round length ("60", "120"). */
  bests?: Record<string, number>;
  /** `variant` says which best this score belongs to: the round length in seconds, as a string. Practice rounds are not reported. */
  onFinish: (result: GameResult, variant: string) => void;
  onExit: () => void;
  /** Fixes the rhythm sequence (tests, replays). Default: from the clock at each start. */
  seed?: number;
}

interface Choice {
  startLevel: StartChoice;
  roundSeconds: 60 | 120;
  practice: boolean;
}

type Screen =
  | { name: 'start' }
  | { name: 'play'; run: number; choice: Choice; seed: number }
  | { name: 'results'; result: GameResult; variant: string; previousBest: number | undefined };

/** Runs an audio call without letting a failure reach the UI. */
function safely(fn: () => unknown) {
  try {
    void Promise.resolve(fn()).catch(() => {});
  } catch {
    // Audio is best effort.
  }
}

const nearestStart = (level: number): StartChoice => (level >= 5 ? 5 : level >= 3 ? 3 : 1);

export function TapIt({ settings, config, bests, onFinish, onExit, seed }: TapItProps) {
  const base = useMemo(() => resolveConfig(config), [config]);
  const untimed = settings.untimed;
  const [screen, setScreen] = useState<Screen>({ name: 'start' });
  const [choice, setChoice] = useState<Choice>({
    startLevel: nearestStart(base.startLevel),
    roundSeconds: base.roundSeconds === 120 ? 120 : 60,
    practice: untimed,
  });
  const [runs, setRuns] = useState(0);

  const begin = useCallback(
    (c: Choice) => {
      // The Start press is the user gesture that lets audio play. Tap It runs on the audio
      // clock, so it is unlocked even when sound is off (the clicks are then muted by settings).
      const engine = getAudioEngine();
      safely(() => engine.unlock());
      safely(() => engine.load());
      setChoice(c);
      setRuns((n) => n + 1);
      setScreen({ name: 'play', run: runs + 1, choice: c, seed: seed ?? Date.now() + runs });
    },
    [runs, seed],
  );

  const playConfig = useMemo(() => {
    if (screen.name !== 'play') return base;
    const c = screen.choice;
    return resolveConfig({
      ...base,
      startLevel: c.startLevel,
      // A config that sets the round length itself (tests) wins over the start screen's two lengths.
      roundSeconds: config?.roundSeconds !== undefined ? config.roundSeconds : c.roundSeconds,
      practice: c.practice,
    });
  }, [screen, base, config?.roundSeconds]);

  const handleFinished = useCallback(
    (result: GameResult) => {
      const variant = String(playConfig.roundSeconds);
      setScreen({ name: 'results', result, variant, previousBest: bests?.[variant] });
      if (!result.practice) onFinish(result, variant);
    },
    [onFinish, bests, playConfig.roundSeconds],
  );

  return (
    <section className="ti-root" aria-label="Tap It" data-reduced={settings.reducedMotion ? 'true' : undefined}>
      {screen.name === 'start' ? (
        <StartScreen
          untimed={untimed}
          initialLevel={choice.startLevel}
          initialSeconds={choice.roundSeconds}
          bests={bests}
          onStart={begin}
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
        <ResultsScreen result={screen.result} bestScore={screen.previousBest} onPlayAgain={() => begin(choice)} onExit={onExit} />
      ) : null}
    </section>
  );
}
