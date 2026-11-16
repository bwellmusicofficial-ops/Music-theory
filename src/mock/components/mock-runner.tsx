'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAudioEngine } from '@/audio';
import { Button } from '@/components/ui';
import { generators } from '@/lesson/generators';
import { LessonContextProvider } from '@/lesson/player';
import { questionTypes as defaultQuestionTypes } from '@/lesson/questions';
import type { GeneratorRegistry, LearnerSettings, QuestionTypeRegistry } from '@/lesson/contracts';
import type { GlossaryEntry } from '@/lesson/schema';
import '@/lesson/setup';
import { buildPaper, createMockTest, type Clock, type LessonRef, type MockTest, systemClock } from '../engine';
import { configQuestionCount, type MockConfig } from '../schema';
import { createLocalMockResultSink, toAttempt, type MockResultSink } from '../store';
import { IntroScreen } from './intro-screen';
import { QuestionPanels } from './question-panels';
import { ResultsScreen, ReviewExplanation, ReviewHeader, type LessonLink } from './results-screen';
import { TestFooter, TestHeader } from './test-chrome';
import { useBestResult } from './use-best-result';
import { useMockTest } from './use-mock-test';

export interface MockRunnerProps {
  config: MockConfig;
  glossary: readonly GlossaryEntry[];
  settings: LearnerSettings;
  /** Lessons that can be linked to from the weak skills. */
  lessons: readonly (LessonRef & { title: string })[];
  sink?: MockResultSink;
  questionTypes?: QuestionTypeRegistry;
  generatorRegistry?: GeneratorRegistry;
  clock?: Clock;
  /** Chooses the paper's seed. Default: from the clock. */
  makeSeed?: () => number;
}

function warn(what: string, e: unknown) {
  if (typeof console !== 'undefined') console.warn(`MockRunner: ${what} failed`, e);
}

/** Intro, test and results of one mock test. The one place that wires the engine to the screens. */
export function MockRunner(props: MockRunnerProps) {
  const {
    config,
    glossary,
    settings,
    lessons,
    questionTypes = defaultQuestionTypes,
    generatorRegistry = generators,
    clock = systemClock,
    makeSeed = () => Math.floor(clock.now() % 2_147_483_647),
  } = props;
  const [defaultSink] = useState(() => createLocalMockResultSink());
  const sink = props.sink ?? defaultSink;
  const [test, setTest] = useState<MockTest | null>(null);
  const [runs, setRuns] = useState(0);
  const { best } = useBestResult(sink, config.id, runs);

  const start = useCallback(() => {
    const paper = buildPaper(config, makeSeed(), {
      generators: generatorRegistry,
      questionTypes,
      terminology: settings.terminology,
    });
    setTest(createMockTest({ config, paper, questionTypes, clock, untimed: settings.untimed, lessons }));
  }, [config, makeSeed, generatorRegistry, questionTypes, settings.terminology, settings.untimed, clock, lessons]);

  const lessonLinks: LessonLink[] = useMemo(() => lessons.map((l) => ({ id: l.id, title: l.title })), [lessons]);

  if (test === null) {
    return (
      <Frame>
        <IntroScreen
          config={config}
          untimed={settings.untimed}
          best={best}
          questionCount={configQuestionCount(config)}
          onStart={() => {
            try {
              getAudioEngine().unlock().catch(() => {});
            } catch {
              // Sound is best effort and the paper needs none.
            }
            start();
          }}
        />
      </Frame>
    );
  }

  return (
    <LessonContextProvider settings={settings} glossary={glossary}>
      <Frame>
        <Running
          test={test}
          config={config}
          glossary={glossary}
          settings={settings}
          questionTypes={questionTypes}
          lessons={lessonLinks}
          sink={sink}
          onAgain={() => {
            setTest(null);
            setRuns((r) => r + 1);
          }}
        />
      </Frame>
    </LessonContextProvider>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4">{children}</div>;
}

interface RunningProps {
  test: MockTest;
  config: MockConfig;
  glossary: readonly GlossaryEntry[];
  settings: LearnerSettings;
  questionTypes: QuestionTypeRegistry;
  lessons: LessonLink[];
  sink: MockResultSink;
  onAgain: () => void;
}

/** The test screen while the clock runs, then the results and the review. */
function Running({ test, config, glossary, settings, questionTypes, lessons, sink, onAgain }: RunningProps) {
  const state = useMockTest(test);
  const { paper } = test;
  const result = state.result;
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const top = useRef<HTMLDivElement>(null);

  // Save each finished attempt once.
  const saved = useRef<unknown>(null);
  useEffect(() => {
    if (!result || saved.current === result) return;
    saved.current = result;
    sink.save(toAttempt(result)).catch((e) => warn('saving the result', e));
  }, [result, sink]);

  const finished = result !== null;
  // Each screen starts at the top.
  useEffect(() => {
    top.current?.scrollIntoView?.({ block: 'start' });
    if (typeof window !== 'undefined') window.scrollTo?.({ top: 0 });
  }, [reviewIndex, finished]);

  const flag = useCallback((i: number) => test.toggleFlag(i), [test]);
  const goTo = useCallback((i: number) => test.goTo(i), [test]);
  const onAnswer = useCallback((i: number, a: unknown) => test.setAnswer(i, a), [test]);
  const onClear = useCallback((i: number) => test.clearAnswer(i), [test]);
  const onSkip = useCallback((i: number) => test.goTo(i + 1), [test]);

  const common = {
    questions: paper.questions,
    answers: state.answers,
    results: result?.questions,
    questionTypes,
    terminology: settings.terminology,
    glossary,
    onAnswer,
    onClear,
    onSkip,
  };

  const n = paper.questions.length;

  return (
    <div className="flex flex-1 flex-col" ref={top}>
      {finished ? null : paper.problems.length > 0 ? (
        <p role="note" className="mt-3 rounded-md border border-warning p-3 text-sm text-fg-secondary">
          {paper.problems.length} question{paper.problems.length === 1 ? '' : 's'} could not be built and left out.
        </p>
      ) : null}

      {result === null ? (
        <TestHeader key="top" paper={paper} state={state} onGoTo={goTo} onFinish={() => test.submit()} />
      ) : reviewIndex !== null ? (
        <ReviewHeader key="top" result={result} index={reviewIndex} />
      ) : (
        <ResultsScreen
          key="top"
          config={config}
          result={result}
          lessons={lessons}
          terminology={settings.terminology}
          glossary={glossary}
          onReview={setReviewIndex}
          onRetry={onAgain}
        />
      )}

      <div key="panels" className={result === null ? 'flex flex-1 flex-col pt-5' : 'flex flex-col'}>
        <QuestionPanels
          {...common}
          visible={result === null ? state.current : reviewIndex}
          mode={result === null ? 'test' : 'review'}
        />
      </div>

      {result === null ? (
        <TestFooter key="bottom" paper={paper} state={state} onGoTo={goTo} onFlag={flag} />
      ) : reviewIndex !== null ? (
        <div key="bottom" className="flex flex-col">
          <ReviewExplanation result={result} index={reviewIndex} terminology={settings.terminology} glossary={glossary} />
          <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex gap-2 border-t border-border-subtle bg-bg px-4 pt-3 pb-4">
            <Button variant="secondary" size="lg" disabled={reviewIndex === 0} onClick={() => setReviewIndex(reviewIndex - 1)}>
              Previous
            </Button>
            <Button variant="primary" size="lg" className="flex-1" aria-label="Back to results" onClick={() => setReviewIndex(null)}>
              Results
            </Button>
            <Button variant="secondary" size="lg" disabled={reviewIndex === n - 1} onClick={() => setReviewIndex(reviewIndex + 1)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
