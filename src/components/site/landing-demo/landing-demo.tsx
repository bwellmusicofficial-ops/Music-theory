'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, FeedbackBanner } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import type { MarkResult } from '@/lesson/contracts';
import { LessonContextProvider, RichTextView } from '@/lesson/player';
import type { QuestionTypeRegistry } from '@/lesson/contracts';
import { questionTypes as defaultQuestionTypes } from '@/lesson/questions';
import '@/lesson/setup';
import { useSettings } from '@/settings';
import { buttonClasses } from '../button-link';
import { IconArrowRight } from '../icons';
import type { LandingDemoContent } from './content';

export interface LandingDemoProps {
  content: LandingDemoContent;
  /** The first "Start here" lesson. */
  startHref: string;
  /** Where "Browse lessons" goes. */
  browseHref?: string;
  /** New visitors see step 1 at once; returning learners see a compact card first. */
  defaultOpen: boolean;
  /** The question types to draw with. Default: the app's own; tests pass stand-ins for the audio ones. */
  questionTypes?: QuestionTypeRegistry;
  /** Called with true while the finish card shows and false otherwise, so the page can hide its own duplicate buttons. */
  onFinishChange?: (finished: boolean) => void;
}

function isNarrow(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 319px)').matches;
}

type View = { kind: 'closed' } | { kind: 'step'; index: number; result: MarkResult | null } | { kind: 'finish' };

const STEP_COUNT = 2;
/** Dots: the two questions and the finish card. */
const DOT_COUNT = STEP_COUNT + 1;

function Dots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="flex items-center gap-1.5">
        {Array.from({ length: DOT_COUNT }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-2.5 rounded-full border-2 border-accent transition-[width,background-color] duration-(--motion-duration-fast)',
              i < current && 'w-2.5 bg-accent',
              i === current && 'w-6 bg-accent',
              i > current && 'w-2.5 bg-transparent',
            )}
          />
        ))}
      </span>
      <p className="text-sm font-bold text-fg-secondary">{`Step ${current + 1} of ${DOT_COUNT}`}</p>
    </div>
  );
}

/**
 * A 30-second taster of how a lesson works, shown on the landing page with no sign-up:
 * one question to answer by looking (the multiple-choice type), one to tap (the rhythm
 * pad), then a card that leads into the first lesson. It uses the real question
 * components and the audio engine's own unlock (the pad's Start button is the gesture).
 * Nothing is stored or sent anywhere: the state lives in this component.
 */
export function LandingDemo({ content, startHref, browseHref = '/learn', defaultOpen, questionTypes = defaultQuestionTypes, onFinishChange }: LandingDemoProps) {
  const { settings } = useSettings();
  const terminology = settings.terminology;
  // On a viewport under 320px (a phone at 200% zoom or more) a stave cannot fit beside its answer button,
  // so the demo starts as the compact card there; "Try it" still opens it.
  const [view, setView] = useState<View>(() =>
    defaultOpen && !isNarrow() ? { kind: 'step', index: 0, result: null } : { kind: 'closed' },
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Focus moves to the new heading after the learner's own action, never on first load.
  const moved = useRef(false);
  const viewKey = view.kind === 'step' ? `step-${view.index}` : view.kind;
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [viewKey]);

  const finished = view.kind === 'finish';
  useEffect(() => {
    onFinishChange?.(finished);
    return () => onFinishChange?.(false);
  }, [finished, onFinishChange]);

  const go = (next: View) => {
    moved.current = true;
    setView(next);
  };

  if (view.kind === 'closed') {
    return (
      <section
        aria-labelledby="demo-title"
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-3xl border border-border-subtle bg-surface p-4 shadow-md sm:p-5"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="demo-title" ref={headingRef} tabIndex={-1} className="text-lg font-extrabold tracking-tight outline-none">
            Try a 30-second demo
          </h2>
          <p className="text-sm text-fg-secondary">Hear it, tap it, see how a lesson feels. No sign-up.</p>
        </div>
        <Button variant="secondary" size="md" onClick={() => go({ kind: 'step', index: 0, result: null })}>
          Try it
        </Button>
      </section>
    );
  }

  const current = view.kind === 'finish' ? STEP_COUNT : view.index;
  return (
    <LessonContextProvider settings={settings} glossary={content.glossary}>
      <section
        aria-labelledby="demo-title"
        className="relative flex flex-col gap-4 overflow-hidden rounded-3xl border border-border-subtle bg-surface p-4 shadow-lg sm:p-6"
      >
        <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-accent opacity-15 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 id="demo-title" className="sr-only">
            Try it now: a 30-second demo
          </h2>
          <Dots current={current} />
          {view.kind === 'step' ? (
            <Button variant="ghost" size="md" onClick={() => go({ kind: 'closed' })}>
              Skip demo
            </Button>
          ) : null}
        </div>
        {view.kind === 'step' ? (
          <DemoStep
            key={view.index}
            index={view.index}
            content={content}
            questionTypes={questionTypes}
            result={view.result}
            terminology={terminology}
            headingRef={headingRef}
            onResult={(result) => setView({ kind: 'step', index: view.index, result })}
            onNext={() => go(view.index + 1 < STEP_COUNT ? { kind: 'step', index: view.index + 1, result: null } : { kind: 'finish' })}
          />
        ) : (
          <div className="relative flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h3 ref={headingRef} tabIndex={-1} className="text-2xl font-extrabold leading-tight tracking-tight outline-none">
                That&rsquo;s how every lesson works.
              </h3>
              <p className="text-fg-secondary">Hear it, try it, get feedback straight away. Ready for the real thing?</p>
            </div>
            <div className="flex flex-col gap-3">
              <Link href={startHref} className={buttonClasses('primary', 'lg', 'w-full')}>
                Start the first lesson
                <IconArrowRight width={20} height={20} />
              </Link>
              <Link href={browseHref} className={buttonClasses('secondary', 'lg', 'w-full')}>
                Browse lessons
              </Link>
              <Link href="/learn#grade-1" className="inline-flex min-h-11 items-center justify-center self-center rounded-md px-3 text-base font-semibold underline underline-offset-4 hover:text-accent-hover">
                I already know some theory
              </Link>
              <Button variant="ghost" size="md" className="self-center" onClick={() => go({ kind: 'step', index: 0, result: null })}>
                Try the demo again
              </Button>
            </div>
          </div>
        )}
      </section>
    </LessonContextProvider>
  );
}

function DemoStep({
  index,
  content,
  questionTypes,
  result,
  terminology,
  headingRef,
  onResult,
  onNext,
}: {
  index: number;
  content: LandingDemoContent;
  questionTypes: QuestionTypeRegistry;
  result: MarkResult | null;
  terminology: 'uk' | 'us';
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onResult: (result: MarkResult) => void;
  onNext: () => void;
}) {
  const step = content.steps[index]!;
  const mod = questionTypes[step.type];
  const parsed = useMemo(() => (mod ? mod.payloadSchema.safeParse(step.payload) : null), [mod, step.payload]);
  const answered = useRef(false);
  const [problem, setProblem] = useState(false);
  const nextRef = useRef<HTMLDivElement>(null);
  // Answering disables the options, so focus would be lost: put it on the way forward.
  useEffect(() => {
    if (result) nextRef.current?.querySelector('button')?.focus();
  }, [result]);
  const rich = (text: string) => <RichTextView text={text} terminology={terminology} glossary={content.glossary} linksAsText />;

  if (!mod || !parsed?.success || problem) {
    // Never leave a visitor stuck: if a question cannot be drawn, offer the way on.
    return (
      <div className="flex flex-col gap-3">
        <h3 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
          This demo question could not be shown.
        </h3>
        <Button size="lg" onClick={onNext}>
          Carry on
        </Button>
      </div>
    );
  }
  const Comp = mod.Component;

  function handleAnswer(answer: unknown) {
    if (answered.current || !mod || !parsed?.success) return;
    try {
      const marked = mod.mark(parsed.data, answer);
      answered.current = true;
      onResult(marked);
    } catch {
      setProblem(true);
    }
  }

  const last = index + 1 >= STEP_COUNT;
  return (
    <div className="relative flex flex-col gap-4">
      <h3 ref={headingRef} tabIndex={-1} className="text-lg font-extrabold leading-snug tracking-tight outline-none sm:text-2xl">
        {rich(step.prompt)}
      </h3>
      <Comp
        payload={parsed.data}
        terminology={terminology}
        locked={result !== null}
        result={result}
        onAnswer={handleAnswer}
      />
      {result ? (
        <>
          <FeedbackBanner
            kind={result.correct ? 'correct' : 'wrong'}
            reason={result.correct ? rich(step.rightReason) : result.reason ? rich(result.reason) : 'Not quite.'}
          />
          <div ref={nextRef}>
            <Button size="lg" onClick={onNext} className="w-full">
              {last ? 'Finish' : 'Next'}
              <IconArrowRight width={20} height={20} />
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
