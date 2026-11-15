'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getAudioEngine } from '@/audio';
import { CountInOverlay, RhythmPad, useTapAlong } from '@/components/rhythm-pad';
import type { StaveMark } from '@/components/stave';
import { Button } from '@/components/ui';
import { rhythm } from '@/engine/rhythm';
import type { Passage, Terminology } from '@/engine/types';
import type { QuestionProps } from '@/lesson/contracts';
import { ResultMark } from '@/lesson/questions/face-view';
import { useLearnerSettings } from '@/lesson/player';
import { DEFAULT_TOLERANCE_MS, matchWindowMs, type TapRhythmAnswer, type TapRhythmPayload } from './types';

/** Live feedback for the notation: marks keyed "bar:event" and the note due now. */
export interface TapRhythmNotationLive {
  marks?: Record<string, StaveMark>;
  cursor?: { bar: number; event: number } | null;
}

/** `live` is omitted when nothing is happening, so a renderer that takes only the passage still works. */
type NotationRenderer = (passage: Passage, live?: TapRhythmNotationLive) => ReactNode;

let notationRenderer: NotationRenderer | null = null;

/**
 * Optional injection point (the app wires the stave in; this folder does not import it).
 * Pass null to remove it. Without one, the rhythm is described in words.
 */
export function setTapRhythmNotationRenderer(fn: NotationRenderer | null): void {
  notationRenderer = fn;
}

/** The payload as a Passage in treble clef and C major, for playback and the notation renderer. */
export function toPassage(payload: TapRhythmPayload): Passage {
  return {
    clef: 'treble',
    key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
    time: payload.time,
    bars: payload.bars,
  };
}

/** Text fallback: each bar's note values in order, e.g. "crotchet, crotchet, minim". */
export function describeRhythm(payload: TapRhythmPayload, terminology: Terminology): string[] {
  return payload.bars.map((bar) =>
    bar.events
      .map((event) => {
        const label =
          event.kind === 'rest'
            ? rhythm.restName(event.duration, terminology)
            : rhythm.noteValueName(event.duration, terminology);
        return event.kind === 'note' && event.tieToNext ? `${label} (tied)` : label;
      })
      .join(', '),
  );
}

type Listening = 'idle' | 'playing' | 'heard';

/** Listen (optional), then tap on the rhythm pad. The pad's TapResult is the answer. */
export function TapRhythm({
  payload,
  terminology,
  locked,
  result,
  onAnswer,
}: QuestionProps<TapRhythmPayload, TapRhythmAnswer>) {
  const [listening, setListening] = useState<Listening>('idle');
  const [audioProblem, setAudioProblem] = useState(false);
  const handle = useRef<{ stop(): void } | null>(null);
  const alive = useRef(true);
  const answered = useRef(false);
  const { latencyOffsetMs, reducedMotion } = useLearnerSettings();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      try {
        handle.current?.stop();
      } catch {
        // Nothing to stop.
      }
    };
  }, []);

  const passage = useMemo(() => toPassage(payload), [payload]);
  const lines = useMemo(() => describeRhythm(payload, terminology), [payload, terminology]);
  // Live game feedback: the pad reports each tap and beat; the notation shows them.
  const along = useTapAlong({ bars: payload.bars, time: payload.time, mode: 'perform' });
  const live = useMemo<TapRhythmNotationLive | undefined>(
    () => (along.cursor || Object.keys(along.marks).length > 0 ? { marks: along.marks, cursor: along.cursor } : undefined),
    [along.marks, along.cursor],
  );

  async function listen() {
    if (listening === 'playing' || locked) return;
    setListening('playing');
    setAudioProblem(false);
    try {
      const engine = getAudioEngine();
      // unlock() runs synchronously inside the click, as mobile browsers require.
      const unlocking = engine.unlock();
      await unlocking;
      await engine.load().catch(() => undefined);
      if (!alive.current) return;
      const playing = engine.playPassage(passage, { bpm: payload.bpm });
      handle.current = playing;
      await playing.done;
      if (alive.current) setListening('heard');
    } catch {
      if (alive.current) {
        setAudioProblem(true);
        // Sound is unavailable, so do not block the question.
        setListening('heard');
      }
    }
  }

  function handleComplete(tap: TapRhythmAnswer) {
    if (answered.current) return;
    answered.current = true;
    onAnswer(tap);
  }

  const mustListen = payload.listenFirst && listening !== 'heard' && !locked;
  const bar = terminology === 'us' ? 'Measure' : 'Bar';

  return (
    <div className="flex flex-col gap-4">
      {payload.showNotation ? (
        <div data-testid="notation" className="relative rounded-lg border-2 border-border bg-surface p-3">
          {notationRenderer ? (
            live ? notationRenderer(passage, live) : notationRenderer(passage)
          ) : (
            <ol aria-label="The rhythm in words" className="flex flex-col gap-1 text-fg">
              {lines.map((line, index) => (
                <li key={index} className="text-lg font-semibold">
                  <span className="text-sm font-bold uppercase tracking-wide text-muted">{`${bar} ${index + 1}: `}</span>
                  {line}
                </li>
              ))}
            </ol>
          )}
          <CountInOverlay cue={along.countIn} />
        </div>
      ) : null}

      {payload.listenFirst ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="lg"
            disabled={locked || listening === 'playing'}
            loading={listening === 'playing'}
            onClick={listen}
          >
            {listening === 'heard' ? 'Listen again' : 'Listen'}
          </Button>
          {mustListen ? (
            <p className="text-sm text-fg-secondary">Listen to the rhythm first, then the pad appears.</p>
          ) : null}
          {audioProblem ? (
            <p role="alert" className="text-sm text-danger">
              Sound could not be played on this device.
            </p>
          ) : null}
        </div>
      ) : null}

      {mustListen ? null : (
        <div inert={locked} data-testid="pad-wrapper">
          <RhythmPad
            mode="perform"
            bars={payload.bars}
            time={payload.time}
            bpm={payload.bpm}
            countInBars={payload.countInBars ?? 1}
            // Verdicts use the payload tolerance, as mark() does; taps are matched within a wider window,
            // so a mistimed tap is reported as early or late (a cross) rather than as missed.
            toleranceMs={payload.toleranceMs ?? DEFAULT_TOLERANCE_MS}
            matchWindowMs={matchWindowMs(payload.toleranceMs ?? DEFAULT_TOLERANCE_MS)}
            latencyOffsetMs={latencyOffsetMs}
            // Retrying belongs to the lesson player (hint, then "Try again" remounts this question).
            showRetry={false}
            reducedMotion={reducedMotion}
            {...along.handlers}
            onComplete={handleComplete}
          />
        </div>
      )}

      {result !== null ? (
        result.correct ? (
          <ResultMark tone="right" className="self-start">
            {`Rhythm correct, ${Math.round(result.score * 100)}%`}
          </ResultMark>
        ) : (
          <ResultMark tone="wrong" className="self-start">
            {`Not accurate enough, ${Math.round(result.score * 100)}%`}
          </ResultMark>
        )
      ) : null}
    </div>
  );
}
