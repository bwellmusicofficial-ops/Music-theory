'use client';

import { useMemo, useState } from 'react';
import { createRng } from '@/engine/rng';
import { generators } from '@/lesson/generators';
import { LessonContextProvider, QuestionBoundary, type ResolvedQuestion } from '@/lesson/player';
import type { QuestionRun } from '@/lesson/player/machine';
import { QuestionStage } from '@/lesson/player/question-stage';
import { questionTypes } from '@/lesson/questions';
import type { GlossaryEntry, Question } from '@/lesson/schema';
import '@/lesson/setup';
import { useSettings } from '@/settings';

const fresh = (): QuestionRun => ({ phase: 'answering', attempt: 1, startedAt: 0, result: null, outcome: null });

/** Resolves a question the way the player's machine does (same generator call), but with an explicit seed. */
function resolve(question: Question, seed: number, terminology: 'uk' | 'us'): ResolvedQuestion {
  const base = { slot: 0, questionId: question.id, skill: question.skill };
  if (question.source === 'authored') {
    return { ...base, type: question.type, payload: question.payload, prompt: question.prompt };
  }
  const failed = (error: string): ResolvedQuestion => ({ ...base, type: question.type, payload: undefined, prompt: question.prompt, seed, error });
  const generator = generators[question.generator.id];
  if (!generator) return failed(`No generator is registered with id "${question.generator.id}".`);
  const params = generator.paramsSchema.safeParse(question.generator.params);
  if (!params.success) return failed(`Generator "${question.generator.id}" rejected its params: ${params.error.message}`);
  try {
    const made = generator.generate(params.data, createRng(seed), terminology);
    return { ...base, type: made.type, payload: made.payload, prompt: made.prompt ?? question.prompt, seed };
  } catch (e) {
    return failed(`Generator "${question.generator.id}" threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function QuestionHarness({ lessonId, question, seed, glossary }: { lessonId: string; question: Question; seed: number; glossary: GlossaryEntry[] }) {
  const { settings, loaded } = useSettings();
  const [run, setRun] = useState<QuestionRun>(fresh);
  const [epoch, setEpoch] = useState(0);
  const item = useMemo(() => resolve(question, seed, settings.terminology), [question, seed, settings.terminology]);
  if (!loaded) return <p role="status">Loading</p>;
  return (
    <LessonContextProvider settings={settings} glossary={glossary}>
      <div
        className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-6"
        data-testid="question-harness"
        data-lesson={lessonId}
        data-question-id={question.id}
        data-question-type={item.type}
        data-question-json={JSON.stringify({ type: item.type, payload: item.payload ?? null, prompt: item.prompt, seed: item.seed ?? null, error: item.error ?? null })}
      >
        <button type="button" data-testid="harness-reset" className="mb-4 self-start rounded border px-2 py-1 text-sm" onClick={() => { setRun(fresh()); setEpoch((n) => n + 1); }}>
          Reset question
        </button>
        <QuestionBoundary questionId={question.id} onSkip={() => {}}>
          <QuestionStage
            key={epoch}
            mode="challenge"
            item={{ ...item, hint: undefined }}
            run={run}
            eyebrow={`Harness: ${question.id}`}
            settings={settings}
            glossary={glossary}
            questionTypes={questionTypes}
            onResult={(result) => setRun({ ...run, phase: 'feedback', result, outcome: result.correct ? 'correct' : 'wrong' })}
            onSkip={() => {}}
            onContinue={() => {}}
          />
        </QuestionBoundary>
      </div>
    </LessonContextProvider>
  );
}
