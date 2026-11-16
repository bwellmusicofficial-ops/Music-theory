'use client';

import { useCallback, useMemo, useState } from 'react';
import { getAudioEngine } from '@/audio';
import type { LearnerSettings } from '@/lesson/contracts';
import type { GlossaryEntry } from '@/lesson/schema';
import { buildBank } from './bank';
import { buildDecks, type Deck } from './decks';
import { resolveConfig, type GameResult, type TermBlitzConfig } from './engine';
import { PlayScreen } from './play-screen';
import { ResultsScreen } from './results-screen';
import { StartScreen } from './start-screen';
import './term-blitz.css';

export interface TermBlitzProps {
  settings: LearnerSettings;
  /** The glossary: every entry of every grade that has a file. Decks are built from it. */
  entries: readonly GlossaryEntry[];
  /** Personal best per deck id. */
  bests?: Readonly<Record<string, number>>;
  /** Round length and card count overrides (tests, tuning). */
  config?: Partial<TermBlitzConfig>;
  onFinish: (deckId: string, result: GameResult) => void;
  onExit: () => void;
  /** Fixes the card sequence (tests, replays). Default: from the clock at each start. */
  seed?: number;
}

type Screen =
  | { name: 'start' }
  | { name: 'play'; run: number; deck: Deck; seed: number }
  | { name: 'results'; deck: Deck; result: GameResult; previousBest: number | undefined };

/** Runs an audio call without letting a failure reach the UI. */
function safely(fn: () => unknown) {
  try {
    void Promise.resolve(fn()).catch(() => {});
  } catch {
    // Audio is best effort.
  }
}

export function TermBlitz({ settings, entries, bests = {}, config, onFinish, onExit, seed }: TermBlitzProps) {
  const bank = useMemo(() => buildBank(entries), [entries]);
  const decks = useMemo(() => buildDecks(entries, bank), [entries, bank]);
  const [screen, setScreen] = useState<Screen>({ name: 'start' });
  const [deckId, setDeckId] = useState(decks[0]?.id ?? '');
  const [runs, setRuns] = useState(0);
  const untimed = settings.untimed;
  const resolved = useMemo(() => resolveConfig({ ...config, untimed }), [config, untimed]);

  const begin = useCallback(
    (id: string) => {
      const deck = decks.find((d) => d.id === id);
      if (!deck) return;
      // The Start press is the user gesture that lets audio play.
      if (settings.soundOn) {
        const engine = getAudioEngine();
        safely(() => engine.unlock());
        safely(() => engine.load());
      }
      setDeckId(id);
      setRuns((n) => n + 1);
      setScreen({ name: 'play', run: runs + 1, deck, seed: seed ?? Date.now() + runs });
    },
    [decks, runs, seed, settings.soundOn],
  );

  const handleFinished = useCallback(
    (deck: Deck, result: GameResult) => {
      // The best before this round: the caller may update `bests` as soon as `onFinish` runs.
      setScreen({ name: 'results', deck, result, previousBest: bests[deck.id] });
      onFinish(deck.id, result);
    },
    [bests, onFinish],
  );

  return (
    <section className="tb-root" aria-label="Term Blitz" data-reduced={settings.reducedMotion ? 'true' : undefined}>
      {screen.name === 'start' ? (
        <StartScreen
          decks={decks}
          initialDeckId={deckId}
          untimed={untimed}
          roundSeconds={resolved.roundSeconds}
          untimedCards={resolved.untimedCards}
          bests={bests}
          onStart={begin}
          onExit={onExit}
        />
      ) : null}
      {screen.name === 'play' ? (
        <PlayScreen
          key={screen.run}
          settings={settings}
          bank={bank}
          deck={screen.deck}
          config={resolved}
          seed={screen.seed}
          onFinished={(result) => handleFinished(screen.deck, result)}
          onExit={onExit}
        />
      ) : null}
      {screen.name === 'results' ? (
        <ResultsScreen
          bank={bank}
          terminology={settings.terminology}
          deckName={screen.deck.name}
          result={screen.result}
          previousBest={screen.previousBest}
          onPlayAgain={() => begin(screen.deck.id)}
          onChangeDeck={() => setScreen({ name: 'start' })}
          onExit={onExit}
        />
      ) : null}
    </section>
  );
}
