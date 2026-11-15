'use client';

import { Stave } from '@/components/stave';
import type { Passage, Terminology } from '@/engine/types';
import type { StaveMark, StaveSize } from '@/components/stave';
import { PlayButton } from './play-button';
import { usePassagePlayback } from './use-passage-playback';

export interface PassageViewProps {
  passage: Passage;
  /** Accessible name. Default: a plain description that gives nothing away ("2 bars of music in 4/4, treble clef"). */
  ariaLabel?: string;
  terminology?: Terminology;
  /** Show a play button that plays the passage with a moving cursor. Default false. */
  playable?: boolean;
  /** Felt beats per minute for playback. Default 80. */
  bpm?: number;
  size?: StaveSize;
  /** Per-event marks keyed "bar:event", for live feedback (see Stave `marks`). */
  marks?: Record<string, StaveMark>;
  /** A cursor driven by the parent; it wins over the play button's own cursor. */
  cursor?: { bar: number; event: number } | null;
}

/** Default accessible name for a passage. */
export function passageLabel(passage: Passage, terminology: Terminology = 'uk'): string {
  const n = passage.bars.length;
  const bar = terminology === 'us' ? 'measure' : 'bar';
  const { beats, beatUnit } = passage.time;
  return `${n} ${bar}${n === 1 ? '' : 's'} of music in ${beats}/${beatUnit}, ${passage.clef} clef`;
}

/** A read-only stave for a passage, with an optional play button and cursor. */
export function PassageView({
  passage,
  ariaLabel,
  terminology = 'uk',
  playable = false,
  bpm = 80,
  size,
  marks,
  cursor: cursorOverride,
}: PassageViewProps) {
  const { playing, cursor, play, stop } = usePassagePlayback();
  const label = ariaLabel ?? passageLabel(passage, terminology);
  return (
    <div className="flex flex-col gap-3" data-passage-view>
      <Stave mode="read" passage={passage} ariaLabel={label} terminology={terminology} cursor={cursorOverride !== undefined ? cursorOverride : cursor} size={size} marks={marks} />
      {playable ? (
        <div>
          <PlayButton label="the music" playing={playing} onToggle={() => (playing ? stop() : void play(passage, bpm))} />
        </div>
      ) : null}
    </div>
  );
}
