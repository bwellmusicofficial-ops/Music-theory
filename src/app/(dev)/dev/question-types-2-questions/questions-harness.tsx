'use client';

import { useMemo, useState } from 'react';
import { createRng } from '@/engine/rng';
import { generators } from '@/lesson/generators';
import { LessonContextProvider, QuestionBoundary, type ResolvedQuestion } from '@/lesson/player';
import type { QuestionRun } from '@/lesson/player/machine';
import { QuestionStage } from '@/lesson/player/question-stage';
import { questionTypes } from '@/lesson/questions';
import type { GlossaryEntry } from '@/lesson/schema';
import '@/lesson/setup';
import { useSettings } from '@/settings';
import { AUTHORED, GENERATORS } from './fixtures';

const fresh = (): QuestionRun => ({ phase: 'answering', attempt: 1, startedAt: 0, result: null, outcome: null });

interface Item {
  /** Test id suffix: `qt2q-<id>`. */
  id: string;
  type: string;
  prompt: string;
  payload: unknown;
  seed?: number;
}

function Playing({ item, glossary, settings }: { item: Item; glossary: GlossaryEntry[]; settings: ReturnType<typeof useSettings>['settings'] }) {
  const [run, setRun] = useState<QuestionRun>(fresh);
  const [epoch, setEpoch] = useState(0);
  const resolved: ResolvedQuestion = {
    slot: 0,
    questionId: item.id,
    skill: 'harness.skill',
    type: item.type as ResolvedQuestion['type'],
    payload: item.payload,
    prompt: item.prompt,
    seed: item.seed,
  };
  return (
    <section
      className="flex flex-col"
      data-testid={`qt2q-${item.id}`}
      data-question-type={item.type}
      data-question-json={JSON.stringify({ type: item.type, payload: item.payload, prompt: item.prompt, seed: item.seed ?? null })}
    >
      <button type="button" data-testid={`qt2q-${item.id}-reset`} className="mb-4 self-start rounded border px-2 py-1 text-sm" onClick={() => { setRun(fresh()); setEpoch((n) => n + 1); }}>
        Reset question
      </button>
      <QuestionBoundary questionId={item.id} onSkip={() => {}}>
        <QuestionStage
          key={epoch}
          mode="challenge"
          item={{ ...resolved, hint: undefined }}
          run={run}
          eyebrow={`Harness: ${item.id}`}
          settings={settings}
          glossary={glossary}
          questionTypes={questionTypes}
          onResult={(result) => setRun({ ...run, phase: 'feedback', result, outcome: result.correct ? 'correct' : 'wrong' })}
          onSkip={() => {}}
          onContinue={() => {}}
        />
      </QuestionBoundary>
    </section>
  );
}

export function QuestionsHarness({ seed, glossary }: { seed: number; glossary: GlossaryEntry[] }) {
  const { settings, loaded } = useSettings();
  const terminology = settings.terminology;
  const items = useMemo<Item[]>(() => {
    const made = GENERATORS.map(({ id, params }) => {
      const generator = generators[id]!;
      const out = generator.generate(generator.paramsSchema.parse(params), createRng(seed), terminology);
      return { id: `gen-${id}`, type: out.type, prompt: out.prompt ?? '', payload: out.payload, seed };
    });
    return [...AUTHORED, ...made];
  }, [seed, terminology]);
  if (!loaded) return <p role="status">Loading</p>;
  return (
    <LessonContextProvider settings={settings} glossary={glossary}>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-16 px-4 py-6" data-testid="qt2q-harness">
        {items.map((item) => (
          <Playing key={item.id} item={item} glossary={glossary} settings={settings} />
        ))}
      </div>
    </LessonContextProvider>
  );
}
