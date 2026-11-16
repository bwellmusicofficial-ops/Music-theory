'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { PRACTICE_BPM, type StartChoice } from './engine';

export interface StartScreenProps {
  untimed: boolean;
  initialLevel: StartChoice;
  initialSeconds: 60 | 120;
  /** Best score per round length ("60", "120"), when known. */
  bests?: Record<string, number>;
  onStart: (choice: { startLevel: StartChoice; roundSeconds: 60 | 120; practice: boolean }) => void;
  onExit: () => void;
}

const LEVELS: { id: StartChoice; label: string; hint: string }[] = [
  { id: 1, label: 'New to this', hint: 'Level 1' },
  { id: 3, label: 'Getting there', hint: 'Level 3' },
  { id: 5, label: 'Bring it on', hint: 'Level 5' },
];
const LENGTHS: { id: 60 | 120; label: string }[] = [
  { id: 60, label: '60 seconds' },
  { id: 120, label: '120 seconds' },
];

function Choice<T extends string | number>(props: {
  legend: string;
  name: string;
  options: { id: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 text-sm font-bold uppercase tracking-widest text-fg-secondary">{props.legend}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${props.options.length}, minmax(0, 1fr))` }}>
        {props.options.map((o) => (
          <label key={o.id} className="flex">
            <input
              type="radio"
              name={props.name}
              value={String(o.id)}
              checked={props.value === o.id}
              onChange={() => props.onChange(o.id)}
              className="sr-only"
            />
            <span className="ti-choice">
              <span>{o.label}</span>
              {o.hint ? <span className="text-xs font-semibold text-fg-secondary">{o.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function StartScreen({ untimed, initialLevel, initialSeconds, bests, onStart, onExit }: StartScreenProps) {
  const [level, setLevel] = useState<StartChoice>(initialLevel);
  const [seconds, setSeconds] = useState<60 | 120>(initialSeconds);
  const best = bests?.[String(seconds)];
  return (
    <div className="flex flex-col gap-5 p-5 sm:p-8">
      <div>
        <h1 className="ti-title m-0">Tap It</h1>
        {untimed ? (
          <>
            <p className="mt-3 max-w-prose text-lg font-medium text-fg-secondary">
              Tap It needs timing: you read a rhythm and tap it in time with a click, so it cannot run without a clock.
            </p>
            <p className="mt-2 max-w-prose text-base text-fg-secondary">
              Slow practice is the gentle version: {PRACTICE_BPM} beats a minute, plenty of room on each tap, no score and no
              pressure. You see how many notes you hit and missed.
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 max-w-prose text-lg font-medium text-fg-secondary">
              Read the rhythm, listen to the count-in, then tap it in time. Hit every note to climb the levels!
            </p>
            {best !== undefined && best > 0 ? (
              <p className="mt-2 text-sm font-bold text-strand-rhythm">
                Best score ({seconds} seconds): {best}
              </p>
            ) : null}
          </>
        )}
      </div>
      <Choice legend="Where to start" name="ti-level" options={LEVELS} value={level} onChange={setLevel} />
      {untimed ? null : <Choice legend="Round length" name="ti-length" options={LENGTHS} value={seconds} onChange={setSeconds} />}
      <p className="m-0 max-w-prose text-sm text-fg-secondary">
        Do your taps always seem a little early or late? Try the{' '}
        <Link href="/settings" className="font-bold text-fg underline">
          tap calibration in Settings
        </Link>{' '}
        once on this device and Tap It will allow for it.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => onStart({ startLevel: level, roundSeconds: seconds, practice: untimed })}>
          {untimed ? 'Start slow practice' : 'Start'}
        </Button>
        <Button size="lg" variant="ghost" onClick={onExit}>
          Exit
        </Button>
      </div>
    </div>
  );
}
