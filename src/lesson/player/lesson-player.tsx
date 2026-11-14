'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { getAudioEngine } from '@/audio';
import type {
  GeneratorRegistry,
  LearnerSettings,
  LessonProgress,
  MarkResult,
  ProgressSink,
  QuestionTypeRegistry,
} from '../contracts';
import { STEP_ORDER, type GlossaryEntry, type Lesson, type StepId } from '../schema';
import { LessonContextProvider } from './context';
import { ChallengeIntro, ChallengeResultScreen } from './challenge-screens';
import { ExploreStage } from './explore-stage';
import {
  createInitialState,
  isExploreDone,
  progressFraction,
  reduce,
  toProgress,
  type Action,
  type MachineContext,
  type MachineState,
} from './machine';
import { QuestionStage } from './question-stage';
import { Shell } from './shell';
import { HookScreen, NameScreen, RecapScreen } from './text-screens';
import type { ExhibitRenderers, LessonCompletion } from './types';

export interface LessonPlayerProps {
  lesson: Lesson;
  glossary: readonly GlossaryEntry[] | ReadonlyMap<string, GlossaryEntry>;
  settings: LearnerSettings;
  questionTypes: QuestionTypeRegistry;
  generators: GeneratorRegistry;
  progress: ProgressSink;
  exhibitRenderers?: ExhibitRenderers;
  onExit: () => void;
  onComplete: (completion: LessonCompletion) => void;
}

type ActionInput = Action extends infer A ? (A extends { now: number } ? Omit<A, 'now'> : A) : never;

const STEP_LABEL: Record<StepId, string> = {
  hook: 'Hook',
  explore: 'Explore',
  name: 'Name it',
  practice: 'Practice',
  challenge: 'Challenge',
  recap: 'Recap',
};

function warn(what: string, e: unknown) {
  if (typeof console !== 'undefined') console.warn(`LessonPlayer: ${what} failed`, e);
}

function snapshot(s: MachineState): string {
  const p = toProgress(s, 0);
  return `${p.state}|${p.step}|${p.questionIndex}|${p.bestScore}`;
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Loads saved progress first, then hands over to the run. */
export function LessonPlayer(props: LessonPlayerProps) {
  const { lesson, progress } = props;
  const [loaded, setLoaded] = useState<{ lessonId: string; saved: LessonProgress | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    progress
      .loadLessonProgress(lesson.id)
      .catch((e) => {
        warn('loading progress', e);
        return null;
      })
      .then((saved) => {
        if (!cancelled) setLoaded({ lessonId: lesson.id, saved });
      });
    return () => {
      cancelled = true;
    };
  }, [progress, lesson.id]);

  if (!loaded || loaded.lessonId !== lesson.id) {
    return (
      <div className="flex flex-1 items-center justify-center bg-bg text-fg-secondary" role="status" data-testid="player-loading">
        Loading lesson
      </div>
    );
  }
  return <PlayerRun key={lesson.id} {...props} saved={loaded.saved} />;
}

function PlayerRun({
  lesson,
  glossary,
  settings,
  questionTypes,
  generators,
  progress,
  exhibitRenderers,
  onExit,
  onComplete,
  saved,
}: LessonPlayerProps & { saved: LessonProgress | null }) {
  const ctx = useMemo<MachineContext>(
    () => ({ lesson, generators, terminology: settings.terminology }),
    [lesson, generators, settings.terminology],
  );
  const reducer = useCallback((s: MachineState, a: Action) => reduce(s, a, ctx), [ctx]);
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    createInitialState(ctx, { progress: saved, attemptBase: Math.floor(Date.now() / 1000), now: Date.now() }),
  );
  const send = useCallback((a: ActionInput) => dispatch({ ...a, now: Date.now() } as Action), []);
  const onInteract = useCallback(() => send({ type: 'EXPLORE_INTERACTED' }), [send]);

  // --- persistence -----------------------------------------------------------------
  const writtenEvents = useRef(0);
  useEffect(() => {
    while (writtenEvents.current < state.events.length) {
      const event = state.events[writtenEvents.current++];
      progress.recordAttempt(event).catch((e) => warn('recording an attempt', e));
    }
  }, [state.events, progress]);

  const lastSaved = useRef(snapshot(state));
  useEffect(() => {
    const snap = snapshot(state);
    if (snap === lastSaved.current) return;
    lastSaved.current = snap;
    progress.saveLessonProgress(toProgress(state, Date.now())).catch((e) => warn('saving progress', e));
  }, [state, progress]);

  // --- sound ---------------------------------------------------------------------------
  const soundOn = settings.soundOn;
  const playUi = useCallback(
    (sound: 'correct' | 'wrong' | 'complete') => {
      if (!soundOn) return;
      try {
        getAudioEngine().playUi(sound);
      } catch {
        // Sound is best effort.
      }
    },
    [soundOn],
  );

  const onResult = useCallback(
    (result: MarkResult) => {
      playUi(result.correct ? 'correct' : 'wrong');
      send({ type: 'ANSWER', result });
    },
    [playUi, send],
  );

  // --- challenge clock -------------------------------------------------------------------
  const c = state.challenge;
  const clockRunning = state.step === 'challenge' && c.phase === 'running' && c.timed;
  useEffect(() => {
    if (!clockRunning) return;
    const id = setInterval(() => dispatch({ type: 'TICK', now: Date.now() }), 250);
    return () => clearInterval(id);
  }, [clockRunning]);

  const secondsLeft = c.secondsLeft;

  const resultPassed = state.step === 'challenge' && c.phase === 'result' && c.result?.passed === true;
  useEffect(() => {
    if (resultPassed) playUi('complete');
    // Play once per result screen, not when settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultPassed]);

  // --- announcements (derived, so no state is set in effects) -------------------------------------
  const stepNumber = STEP_ORDER.indexOf(state.step) + 1;
  const stepLabel = `Step ${stepNumber} of ${STEP_ORDER.length}: ${STEP_LABEL[state.step]}`;
  let announce = stepLabel;
  if (state.step === 'challenge' && c.phase === 'result' && c.result?.timedOut) announce = 'Time is up';
  else if (clockRunning && secondsLeft !== null && secondsLeft <= 10) announce = '10 seconds or fewer left';
  else if (state.step === 'name' && state.alternativeShown) announce = 'Another explanation shown below';

  // --- screens ---------------------------------------------------------------------------------------
  const { steps } = lesson;
  const t = settings.terminology;
  const title = t === 'us' && lesson.usTitle ? lesson.usTitle : lesson.title;
  let body: React.ReactNode = null;

  switch (state.step) {
    case 'hook':
      body = (
        <HookScreen
          title={title}
          text={steps.hook.text}
          exhibit={steps.hook.exhibit}
          onContinue={() => send({ type: 'CONTINUE' })}
          settings={settings}
          glossary={glossary}
          renderers={exhibitRenderers}
        />
      );
      break;
    case 'explore':
      body = (
        <ExploreStage
          key="explore"
          step={steps.explore}
          settings={settings}
          glossary={glossary}
          renderers={exhibitRenderers}
          done={isExploreDone(state)}
          onInteract={onInteract}
          onContinue={() => send({ type: 'CONTINUE' })}
          onBack={() => send({ type: 'BACK' })}
        />
      );
      break;
    case 'name':
      body = (
        <NameScreen
          key={`name-${state.nameIndex}`}
          index={state.nameIndex}
          count={state.nameCount}
          card={steps.name.cards[state.nameIndex]}
          alternative={steps.name.alternative}
          alternativeShown={state.alternativeShown}
          onShowAlternative={() => send({ type: 'SHOW_ALTERNATIVE' })}
          onContinue={() => send({ type: 'CONTINUE' })}
          onBack={() => send({ type: 'BACK' })}
          settings={settings}
          glossary={glossary}
          renderers={exhibitRenderers}
        />
      );
      break;
    case 'practice': {
      const p = state.practice;
      if (p) {
        const item = p.items[p.index];
        body = (
          <QuestionStage
            key={`practice-${p.index}-${p.run.attempt}`}
            mode="practice"
            item={item}
            run={p.run}
            eyebrow={`Practice ${p.index + 1} of ${p.items.length}`}
            settings={settings}
            glossary={glossary}
            questionTypes={questionTypes}
            onResult={onResult}
            onSkip={() => send({ type: 'SKIP' })}
            onContinue={() => send({ type: 'CONTINUE' })}
            onBack={p.index === 0 && p.run.attempt === 1 ? () => send({ type: 'BACK' }) : undefined}
            continueLabel={p.index + 1 === p.items.length ? 'Continue to the challenge' : 'Continue'}
          />
        );
      }
      break;
    }
    case 'challenge': {
      const spec = steps.challenge;
      if (c.phase === 'intro') {
        body = (
          <ChallengeIntro
            key="challenge-intro"
            count={spec.count}
            seconds={spec.seconds}
            passMark={spec.passMark}
            timed={!settings.untimed}
            onStart={() => send({ type: 'START_CHALLENGE', timed: !settings.untimed })}
          />
        );
      } else if (c.phase === 'running') {
        const item = c.items[c.index];
        body = (
          <QuestionStage
            key={`challenge-${c.index}`}
            mode="challenge"
            item={item}
            run={c.run}
            eyebrow={`Challenge ${c.index + 1} of ${c.items.length}`}
            settings={settings}
            glossary={glossary}
            questionTypes={questionTypes}
            onResult={onResult}
            onSkip={() => send({ type: 'SKIP' })}
            onContinue={() => send({ type: 'CONTINUE' })}
            continueLabel={c.index + 1 === c.items.length ? 'See result' : 'Next'}
          />
        );
      } else if (c.result) {
        body = (
          <ChallengeResultScreen
            key="challenge-result"
            result={c.result}
            passMark={spec.passMark}
            alreadyComplete={state.completed}
            onRetry={() => send({ type: 'RETRY_CHALLENGE' })}
            onContinue={() => send({ type: 'CONTINUE' })}
          />
        );
      }
      break;
    }
    case 'recap':
      body = (
        <RecapScreen
          title={`Recap: ${title}`}
          points={steps.recap.points}
          exhibit={steps.recap.exhibit}
          onFinish={() => onComplete({ lessonId: lesson.id, completed: state.completed, bestScore: state.bestScore })}
          settings={settings}
          glossary={glossary}
          renderers={exhibitRenderers}
        />
      );
      break;
  }

  const countdown =
    clockRunning && secondsLeft !== null ? (
      <span
        role="timer"
        aria-label="Time left"
        data-testid="countdown"
        className={`min-w-14 text-right text-xl font-extrabold tabular-nums ${secondsLeft <= 10 ? 'text-danger' : 'text-fg'}`}
      >
        {formatClock(secondsLeft)}
      </span>
    ) : null;


  return (
    <LessonContextProvider settings={settings} glossary={glossary}>
      <Shell
        progress={progressFraction(state)}
        stepLabel={stepLabel}
        strand={lesson.strand}
        onExit={onExit}
        trailing={countdown}
        announce={announce}
      >
        {body}
      </Shell>
    </LessonContextProvider>
  );
}
