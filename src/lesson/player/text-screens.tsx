'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui';
import type { LearnerSettings } from '../contracts';
import type { Exhibit } from '../schema';
import { ActionBar } from './action-bar';
import { ExhibitView } from './exhibit-view';
import { makeGlossaryLookup, type GlossarySource } from './rich-text';
import { RichTextView } from './rich-text-view';
import { ScreenHeading } from './screen-heading';
import type { ExhibitRenderers } from './types';

interface Common {
  settings: LearnerSettings;
  glossary: GlossarySource;
  renderers?: ExhibitRenderers;
}

function useLookup(glossary: GlossarySource) {
  return useMemo(() => makeGlossaryLookup(glossary), [glossary]);
}

export function HookScreen({
  title,
  text,
  exhibit,
  onContinue,
  settings,
  glossary,
  renderers,
}: Common & { title: string; text: string; exhibit?: Exhibit; onContinue: () => void }) {
  const lookup = useLookup(glossary);
  return (
    <>
      <div className="flex flex-1 flex-col gap-6">
        <ScreenHeading eyebrow="Hook">{title}</ScreenHeading>
        <p className="text-xl leading-relaxed">
          <RichTextView text={text} terminology={settings.terminology} glossary={lookup} />
        </p>
        {exhibit ? <ExhibitView exhibit={exhibit} renderers={renderers} sound={settings.soundOn} label="Listen to this" /> : null}
      </div>
      <ActionBar>
        <Button size="lg" onClick={onContinue}>
          Continue
        </Button>
      </ActionBar>
    </>
  );
}

export function NameScreen({
  index,
  count,
  card,
  alternative,
  alternativeShown,
  onShowAlternative,
  onContinue,
  onBack,
  settings,
  glossary,
  renderers,
}: Common & {
  index: number;
  count: number;
  card: { text: string; exhibit?: Exhibit };
  alternative: { text: string; exhibit?: Exhibit };
  alternativeShown: boolean;
  onShowAlternative: () => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const lookup = useLookup(glossary);
  const t = settings.terminology;
  return (
    <>
      <div className="flex flex-1 flex-col gap-6">
        <ScreenHeading eyebrow={`Name it ${index + 1} of ${count}`}>The idea</ScreenHeading>
        <p className="text-xl leading-relaxed" data-testid="name-card">
          <RichTextView text={card.text} terminology={t} glossary={lookup} />
        </p>
        {card.exhibit ? (
          <ExhibitView exhibit={card.exhibit} renderers={renderers} sound={settings.soundOn} label="Example for this card" />
        ) : null}
        {alternativeShown ? (
          <section
            aria-label="Another way to see it"
            data-testid="name-alternative"
            className="flex flex-col gap-4 rounded-lg border-2 border-accent bg-surface p-5"
          >
            <p className="text-xs font-bold uppercase tracking-widest text-accent">Another way</p>
            <p className="text-lg leading-relaxed">
              <RichTextView text={alternative.text} terminology={t} glossary={lookup} />
            </p>
            {alternative.exhibit ? (
              <ExhibitView exhibit={alternative.exhibit} renderers={renderers} sound={settings.soundOn} label="Example for the other explanation" />
            ) : null}
          </section>
        ) : (
          <Button variant="secondary" size="md" onClick={onShowAlternative} className="self-start">
            Explain it another way
          </Button>
        )}
      </div>
      <ActionBar>
        <Button variant="ghost" size="lg" onClick={onBack}>
          Back
        </Button>
        <Button size="lg" onClick={onContinue}>
          Continue
        </Button>
      </ActionBar>
    </>
  );
}

export function RecapScreen({
  title,
  points,
  exhibit,
  onFinish,
  settings,
  glossary,
  renderers,
}: Common & { title: string; points: string[]; exhibit?: Exhibit; onFinish: () => void }) {
  const lookup = useLookup(glossary);
  return (
    <>
      <div className="flex flex-1 flex-col gap-6">
        <ScreenHeading eyebrow="Recap">{title}</ScreenHeading>
        <ul className="flex flex-col gap-3" data-testid="recap-points">
          {points.map((p, i) => (
            <li key={i} className="rounded-lg border border-border-subtle bg-surface p-4 text-lg leading-relaxed">
              <RichTextView text={p} terminology={settings.terminology} glossary={lookup} />
            </li>
          ))}
        </ul>
        {exhibit ? <ExhibitView exhibit={exhibit} renderers={renderers} sound={settings.soundOn} label="The idea in notation" /> : null}
      </div>
      <ActionBar>
        <Button size="lg" onClick={onFinish}>
          Finish
        </Button>
      </ActionBar>
    </>
  );
}
