'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getAudioEngine } from '@/audio';
import { Button } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import type { Passage } from '@/engine/types';
import type { QuestionProps } from '@/lesson/contracts';
import { FaceView, ResultMark } from '@/lesson/questions/face-view';
import type { ByEarAnswer, ByEarPayload } from './types';

const LETTERS = ['A', 'B', 'C', 'D'] as const;
const CLIP_LABELS = ['A', 'B', 'C'] as const;

type NotationRenderer = (passage: Passage) => ReactNode;
let notationRenderer: NotationRenderer | null = null;

/**
 * Optional injection point for drawing a `passage` face on an option (the app wires the stave in).
 * Clips themselves are never drawn. Pass null to remove it.
 */
export function setByEarNotationRenderer(fn: NotationRenderer | null): void {
  notationRenderer = fn;
}

/** Play buttons for the clips, then the options, which stay disabled until every clip has been heard to the end once. */
export function ByEar({ payload, locked, result, onAnswer }: QuestionProps<ByEarPayload, ByEarAnswer>) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [heard, setHeard] = useState<ReadonlySet<number>>(() => new Set());
  const [playing, setPlaying] = useState<number | null>(null);
  const [problem, setProblem] = useState(false);
  const current = useRef<{ index: number; stop(): void; stopped: boolean } | null>(null);
  const alive = useRef(true);
  const many = payload.clips.length > 1;
  const allHeard = heard.size === payload.clips.length;

  function stopCurrent() {
    const running = current.current;
    if (!running) return;
    running.stopped = true;
    current.current = null;
    try {
      running.stop();
    } catch {
      // Nothing to stop.
    }
  }

  useEffect(() => {
    alive.current = true;
    const playingNow = current;
    return () => {
      alive.current = false;
      const running = playingNow.current;
      if (!running) return;
      running.stopped = true;
      playingNow.current = null;
      try {
        running.stop();
      } catch {
        // Nothing to stop.
      }
    };
  }, []);

  async function play(index: number) {
    const wasPlayingThis = playing === index;
    stopCurrent();
    if (wasPlayingThis) {
      setPlaying(null);
      return;
    }
    const clip = payload.clips[index];
    if (!clip) return;
    setProblem(false);
    setPlaying(index);
    const token = { index, stop: () => undefined as void, stopped: false };
    current.current = token;
    try {
      const engine = getAudioEngine();
      // unlock() runs synchronously inside the click, as mobile browsers require.
      await engine.unlock();
      await engine.load().catch(() => undefined);
      if (!alive.current || token.stopped) return;
      const handle = engine.playPassage(clip.passage, { bpm: clip.bpm });
      token.stop = () => handle.stop();
      await handle.done;
      if (!alive.current) return;
      if (!token.stopped) {
        setHeard((previous) => new Set(previous).add(index));
      }
    } catch {
      if (alive.current && !token.stopped) setProblem(true);
    } finally {
      if (alive.current && current.current === token) {
        current.current = null;
        setPlaying(null);
      }
    }
  }

  function choose(optionId: string) {
    if (locked || !allHeard) return;
    setChosen(optionId);
    onAnswer({ optionId });
  }

  const optionsOff = locked || !allHeard;

  return (
    <div className="flex flex-col gap-4">
      <ul aria-label="Clips to listen to" className="flex flex-wrap gap-3">
        {payload.clips.map((_, index) => {
          const label = many ? `clip ${CLIP_LABELS[index]}` : 'the clip';
          const isPlaying = playing === index;
          return (
            <li key={index} className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="lg"
                aria-pressed={isPlaying}
                aria-label={`${isPlaying ? 'Stop' : 'Play'} ${label}`}
                data-heard={heard.has(index)}
                onClick={() => void play(index)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor">
                  {isPlaying ? <rect x="6" y="6" width="12" height="12" rx="2" /> : <path d="M8 5v14l11-7z" />}
                </svg>
                {many ? `Clip ${CLIP_LABELS[index]}` : 'Play'}
              </Button>
              {heard.has(index) ? <span className="text-sm text-fg-secondary">Heard</span> : null}
            </li>
          );
        })}
      </ul>
      {!allHeard && !locked ? (
        <p className="text-sm text-fg-secondary">
          {many ? 'Play every clip to the end to unlock the answers.' : 'Play the clip to the end to unlock the answers.'}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="text-sm text-danger">
          Sound could not be played on this device.
        </p>
      ) : null}
      <ul className="flex flex-col gap-3" aria-label="Answer options">
        {payload.options.map((option, index) => {
          const isCorrect = option.id === payload.correct;
          const isChosen = chosen === option.id;
          const state = result === null ? 'idle' : isCorrect ? 'right' : isChosen ? 'wrong' : 'other';
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={optionsOff}
                data-state={state}
                onClick={() => choose(option.id)}
                className={cn(
                  'flex min-h-14 w-full items-center gap-4 rounded-lg border-2 bg-surface px-4 py-3 text-left text-fg',
                  'transition-[border-color,opacity] duration-(--motion-duration-fast) ease-standard',
                  'enabled:cursor-pointer enabled:hover:border-accent',
                  'disabled:cursor-default',
                  !locked && !allHeard && 'opacity-60',
                  state === 'idle' && 'border-border',
                  state === 'right' && 'border-success',
                  state === 'wrong' && 'border-danger',
                  state === 'other' && 'border-border-subtle opacity-60',
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-md border-2 border-border text-sm font-bold text-fg-secondary"
                >
                  {LETTERS[index]}
                </span>
                <span className="flex min-w-0 flex-1 items-center text-lg font-semibold">
                  <FaceView face={option.face} {...(notationRenderer ? { renderPassage: notationRenderer } : {})} />
                </span>
                {state === 'right' ? <ResultMark tone="right">Correct answer</ResultMark> : null}
                {state === 'wrong' ? <ResultMark tone="wrong">Your answer</ResultMark> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
