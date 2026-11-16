'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '@/audio';
import { Button } from '@/components/ui';
import { pitch } from '@/engine/pitch';
import { createRng } from '@/engine/rng';
import type { LearnerSettings } from '@/lesson/contracts';
import {
  answer,
  createGame,
  multiplierForStreak,
  next,
  STREAK_STEP,
  tick,
  type GameResult,
  type GameState,
  type KeyHuntConfig,
  type Outcome,
  type Step,
} from './engine';
import type { Question } from './questions';
import { SignatureView, signatureSpeech } from './signature-view';

export interface PlayScreenProps {
  settings: LearnerSettings;
  config: KeyHuntConfig;
  seed: number;
  onFinished: (result: GameResult) => void;
  onExit: () => void;
}

/** Longest frame time passed to the engine, so a stalled frame cannot skip a whole question. */
const MAX_FRAME_MS = 100;
const TOAST_MS = 1400;

interface View {
  score: number;
  streak: number;
  level: number;
  /** Whole seconds left in the round; null untimed. */
  roundSecs: number | null;
  /** Whole seconds left on the question; null untimed. */
  questionSecs: number | null;
  phase: GameState['phase'];
  question: Question;
  questionNumber: number;
  outcome: Outcome | null;
  answered: number;
}
function snapshot(g: GameState): View {
  return {
    score: g.score,
    streak: g.streak,
    level: g.level,
    roundSecs: g.roundLeftMs === null ? null : Math.ceil(g.roundLeftMs / 1000),
    questionSecs: g.questionLeftMs === null ? null : Math.ceil(g.questionLeftMs / 1000),
    phase: g.phase,
    question: g.question,
    questionNumber: g.questionNumber,
    outcome: g.outcome,
    answered: g.correct + g.wrong + g.timedOut,
  };
}

type RunState = 'running' | 'paused' | 'countdown';
type Toast = { kind: 'correct' | 'level'; text: string; icon: string; key: number };

function formatClock(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/** What is on show, in words, without giving the answer away. */
function describeExhibit(q: Question): string {
  return q.exhibit.type === 'signature' ? signatureSpeech(q.exhibit.passage, pitch.keySignature(q.exhibit.passage.key)) : q.exhibit.text;
}

function questionSpeech(q: Question, number: number): string {
  return q.exhibit.type === 'signature'
    ? `Question ${number}. ${describeExhibit(q)}. ${q.prompt}`
    : `Question ${number}. ${q.prompt}${q.kind === 'key-to-sig' ? ` ${q.exhibit.text}.` : ''}`;
}

export function PlayScreen({ settings, config, seed, onFinished, onExit }: PlayScreenProps) {
  const reduced = settings.reducedMotion;
  const untimed = config.untimed;

  const [initial] = useState(() => createGame(config, createRng(seed)));
  const gameRef = useRef<GameState>(initial);
  const [view, setView] = useState<View>(() => snapshot(initial));
  const [run, setRun] = useState<RunState>('running');
  const [count, setCount] = useState(3);
  const [toast, setToast] = useState<Toast | null>(null);
  const [announcement, setAnnouncement] = useState<{ text: string; key: number }>(() => ({
    text: questionSpeech(initial.question, 1),
    key: 0,
  }));

  const latest = useRef({ settings, onFinished });
  useEffect(() => {
    latest.current = { settings, onFinished };
  });
  const keyCounter = useRef(0);
  const finishedRef = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const playSound = useCallback((sound: 'correct' | 'wrong' | 'complete') => {
    if (!latest.current.settings.soundOn) return;
    try {
      getAudioEngine().playUi(sound);
    } catch {
      // Sound is best effort.
    }
  }, []);

  const showToast = useCallback((kind: Toast['kind'], text: string, icon: string) => {
    const key = ++keyCounter.current;
    setToast({ kind, text, icon, key });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => (t && t.key === key ? null : t)), TOAST_MS);
  }, []);

  const writeBar = useCallback(() => {
    const g = gameRef.current;
    const fill = fillRef.current;
    const bar = barRef.current;
    if (!fill || !bar) return;
    const fraction =
      g.phase === 'asking' && g.questionTotalMs && g.questionLeftMs !== null ? Math.max(0, Math.min(1, g.questionLeftMs / g.questionTotalMs)) : 0;
    fill.style.transform = `scaleX(${fraction.toFixed(4)})`;
    bar.dataset.low = fraction < 0.3 ? 'true' : 'false';
  }, []);

  /** Applies an engine step: stores the state, turns events into sound, text and the view. */
  const commit = useCallback(
    (prev: GameState, step: Step) => {
      const nextState = step.state;
      gameRef.current = nextState;
      const said: string[] = [];
      let result: GameResult | null = null;
      for (const ev of step.events) {
        switch (ev.type) {
          case 'correct':
            playSound('correct');
            showToast('correct', `+${ev.points}${ev.multiplier > 1 ? ` x${ev.multiplier}` : ''}`, '✓');
            said.push(`Correct. ${ev.points} points${ev.multiplier > 1 ? `, times ${ev.multiplier}` : ''}.`);
            break;
          case 'wrong':
            playSound('wrong');
            said.push(`Not quite. ${ev.reason}.`);
            break;
          case 'timeout':
            playSound('wrong');
            said.push(`Time is up. ${ev.reason}.`);
            break;
          case 'levelUp':
            showToast('level', `Level ${ev.level}`, '▲');
            said.push(`Level up. Now level ${ev.level}.`);
            break;
          case 'levelDown':
            showToast('level', `Level ${ev.level}`, '▼');
            said.push(`Level down. Now level ${ev.level}.`);
            break;
          case 'question':
            said.push(questionSpeech(nextState.question, ev.number));
            break;
          case 'finished':
            result = ev.result;
            said.push('Round over.');
            break;
        }
      }
      if (said.length > 0) setAnnouncement({ text: said.join(' '), key: ++keyCounter.current });

      const secs = (g: GameState) => [g.roundLeftMs === null ? null : Math.ceil(g.roundLeftMs / 1000), g.questionLeftMs === null ? null : Math.ceil(g.questionLeftMs / 1000)];
      const [r0, q0] = secs(prev);
      const [r1, q1] = secs(nextState);
      if (step.events.length > 0 || r0 !== r1 || q0 !== q1) setView(snapshot(nextState));
      writeBar();

      if (result && !finishedRef.current) {
        finishedRef.current = true;
        playSound('complete');
        latest.current.onFinished(result);
      }
    },
    [playSound, showToast, writeBar],
  );

  const pick = useCallback(
    (index: number) => {
      const prev = gameRef.current;
      if (prev.phase !== 'asking') return;
      commit(prev, answer(prev, index));
    },
    [commit],
  );
  const goNext = useCallback(() => {
    const prev = gameRef.current;
    if (prev.phase !== 'reveal') return;
    commit(prev, next(prev));
  }, [commit]);

  // --- the frame loop: engine.tick plus the bar; React only hears about events and whole seconds ---
  useEffect(() => {
    if (run !== 'running' || untimed) return;
    let raf = 0;
    let last: number | null = null;
    const frame = (ts: number) => {
      const dt = last === null ? 0 : Math.min(Math.max(ts - last, 0), MAX_FRAME_MS);
      last = ts;
      const prev = gameRef.current;
      commit(prev, tick(prev, dt));
      if (gameRef.current.phase !== 'finished') raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [run, untimed, commit]);

  useEffect(() => {
    writeBar();
  }, [view.questionNumber, view.phase, writeBar]);

  // --- pause, resume with a countdown, hidden tab --------------------------------------------------
  const pause = useCallback(() => {
    setRun((r) => (r === 'running' || r === 'countdown' ? 'paused' : r));
  }, []);
  const resume = useCallback(() => {
    setCount(3);
    setRun('countdown');
    setAnnouncement({ text: 'Resuming in 3', key: ++keyCounter.current });
  }, []);
  useEffect(() => {
    if (run !== 'countdown') return;
    const id = setTimeout(() => {
      if (count > 1) {
        setCount(count - 1);
        setAnnouncement({ text: String(count - 1), key: ++keyCounter.current });
      } else {
        setRun('running');
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [run, count]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pause]);

  // --- keys: 1 to 4 pick an answer; Enter or Space moves on from the reveal ----------------------------
  useEffect(() => {
    if (run !== 'running') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable === true)) return;
      const g = gameRef.current;
      if (g.phase === 'asking' && e.key >= '1' && e.key <= '9') {
        const index = Number(e.key) - 1;
        if (index < g.question.options.length) {
          e.preventDefault();
          pick(index);
        }
      } else if (g.phase === 'reveal' && (e.key === 'Enter' || e.key === ' ') && !(t && typeof t.closest === 'function' && t.closest('button'))) {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, pick, goNext]);

  // --- render --------------------------------------------------------------------------------------------
  const q = view.question;
  const revealing = view.phase === 'reveal';
  const frozen = run !== 'running';
  const multiplier = multiplierForStreak(view.streak);
  const filledPips = multiplier >= 4 ? STREAK_STEP : view.streak % STREAK_STEP;
  const staveOptions = q.kind === 'key-to-sig';
  const picked = view.outcome && !view.outcome.correct ? view.outcome.picked : null;
  const isLastUntimed = untimed && view.answered >= config.untimedQuestions;
  const lead = view.outcome && !view.outcome.correct && view.outcome.picked === null ? 'Time is up' : 'Not quite';

  return (
    <div className="flex flex-col gap-2.5 p-3 sm:p-5">
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="kh-announce">
        <span key={announcement.key}>{announcement.text}</span>
      </p>

      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Score</p>
          <p className="kh-score m-0" data-testid="kh-score">
            {view.score}
          </p>
        </div>
        <div className="flex flex-wrap items-stretch justify-end gap-1.5 text-right">
          <div className="kh-stat" aria-label={`Score multiplier ${multiplier}`}>
            <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Streak</p>
            <p className="m-0 text-lg font-black tabular-nums" data-testid="kh-multiplier">
              x{multiplier}
            </p>
            <div aria-hidden="true" className="mt-0.5 flex justify-end gap-0.5">
              {Array.from({ length: STREAK_STEP }, (_, i) => (
                <span key={i} className={`kh-pip${i < filledPips ? ' kh-pip--on' : ''}`} />
              ))}
            </div>
          </div>
          <div className="kh-stat">
            <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Level</p>
            <p className="m-0 text-lg font-black tabular-nums" data-testid="kh-level">
              {view.level}
            </p>
          </div>
          {untimed ? (
            <div className="kh-stat">
              <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Question</p>
              <p className="m-0 text-lg font-black tabular-nums" data-testid="kh-progress">
                {Math.min(view.questionNumber, config.untimedQuestions)}/{config.untimedQuestions}
              </p>
            </div>
          ) : (
            <div className="kh-stat">
              <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Time</p>
              <p className="m-0 text-lg font-black tabular-nums" data-testid="kh-time">
                {formatClock(view.roundSecs ?? 0)}
              </p>
            </div>
          )}
        </div>
      </div>

      {untimed ? null : (
        <div className="flex items-center gap-2">
          <div ref={barRef} className="kh-bar flex-1" aria-hidden="true" data-testid="kh-bar">
            <div ref={fillRef} className="kh-bar-fill" />
          </div>
          <span className="w-8 text-right text-sm font-black tabular-nums text-fg-secondary" aria-hidden="true" data-testid="kh-qsecs">
            {revealing ? '' : `${view.questionSecs ?? 0}s`}
          </span>
        </div>
      )}

      {run === 'paused' ? (
        <div className="kh-overlay" role="group" aria-label="Paused">
          <p className="m-0 text-3xl font-black uppercase tracking-widest">Paused</p>
          <Button size="lg" onClick={resume} autoFocus>
            Resume
          </Button>
        </div>
      ) : run === 'countdown' ? (
        <div className="kh-overlay" aria-hidden="true" data-testid="kh-countdown">
          <p className="kh-count m-0" key={count}>
            {count}
          </p>
        </div>
      ) : (
        <>
          <h2 className="m-0 text-lg font-black leading-snug" data-testid="kh-prompt">
            {q.prompt}
          </h2>

          <div className="kh-exhibit" data-testid="kh-exhibit">
            {q.exhibit.type === 'signature' ? (
              <SignatureView
                passage={q.exhibit.passage}
                ariaLabel={signatureSpeech(q.exhibit.passage, pitch.keySignature(q.exhibit.passage.key))}
                size="lg"
                reducedMotion={reduced}
              />
            ) : (
              <p className="kh-keyname m-0">{q.exhibit.text}</p>
            )}
          </div>

          <div
            role="group"
            aria-label="Answers"
            className={`grid gap-2 ${q.options.length === 3 && !staveOptions ? 'grid-cols-1' : 'grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2'}`}
            data-testid="kh-options"
          >
            {q.options.map((o, i) => {
              const state = !revealing ? undefined : i === q.correct ? 'correct' : i === picked ? 'wrong' : 'dim';
              return (
                <button
                  key={`${view.questionNumber}-${i}`}
                  type="button"
                  className={`kh-opt${staveOptions ? ' kh-opt--stave' : ''}`}
                  disabled={frozen || revealing}
                  data-state={state}
                  aria-label={o.label}
                  onClick={() => pick(i)}
                >
                  <span className="kh-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  {o.passage ? (
                    <span aria-hidden="true" className="flex w-full justify-center">
                      <SignatureView passage={o.passage} ariaLabel={o.label} reducedMotion={reduced} />
                    </span>
                  ) : (
                    <span aria-hidden="true">{o.label}</span>
                  )}
                  {state === 'correct' ? (
                    <span className="kh-tag" aria-hidden="true">
                      ✓ Right
                    </span>
                  ) : state === 'wrong' ? (
                    <span className="kh-tag" aria-hidden="true">
                      ✗ Yours
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="kh-panel" data-testid="kh-panel">
            {revealing ? (
              <div className="kh-reveal" data-testid="kh-reveal">
                <p className="m-0 text-base font-black text-danger">
                  <span aria-hidden="true">✗ </span>
                  {lead}
                </p>
                <p className="m-0 mt-0.5 text-base font-bold" data-testid="kh-reason">
                  {q.reason}
                </p>
                <div className="mt-1.5">
                  <Button size="sm" onClick={goNext} autoFocus>
                    {isLastUntimed ? 'See results' : 'Next'}
                  </Button>
                </div>
              </div>
            ) : toast ? (
              <p className="kh-toast m-0" data-kind={toast.kind} aria-hidden="true" data-testid="kh-toast">
                <span key={toast.key}>
                  {toast.icon} {toast.text}
                </span>
              </p>
            ) : (
              <p className="m-0 text-sm font-semibold text-fg-secondary">Tap an answer, or press 1 to {q.options.length}.</p>
            )}
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" onClick={pause} disabled={run === 'paused'}>
          Pause
        </Button>
        <Button variant="ghost" size="sm" onClick={onExit}>
          Exit
        </Button>
      </div>
    </div>
  );
}
