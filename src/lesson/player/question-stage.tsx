'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, FeedbackBanner } from '@/components/ui';
import type { LearnerSettings, MarkResult, QuestionTypeRegistry } from '../contracts';
import { ActionBar } from './action-bar';
import { DevErrorCard } from './dev-error-card';
import type { QuestionRun, ResolvedQuestion } from './machine';
import { QuestionBoundary } from './question-boundary';
import { makeGlossaryLookup, type GlossarySource } from './rich-text';
import { RichTextView } from './rich-text-view';
import { ScreenHeading } from './screen-heading';

export interface QuestionStageProps {
  mode: 'practice' | 'challenge';
  item: ResolvedQuestion;
  run: QuestionRun;
  eyebrow: string;
  settings: LearnerSettings;
  glossary: GlossarySource;
  questionTypes: QuestionTypeRegistry;
  onResult: (result: MarkResult) => void;
  onSkip: () => void;
  onContinue: () => void;
  onBack?: () => void;
  /** Label of the primary button while feedback shows (not used when a hint retry). */
  continueLabel?: string;
}

/**
 * One question: prompt, the type's component, then feedback. Validates the
 * payload first and shows a developer error card (with Skip) when the type is
 * not registered, the payload is invalid, or the question could not be built.
 */
export function QuestionStage({
  mode,
  item,
  run,
  eyebrow,
  settings,
  glossary,
  questionTypes,
  onResult,
  onSkip,
  onContinue,
  onBack,
  continueLabel = 'Continue',
}: QuestionStageProps) {
  const [markError, setMarkError] = useState<string | null>(null);
  const answered = useRef(false);
  const lookup = useMemo(() => makeGlossaryLookup(glossary), [glossary]);
  const mod = questionTypes[item.type];

  const parsed = useMemo(() => {
    if (item.error || !mod) return null;
    return mod.payloadSchema.safeParse(item.payload);
  }, [item, mod]);

  const feedback = run.phase === 'feedback';
  const terminology = settings.terminology;
  const prompt = (
    <RichTextView text={item.prompt} terminology={terminology} glossary={lookup} />
  );

  let problem: { title: string; detail: string } | null = null;
  if (item.error) {
    problem = { title: `Question "${item.questionId}" could not be built`, detail: item.error };
  } else if (!mod) {
    problem = {
      title: `No question type "${item.type}" is registered`,
      detail: `Question "${item.questionId}" needs the "${item.type}" module in the question-type registry.`,
    };
  } else if (parsed && !parsed.success) {
    problem = {
      title: `Question "${item.questionId}" has an invalid ${item.type} payload`,
      detail: parsed.error.issues
        .map((i) => `${i.path.length ? i.path.join('.') : '(payload)'}: ${i.message}`)
        .join('\n'),
    };
  } else if (markError) {
    problem = { title: `Question "${item.questionId}" could not be marked`, detail: markError };
  }

  function handleAnswer(answer: unknown) {
    if (answered.current || run.phase !== 'answering' || !mod || !parsed || !parsed.success) return;
    let result: MarkResult;
    try {
      result = mod.mark(parsed.data, answer);
    } catch (e) {
      setMarkError(e instanceof Error ? e.message : String(e));
      return;
    }
    answered.current = true;
    onResult(result);
  }

  const showHint = mode === 'practice' && run.attempt === 2 && !feedback && item.hint;
  let banner: { kind: 'correct' | 'wrong'; reason: ReactNode } | null = null;
  const rich = (text: string) => <RichTextView text={text} terminology={terminology} glossary={lookup} />;
  if (feedback && run.result) {
    const r = run.result;
    if (run.outcome === 'retry' && item.hint) {
      banner = { kind: 'wrong', reason: <>Hint: {rich(item.hint)}</> };
    } else if (r.correct) {
      banner = { kind: 'correct', reason: r.reason ? rich(r.reason) : "That's right." };
    } else {
      banner = { kind: 'wrong', reason: r.reason ? rich(r.reason) : 'Not quite.' };
    }
  }

  const Comp = mod?.Component;
  const retry = run.outcome === 'retry';

  return (
    <>
      <div className="flex flex-1 flex-col gap-6">
        <ScreenHeading eyebrow={eyebrow} size="lg">
          {prompt}
        </ScreenHeading>

        {showHint ? (
          <div
            data-testid="hint"
            className="rounded-md border border-warning bg-surface p-4 text-fg-secondary"
          >
            <span className="font-bold text-warning">Hint: </span>
            <RichTextView text={item.hint!} terminology={terminology} glossary={lookup} />
          </div>
        ) : null}

        {problem ? (
          <DevErrorCard title={problem.title} detail={problem.detail} onSkip={onSkip} />
        ) : Comp && parsed?.success ? (
          <QuestionBoundary questionId={item.questionId} onSkip={onSkip}>
            <Comp
              key={`${item.slot}-${run.attempt}`}
              payload={parsed.data}
              terminology={terminology}
              locked={feedback}
              result={feedback ? run.result : null}
              onAnswer={handleAnswer}
            />
          </QuestionBoundary>
        ) : null}

        {banner ? <FeedbackBanner kind={banner.kind} reason={banner.reason} /> : null}
      </div>

      <ActionBar>
        {onBack && !feedback ? (
          <Button variant="ghost" size="lg" onClick={onBack}>
            Back
          </Button>
        ) : null}
        {feedback ? (
          <Button size="lg" onClick={onContinue}>
            {retry ? 'Try again' : continueLabel}
          </Button>
        ) : null}
      </ActionBar>
    </>
  );
}
