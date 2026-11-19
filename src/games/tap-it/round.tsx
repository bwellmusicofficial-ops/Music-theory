'use client';

import { useEffect, useMemo, useRef } from 'react';
import { CountInOverlay, RhythmPad, useTapAlong, type PadClock, type TapResult } from '@/components/rhythm-pad';
import { rhythm } from '@/engine/rhythm';
import type { Passage, Terminology } from '@/engine/types';
import { matchWindowMs } from '@/lesson/questions/tap-rhythm/types';
import { PassageView } from '@/lesson/questions/notation';
import type { Verdict } from './engine';
import type { TapRhythm } from './rhythms';

export interface RhythmRoundProps {
  rhythm: TapRhythm;
  /** The game's one metronome: every rhythm's count-in starts on a bar line of it. */
  clock: PadClock;
  terminology: Terminology;
  reducedMotion: boolean;
  latencyOffsetMs: number;
  timing: { perfectMs: number; toleranceMs: number };
  onJudged: (index: number, verdict: Verdict) => void;
  onExtraTap: () => void;
  onComplete: (result: TapResult) => void;
}

/** The two bars as words, for people who cannot see the stave. */
export function describeBars(r: TapRhythm, terminology: Terminology): string[] {
  return r.bars.map((bar) =>
    bar.events
      .map((e) => {
        const name = e.kind === 'rest' ? rhythm.restName(e.duration, terminology) : rhythm.noteValueName(e.duration, terminology);
        return e.kind === 'note' && e.tieToNext ? `${name} (tied)` : name;
      })
      .join(', '),
  );
}

/**
 * One rhythm: the notation with live marks, the count-in and the pad. Mounted fresh (new key) for
 * every rhythm. The pad starts itself (`autoStart`) on the next bar line of the game's clock, which
 * keeps clicking from one rhythm into the next, and shows no Start button or result of its own.
 */
export function RhythmRound({ rhythm: r, clock, terminology, reducedMotion, latencyOffsetMs, timing, onJudged, onExtraTap, onComplete }: RhythmRoundProps) {
  const root = useRef<HTMLDivElement>(null);
  const passage = useMemo<Passage>(
    () => ({ clef: 'treble', key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' }, time: r.time, bars: r.bars }),
    [r],
  );
  const along = useTapAlong({ bars: r.bars, time: r.time, mode: 'perform' });
  const words = useMemo(() => describeBars(r, terminology), [r, terminology]);
  const bar = terminology === 'us' ? 'Measure' : 'Bar';

  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[data-testid="tap-target"]')?.focus({ preventScroll: true });
  }, []);

  return (
    <div ref={root} className="ti-pad" data-testid="ti-round">
      <RhythmPad
        mode="perform"
        autoStart
        chrome="minimal"
        tapSize="large"
        clock={clock}
        bars={r.bars}
        time={r.time}
        bpm={r.bpm}
        countInBars={1}
        perfectMs={timing.perfectMs}
        toleranceMs={timing.toleranceMs}
        matchWindowMs={matchWindowMs(timing.toleranceMs)}
        latencyOffsetMs={latencyOffsetMs}
        showRetry={false}
        reducedMotion={reducedMotion}
        {...along.handlers}
        onOnsetJudged={(j) => {
          along.handlers.onOnsetJudged(j);
          onJudged(j.index, j.verdict);
        }}
        onExtraTap={() => {
          along.handlers.onExtraTap();
          onExtraTap();
        }}
        onComplete={onComplete}
      >
        <div className="ti-notation" data-testid="ti-notation">
          <PassageView
            passage={passage}
            size="md"
            terminology={terminology}
            marks={along.marks}
            cursor={along.cursor}
            ariaLabel={`Rhythm to tap: ${r.bars.length} bars in ${r.time.beats}/${r.time.beatUnit}`}
          />
          <CountInOverlay cue={along.countIn} />
          <ol className="sr-only" aria-label="The rhythm in words">
            {words.map((line, i) => (
              <li key={i}>{`${bar} ${i + 1}: ${line}`}</li>
            ))}
          </ol>
        </div>
      </RhythmPad>
    </div>
  );
}
