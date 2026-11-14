'use client';

import { useId } from 'react';
import { Button } from '@/components/ui';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

export interface ChoiceProps<T extends string> {
  legend: string;
  description?: string;
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** One setting with two or three named options, shown as a row of toggle buttons. */
export function Choice<T extends string>({ legend, description, options, value, onChange }: ChoiceProps<T>) {
  const descriptionId = useId();
  return (
    <fieldset className="m-0 border-0 p-0" aria-describedby={description ? descriptionId : undefined}>
      <legend className="mb-1 p-0 text-lg font-bold">{legend}</legend>
      {description ? (
        <p id={descriptionId} className="mb-2 text-fg-secondary">
          {description}
        </p>
      ) : null}
      <div role="group" aria-label={legend} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Button
              key={option.value}
              size="lg"
              variant={selected ? 'primary' : 'secondary'}
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className="min-w-28"
            >
              {selected ? <span aria-hidden="true">&#10003;</span> : null}
              {option.label}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}
