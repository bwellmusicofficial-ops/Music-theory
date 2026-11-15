'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { Keyboard } from '@/components/keyboard';
import { RhythmPad } from '@/components/rhythm-pad';
// Deep import: the hook is not part of the pad, and the player's tests replace the pad module with a stand-in.
import { useTapAlong } from '@/components/rhythm-pad/use-tap-along';
import type { TimeSignature } from '@/engine/types';
import { Button } from '@/components/ui';
import { pitch as pitchEngine } from '@/engine/pitch';
import type { LearnerSettings } from '../contracts';
import type { Exhibit, Lesson } from '../schema';
import { ActionBar } from './action-bar';
import { DevErrorCard } from './dev-error-card';
import { ExhibitView, isPassage, keyboardRange } from './exhibit-view';
import { makeGlossaryLookup, type GlossarySource } from './rich-text';
import { RichTextView } from './rich-text-view';
import { ScreenHeading } from './screen-heading';
import type { ExhibitRenderers } from './types';

export interface ExploreStageProps {
  step: Lesson['steps']['explore'];
  settings: LearnerSettings;
  glossary: GlossarySource;
  renderers?: ExhibitRenderers;
  done: boolean;
  onInteract: () => void;
  onContinue: () => void;
  onBack: () => void;
}

const DEFAULT_TEMPO = 80;
const NO_BARS: never[] = [];
const FALLBACK_TIME: TimeSignature = { beats: 4, beatUnit: 4 };

/** The explore step: the named instrument, the goal, and Continue once the learner has touched it. */
export function ExploreStage({ step, settings, glossary, renderers, done, onInteract, onContinue, onBack }: ExploreStageProps) {
  const lookup = useMemo(() => makeGlossaryLookup(glossary), [glossary]);
  const terminology = settings.terminology;
  const exhibit = step.exhibit;

  const passage = exhibit?.kind === 'passage' && isPassage(exhibit.passage) ? exhibit.passage : null;
  const padBroken = step.instrument === 'rhythm-pad' && !passage;
  // Live play-along: the tapped notes light up in order and the current beat's note pulses.
  const along = useTapAlong({ bars: passage?.bars ?? NO_BARS, time: passage?.time ?? FALLBACK_TIME, mode: 'free' });
  const { onTap: lightTap } = along.handlers;
  const handleTap = useCallback(
    (count: number) => {
      lightTap(count);
      onInteract();
    },
    [lightTap, onInteract],
  );

  // A broken rhythm-pad setup must not trap the learner on this screen.
  useEffect(() => {
    if (padBroken) onInteract();
  }, [padBroken, onInteract]);

  const keyboardExhibit = exhibit?.kind === 'keyboard' ? exhibit : undefined;
  const range = useMemo(() => keyboardRange(keyboardExhibit), [keyboardExhibit]);
  const highlight = useMemo(
    () =>
      (keyboardExhibit?.highlight ?? []).flatMap((t) => {
        try {
          return [{ pitch: pitchEngine.parsePitch(t), state: 'target' as const }];
        } catch {
          return [];
        }
      }),
    [keyboardExhibit],
  );

  let instrument;
  if (step.instrument === 'keyboard') {
    const extra: Exhibit | undefined = exhibit && exhibit.kind !== 'keyboard' ? exhibit : undefined;
    instrument = (
      <div className="flex flex-col gap-4">
        {extra ? <ExhibitView exhibit={extra} renderers={renderers} sound={settings.soundOn} onInteract={onInteract} /> : null}
        <div role="group" aria-label="Piano keyboard to explore">
          <Keyboard
            low={range.low}
            high={range.high}
            showLabels
            highlight={highlight}
            sound={settings.soundOn}
            onNote={onInteract}
          />
        </div>
      </div>
    );
  } else if (step.instrument === 'rhythm-pad') {
    if (passage && exhibit?.kind === 'passage') {
      instrument = (
        <RhythmPad
          mode="free"
          bars={passage.bars}
          time={passage.time}
          bpm={exhibit.tempo ?? DEFAULT_TEMPO}
          {...along.handlers}
          onTap={handleTap}
          reducedMotion={settings.reducedMotion}
          onComplete={() => {}}
        >
          <ExhibitView
            exhibit={exhibit}
            renderers={renderers}
            sound={settings.soundOn}
            label="The rhythm to play along with"
            marks={along.marks}
            cursor={along.cursor}
          />
        </RhythmPad>
      );
    } else {
      instrument = (
        <DevErrorCard
          title="This explore step needs a passage exhibit"
          detail="instrument is 'rhythm-pad', so exhibit must be { kind: 'passage', passage, tempo? } with a valid passage."
        />
      );
    }
  } else {
    instrument = exhibit ? (
      <ExhibitView exhibit={exhibit} renderers={renderers} sound={settings.soundOn} label="Musical example to explore" onInteract={onInteract} />
    ) : null;
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-6">
        <ScreenHeading eyebrow="Explore">Try it</ScreenHeading>
        <p className="text-lg text-fg-secondary">
          <RichTextView text={step.text} terminology={terminology} glossary={lookup} />
        </p>
        <div className="rounded-lg border-2 border-accent bg-surface p-4" data-testid="goal">
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Your goal</p>
          <p className="mt-1 text-lg font-semibold">
            <RichTextView text={step.goal} terminology={terminology} glossary={lookup} />
          </p>
        </div>
        {instrument}
        <p className="text-sm text-muted" data-testid="explore-status">
          {done ? 'Nice. Continue whenever you are ready.' : 'Have a go to unlock Continue.'}
        </p>
      </div>
      <ActionBar>
        <Button variant="ghost" size="lg" onClick={onBack}>
          Back
        </Button>
        <Button size="lg" onClick={onContinue} disabled={!done}>
          Continue
        </Button>
      </ActionBar>
    </>
  );
}
