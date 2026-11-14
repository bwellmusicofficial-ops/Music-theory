'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '@/audio';
import type { Passage } from '@/engine/types';

export interface PassagePlayback {
  playing: boolean;
  /** The event being played, for the stave cursor, or null. */
  cursor: { bar: number; event: number } | null;
  play: (passage: Passage, bpm: number) => Promise<void>;
  stop: () => void;
}

/**
 * Plays a passage through the audio engine, with a cursor. Audio is best
 * effort: a failure to load or play leaves the notation as it was.
 */
export function usePassagePlayback(): PassagePlayback {
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState<{ bar: number; event: number } | null>(null);
  const handle = useRef<{ stop(): void } | null>(null);
  const run = useRef(0);
  const alive = useRef(true);

  const halt = useCallback(() => {
    run.current += 1;
    try {
      handle.current?.stop();
    } catch {
      // Already stopped.
    }
    handle.current = null;
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      halt();
    };
  }, [halt]);

  const stop = useCallback(() => {
    halt();
    setPlaying(false);
    setCursor(null);
  }, [halt]);

  const play = useCallback(
    async (passage: Passage, bpm: number) => {
      halt();
      const mine = run.current;
      setPlaying(true);
      try {
        const engine = getAudioEngine();
        await engine.unlock();
        await engine.load();
        if (!alive.current || run.current !== mine) return;
        const h = engine.playPassage(passage, {
          bpm,
          onEvent: (bar, event) => {
            if (alive.current && run.current === mine) setCursor({ bar, event });
          },
        });
        handle.current = h;
        await h.done;
      } catch {
        // Best effort.
      } finally {
        if (alive.current && run.current === mine) {
          handle.current = null;
          setPlaying(false);
          setCursor(null);
        }
      }
    },
    [halt],
  );

  return { playing, cursor, play, stop };
}
