'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import type { Terminology } from '@/engine/types';
import type { AnswerMode, RushClef } from './engine';
import { staveWord } from './position-words';

export interface StartScreenProps {
  terminology: Terminology;
  untimed: boolean;
  initialClef: RushClef;
  initialMode: AnswerMode;
  bestScore?: number;
  onStart: (choice: { clef: RushClef; answerMode: AnswerMode }) => void;
  onExit: () => void;
}

const CLEFS: { id: RushClef; label: string }[] = [
  { id: 'treble', label: 'Treble clef' },
  { id: 'bass', label: 'Bass clef' },
];
const MODES: { id: AnswerMode; label: string }[] = [
  { id: 'letters', label: 'Letter buttons' },
  { id: 'keyboard', label: 'Piano keys' },
];

function Choice<T extends string>(props: {
  legend: string;
  name: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 text-sm font-bold uppercase tracking-widest text-fg-secondary">{props.legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {props.options.map((o) => (
          <label key={o.id} className="block">
            <input
              type="radio"
              name={props.name}
              value={o.id}
              checked={props.value === o.id}
              onChange={() => props.onChange(o.id)}
              className="sr-only"
            />
            <span className="nr-choice">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function StartScreen({ terminology, untimed, initialClef, initialMode, bestScore, onStart, onExit }: StartScreenProps) {
  const [clef, setClef] = useState<RushClef>(initialClef);
  const [mode, setMode] = useState<AnswerMode>(initialMode);
  return (
    <div className="flex flex-col gap-6 p-5 sm:p-8">
      <div>
        <h1 className="nr-title m-0">Note Rush</h1>
        <p className="mt-3 max-w-prose text-lg font-medium text-fg-secondary">
          {untimed
            ? `Name each note on the ${staveWord(terminology)}. Take your time: nothing moves until you answer.`
            : `Notes fly along the ${staveWord(terminology)}. Name each one before it hits the line!`}
        </p>
        {bestScore !== undefined && bestScore > 0 ? (
          <p className="mt-2 text-sm font-bold text-strand-pitch">Best score: {bestScore}</p>
        ) : null}
      </div>
      <Choice legend="Clef" name="nr-clef" options={CLEFS} value={clef} onChange={setClef} />
      <Choice legend="Answer with" name="nr-mode" options={MODES} value={mode} onChange={setMode} />
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => onStart({ clef, answerMode: mode })}>
          Start
        </Button>
        <Button size="lg" variant="ghost" onClick={onExit}>
          Exit
        </Button>
      </div>
    </div>
  );
}
