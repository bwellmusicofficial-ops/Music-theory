'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getAudioEngine } from '@/audio';
import { Keyboard } from '@/components/keyboard';
import { Button } from '@/components/ui';
import { pitch as pitchEngine } from '@/engine/pitch';
import type { StaveMark } from '@/components/stave';
import type { Passage, Pitch } from '@/engine/types';
import type { Exhibit } from '../schema';
import type { ExhibitRenderers } from './types';

export interface ExhibitViewProps {
  exhibit: Exhibit;
  renderers?: ExhibitRenderers;
  /** Accessible description used for the notation and keyboard. */
  label?: string;
  /** Whether the keyboard makes sound. Default true. */
  sound?: boolean;
  /** Called when the learner presses a play button or a key, for the explore step's gate. */
  onInteract?: () => void;
  /** Passage exhibits: live marks and cursor handed to the passage renderer (the explore step's play-along). */
  marks?: Record<string, StaveMark>;
  cursor?: { bar: number; event: number } | null;
}

/** Structural check only; the stave validates the detail. */
export function isPassage(value: unknown): value is Passage {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.bars) && typeof v.time === 'object' && v.time !== null;
}

function tryPitch(text: string): Pitch | null {
  try {
    return pitchEngine.parsePitch(text);
  } catch {
    return null;
  }
}

export function keyboardRange(exhibit: Extract<Exhibit, { kind: 'keyboard' }> | undefined): { low: Pitch; high: Pitch } {
  const low = (exhibit && tryPitch(exhibit.low)) || pitchEngine.parsePitch('C3');
  const high = (exhibit && tryPitch(exhibit.high)) || pitchEngine.parsePitch('C5');
  return { low, high };
}

function PlayButton({
  label,
  playing,
  onToggle,
}: {
  label: string;
  playing: boolean;
  onToggle: () => void;
}) {
  return (
    <Button variant="secondary" size="md" onClick={onToggle} aria-pressed={playing} aria-label={`${playing ? 'Stop' : 'Play'}${label ? `: ${label}` : ''}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor">
        {playing ? <rect x="6" y="6" width="12" height="12" rx="2" /> : <path d="M8 5v14l11-7z" />}
      </svg>
      {playing ? 'Stop' : 'Play'}
    </Button>
  );
}

function PassageExhibit({ exhibit, renderers, label, onInteract, marks, cursor }: ExhibitViewProps & { exhibit: Extract<Exhibit, { kind: 'passage' }> }) {
  const [playing, setPlaying] = useState(false);
  const handle = useRef<{ stop(): void } | null>(null);
  const alive = useRef(true);
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

  const passage = isPassage(exhibit.passage) ? exhibit.passage : null;
  const ariaLabel = label ?? 'Musical example';

  async function toggle() {
    if (!passage) return;
    onInteract?.();
    if (playing) {
      try {
        handle.current?.stop();
      } catch {
        // Already stopped.
      }
      setPlaying(false);
      return;
    }
    setPlaying(true);
    try {
      const engine = getAudioEngine();
      await engine.unlock();
      await engine.load();
      if (!alive.current) return;
      const h = engine.playPassage(passage, { bpm: exhibit.tempo ?? 80 });
      handle.current = h;
      await h.done;
    } catch {
      // Audio is best effort; the notation still shows.
    } finally {
      if (alive.current) setPlaying(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-exhibit="passage">
      {passage ? (
        renderers?.passage ? (
          renderers.passage({ passage, tempo: exhibit.tempo, ariaLabel, marks, cursor })
        ) : (
          <div
            role="img"
            aria-label={`${ariaLabel} (notation preview unavailable)`}
            className="rounded-md border border-dashed border-border bg-surface p-4 text-center text-fg-secondary"
          >
            Notation preview unavailable
          </div>
        )
      ) : (
        <div role="alert" className="rounded-md border border-danger p-3 text-danger">
          This example is not a valid passage.
        </div>
      )}
      {passage ? <PlayButton label={ariaLabel} playing={playing} onToggle={() => void toggle()} /> : null}
    </div>
  );
}

function AudioClipExhibit({ exhibit, onInteract }: { exhibit: Extract<Exhibit, { kind: 'audioClip' }>; onInteract?: () => void }) {
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );

  function toggle() {
    onInteract?.();
    try {
      if (!audio.current) {
        const a = new Audio(exhibit.src);
        a.addEventListener('ended', () => setPlaying(false));
        audio.current = a;
      }
      const a = audio.current;
      if (playing) {
        a.pause();
        a.currentTime = 0;
        setPlaying(false);
      } else {
        setPlaying(true);
        void Promise.resolve(a.play()).catch(() => setPlaying(false));
      }
    } catch {
      setPlaying(false);
    }
  }

  return (
    <figure className="flex flex-col items-start gap-2" data-exhibit="audioClip">
      <PlayButton label={exhibit.caption} playing={playing} onToggle={toggle} />
      <figcaption className="text-fg-secondary">{exhibit.caption}</figcaption>
    </figure>
  );
}

export function ExhibitView(props: ExhibitViewProps) {
  const { exhibit, sound = true, onInteract } = props;
  const highlight = useMemo(() => {
    if (exhibit.kind !== 'keyboard') return [];
    return exhibit.highlight
      .map(tryPitch)
      .filter((p): p is Pitch => p !== null)
      .map((p) => ({ pitch: p, state: 'target' as const }));
  }, [exhibit]);
  const range = useMemo(
    () => keyboardRange(exhibit.kind === 'keyboard' ? exhibit : undefined),
    [exhibit],
  );

  switch (exhibit.kind) {
    case 'keyboard':
      return (
        <div data-exhibit="keyboard" aria-label={props.label ?? 'Piano keyboard'} role="group">
          <Keyboard
            low={range.low}
            high={range.high}
            showLabels
            highlight={highlight}
            sound={sound}
            onNote={() => onInteract?.()}
          />
        </div>
      );
    case 'audioClip':
      return <AudioClipExhibit exhibit={exhibit} onInteract={onInteract} />;
    case 'passage':
      return <PassageExhibit {...props} exhibit={exhibit} />;
  }
}
