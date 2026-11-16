'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getAudioEngine } from '@/audio';
import { Button } from '@/components/ui';
import { DEV_ROUTES_ENABLED } from '@/dev/enabled';
import { createRng } from '@/engine/rng';
import type { LearnerSettings } from '@/lesson/contracts';
import type { Bank } from './bank';
import type { Card } from './cards';
import type { Deck } from './decks';
import {
  answer,
  continueRound,
  createGame,
  multiplierForStreak,
  STREAK_STEP,
  tick,
  type GameResult,
  type GameState,
  type Step,
  type TermBlitzConfig,
} from './engine';
import { answerView, cardView } from './labels';

export interface PlayScreenProps {
  settings: LearnerSettings;
  bank: Bank;
  deck: Deck;
  config: TermBlitzConfig;
  seed: number;
  onFinished: (result: GameResult) => void;
  onExit: () => void;
}

/** Longest frame time passed to the engine, so a stalled frame cannot skip a card. */
const MAX_FRAME_MS = 100;
const FEEDBACK_MS = 1400;

interface RevealView {
  card: Card;
  guessIndex: number | null;
  reason: 'wrong' | 'timeout';
}
interface View {
  score: number;
  streak: number;
  phase: GameState['phase'];
  card: Card | null;
  reveal: RevealView | null;
  roundSecs: number | null;
  cardSecs: number | null;
  answered: number;
}
function snapshot(g: GameState): View {
  return {
    score: g.score,
    streak: g.streak,
    phase: g.phase,
    card: g.card,
    reveal: g.reveal ? { card: g.reveal.card, guessIndex: g.reveal.guessIndex, reason: g.reveal.reason } : null,
    roundSecs: g.roundLeftMs === null ? null : Math.ceil(g.roundLeftMs / 1000),
    cardSecs: g.phase === 'playing' && g.cardLeftMs !== null ? Math.ceil(g.cardLeftMs / 1000) : null,
    answered: g.answered,
  };
}
const sameView = (a: View, b: View) =>
  a.score === b.score &&
  a.streak === b.streak &&
  a.phase === b.phase &&
  a.card === b.card &&
  a.reveal?.card === b.reveal?.card &&
  a.roundSecs === b.roundSecs &&
  a.cardSecs === b.cardSecs &&
  a.answered === b.answered;

type RunState = 'running' | 'paused' | 'countdown';
type Feedback = { kind: 'correct' | 'wrong' | 'timeout'; text: string; icon: string; key: number };

function formatClock(secs: number): string {
  const s = Math.max(0, secs);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** BCP 47 code for a language label shown next to a term (English text needs none). */
function langCode(label: string | null): string | undefined {
  return label === 'Italian' ? 'it' : label === 'French' ? 'fr' : label === 'German' ? 'de' : undefined;
}

export function PlayScreen({ settings, bank, deck, config, seed, onFinished, onExit }: PlayScreenProps) {
  const reduced = settings.reducedMotion;
  const untimed = config.untimed;
  const terminology = settings.terminology;

  const [initial] = useState(() => createGame({ ...config, poolIds: deck.entryIds }, bank, createRng(seed)));
  const gameRef = useRef<GameState>(initial);
  const [view, setView] = useState<View>(() => snapshot(initial));
  const viewRef = useRef(view);

  const [run, setRun] = useState<RunState>('running');
  const [count, setCount] = useState(3);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [announcement, setAnnouncement] = useState<{ text: string; key: number }>(() => ({
    text: `${untimed ? `Card 1 of ${config.untimedCards}.` : 'Go!'} ${cardView(bank, initial.card!, terminology).speech}`,
    key: 0,
  }));

  const latest = useRef({ settings, onFinished, terminology });
  useEffect(() => {
    latest.current = { settings, onFinished, terminology };
  });

  const keyCounter = useRef(0);
  const finishedRef = useRef(false);
  const timeouts = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeouts.current.delete(id);
      fn();
    }, ms);
    timeouts.current.add(id);
  }, []);
  useEffect(() => {
    const pending = timeouts.current;
    return () => {
      for (const id of pending) clearTimeout(id);
      pending.clear();
    };
  }, []);

  const playSound = useCallback((sound: 'correct' | 'wrong' | 'complete') => {
    if (!latest.current.settings.soundOn) return;
    try {
      getAudioEngine().playUi(sound);
    } catch {
      // Sound is best effort.
    }
  }, []);

  const showFeedback = useCallback(
    (kind: Feedback['kind'], text: string, icon: string) => {
      const key = ++keyCounter.current;
      setFeedback({ kind, text, icon, key });
      later(() => setFeedback((f) => (f && f.key === key ? null : f)), FEEDBACK_MS);
    },
    [later],
  );

  // --- the time bar is written straight to the DOM: no React work per frame --------------------
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const writeBar = useCallback(() => {
    const g = gameRef.current;
    const fill = fillRef.current;
    const bar = barRef.current;
    if (!fill || !bar) return;
    let f = 0;
    if (g.phase === 'playing' && g.cardLeftMs !== null && g.cardLimitMs) {
      f = reduced
        ? Math.ceil(g.cardLeftMs / 1000) / Math.ceil(g.cardLimitMs / 1000)
        : g.cardLeftMs / g.cardLimitMs;
    }
    f = Math.min(1, Math.max(0, f));
    fill.style.transform = `scaleX(${f.toFixed(4)})`;
    bar.dataset.urgency = f > 0.5 ? 'high' : f > 0.25 ? 'mid' : 'low';
  }, [reduced]);

  /** Applies an engine step: stores the state, turns events into sound, text and view. */
  const commit = useCallback(
    (step: Step) => {
      const next = step.state;
      gameRef.current = next;
      const t = latest.current.terminology;
      const said: string[] = [];
      let result: GameResult | null = null;
      let dealt: Card | null = null;
      for (const ev of step.events) {
        switch (ev.type) {
          case 'correct':
            playSound('correct');
            showFeedback('correct', `+${ev.points}${ev.multiplier > 1 ? ` x${ev.multiplier}` : ''}`, '✓');
            said.push(`Correct. ${ev.points} points${ev.multiplier > 1 ? `, times ${ev.multiplier}` : ''}.`);
            break;
          case 'wrong':
            playSound('wrong');
            setFeedback(null);
            said.push(`Wrong. The answer was ${answerView(bank, ev.card.entryId, t).speech}`);
            break;
          case 'timeout':
            playSound('wrong');
            setFeedback(null);
            said.push(`Time is up. The answer was ${answerView(bank, ev.card.entryId, t).speech}`);
            break;
          case 'card':
            dealt = ev.card;
            break;
          case 'finished':
            result = ev.result;
            said.push('Round over.');
            break;
        }
      }
      if (dealt && !result) {
        const prefix = untimed ? `Card ${next.answered + 1} of ${config.untimedCards}. ` : 'Next card. ';
        said.push(`${prefix}${cardView(bank, dealt, t).speech}`);
      }
      if (said.length > 0) setAnnouncement({ text: said.join(' '), key: ++keyCounter.current });

      const snap = snapshot(next);
      if (!sameView(viewRef.current, snap)) {
        viewRef.current = snap;
        setView(snap);
      }

      if (result && !finishedRef.current) {
        finishedRef.current = true;
        playSound('complete');
        latest.current.onFinished(result);
      }
    },
    [bank, config.untimedCards, playSound, showFeedback, untimed],
  );

  const submit = useCallback(
    (index: number) => {
      const prev = gameRef.current;
      if (prev.phase !== 'playing') return;
      commit(answer(prev, index));
      writeBar();
    },
    [commit, writeBar],
  );
  const proceed = useCallback(() => {
    const prev = gameRef.current;
    if (prev.phase !== 'reveal') return;
    commit(continueRound(prev));
    writeBar();
  }, [commit, writeBar]);

  // --- the frame loop: engine.tick plus the bar; React only re-renders when something changes -----
  useLayoutEffect(() => {
    writeBar();
  }, [writeBar, view.card]);

  useEffect(() => {
    if (run !== 'running') return;
    let raf = 0;
    let last: number | null = null;
    const frame = (ts: number) => {
      const dt = last === null ? 0 : Math.min(Math.max(ts - last, 0), MAX_FRAME_MS);
      last = ts;
      commit(tick(gameRef.current, dt));
      writeBar();
      if (gameRef.current.phase !== 'finished') raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [run, commit, writeBar]);

  // --- pause, resume with a countdown, hidden tab -------------------------------------------------
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

  // --- keys: 1 to 4 answer, Enter continues from the reveal ---------------------------------------------
  useEffect(() => {
    if (run !== 'running') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        submit(Number(e.key) - 1);
      } else if (e.key === 'Enter' && gameRef.current.phase === 'reveal') {
        // A focused button handles Enter itself (the Continue button is focused when the reveal opens).
        if (t && (t.tagName === 'BUTTON' || t.tagName === 'A')) return;
        e.preventDefault();
        proceed();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, submit, proceed]);

  // --- render --------------------------------------------------------------------------------------------
  const card = view.card;
  const cv = card ? cardView(bank, card, terminology) : null;
  const reveal = view.reveal;
  const multiplier = multiplierForStreak(view.streak);
  const filledPips = multiplier >= 4 ? STREAK_STEP : view.streak % STREAK_STEP;
  const frozen = run !== 'running';
  const revealing = view.phase === 'reveal' && reveal !== null;
  const rv = revealing ? answerView(bank, reveal.card.entryId, terminology) : null;

  return (
    <div className="flex flex-col gap-2.5 p-3 sm:p-5">
      <h1 className="sr-only">Term Blitz</h1>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        <span key={announcement.key}>{announcement.text}</span>
      </p>

      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Score</p>
          <p className="tb-score m-0" data-testid="tb-score">
            {view.score}
          </p>
        </div>
        <div className="flex items-stretch justify-end gap-2 text-right">
          <div className="tb-stat" role="group" aria-label={`Streak ${view.streak}, score multiplier ${multiplier}`}>
            <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">
              Streak <span data-testid="tb-multiplier">x{multiplier}</span>
            </p>
            <p className="m-0 text-xl font-black tabular-nums" data-testid="tb-streak">
              {view.streak}
            </p>
            <div aria-hidden="true" className="flex justify-end gap-1">
              {Array.from({ length: STREAK_STEP }, (_, i) => (
                <span key={i} className={`tb-pip${i < filledPips ? ' tb-pip--on' : ''}`} />
              ))}
            </div>
          </div>
          {untimed ? (
            <div className="tb-stat">
              <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Cards</p>
              <p className="m-0 text-xl font-black tabular-nums" data-testid="tb-progress">
                {Math.min(view.answered + 1, config.untimedCards)}/{config.untimedCards}
              </p>
            </div>
          ) : (
            <div className="tb-stat">
              <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Time</p>
              <p className="m-0 text-xl font-black tabular-nums" data-testid="tb-time">
                {formatClock(view.roundSecs ?? 0)}
              </p>
            </div>
          )}
        </div>
      </div>

      {untimed ? null : (
        <div className="flex items-center gap-2" data-testid="tb-card-clock">
          <div ref={barRef} className="tb-bar" aria-hidden="true" data-testid="tb-bar">
            <div ref={fillRef} className="tb-bar-fill" />
          </div>
          <p className="m-0 w-8 text-right text-sm font-black tabular-nums text-fg-secondary" data-testid="tb-card-secs">
            {view.cardSecs !== null ? `${view.cardSecs}s` : ''}
          </p>
        </div>
      )}

      <div className="tb-feedback" data-kind={feedback?.kind} aria-hidden="true" data-testid="tb-feedback">
        {feedback ? (
          <span key={feedback.key}>
            {feedback.icon} {feedback.text}
          </span>
        ) : null}
      </div>

      <div className="tb-stage" data-testid="tb-stage">
        {revealing && rv ? (
          <div className="tb-prompt" data-state={reveal.reason} data-testid="tb-prompt">
            <p className="tb-kicker">
              <span aria-hidden="true">{reveal.reason === 'timeout' ? '⏱ ' : '✗ '}</span>
              {reveal.reason === 'timeout' ? 'Time is up' : 'Not quite'}
            </p>
            <p className="tb-prompt-term" data-testid="tb-answer-term" lang={langCode(rv.language)}>
              {rv.term}
            </p>
            {rv.language ? <span className="tb-tag">{rv.language}</span> : null}
            <p className="tb-reveal-meaning" data-testid="tb-answer-meaning">
              {rv.meaning}
              {rv.abbreviations.length > 0 ? (
                <span className="tb-reveal-abbr"> ({rv.abbreviations.join(', ')})</span>
              ) : null}
            </p>
          </div>
        ) : cv ? (
          <div className="tb-prompt" data-testid="tb-prompt">
            <p className="tb-kicker">{cv.kicker}</p>
            {cv.promptKind === 'term' ? (
              <p className="tb-prompt-term" lang={langCode(cv.language)}>
                {cv.prompt}
              </p>
            ) : null}
            {cv.promptKind === 'meaning' ? <p className="tb-prompt-meaning">{cv.prompt}</p> : null}
            {cv.promptKind === 'abbreviation' ? (
              <p className="tb-prompt-abbr" aria-label={`Abbreviation ${cv.prompt}`}>
                {cv.prompt}
              </p>
            ) : null}
            {cv.language ? <span className="tb-tag">{cv.language}</span> : null}
          </div>
        ) : null}

        <div role="group" aria-label="Answers" className="tb-opts">
          {cv && card
            ? cv.options.map((text, i) => {
                const isCorrect = revealing && i === card.correctIndex;
                const isWrongPick = revealing && reveal.guessIndex === i;
                const mark = isCorrect ? 'correct' : isWrongPick ? 'wrong' : undefined;
                return (
                  <button
                    key={i}
                    type="button"
                    className="tb-opt"
                    data-testid={`tb-option-${i + 1}`}
                    data-mark={mark}
                    {...(DEV_ROUTES_ENABLED ? { 'data-test-correct': i === card.correctIndex } : {})}
                    disabled={frozen || view.phase !== 'playing'}
                    aria-keyshortcuts={String(i + 1)}
                    onClick={() => submit(i)}
                  >
                    <span className="tb-chip" aria-hidden="true">
                      {mark === 'correct' ? '✓' : mark === 'wrong' ? '✗' : i + 1}
                    </span>
                    <span className="tb-opt-text" lang={cv.promptKind === 'meaning' ? bank.byId.get(card.options[i])?.language : undefined}>
                      {text}
                    </span>
                    {mark === 'correct' ? <span className="sr-only">(correct answer)</span> : null}
                    {mark === 'wrong' ? <span className="sr-only">(your answer, wrong)</span> : null}
                  </button>
                );
              })
            : null}
        </div>

        {run === 'paused' ? (
          <div className="tb-overlay" role="group" aria-label="Paused">
            <p className="m-0 text-3xl font-black uppercase tracking-widest">Paused</p>
            <Button size="lg" onClick={resume} autoFocus>
              Resume
            </Button>
          </div>
        ) : null}
        {run === 'countdown' ? (
          <div className="tb-overlay" aria-hidden="true" data-testid="tb-countdown">
            <p className="tb-count m-0" key={count}>
              {count}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        {revealing ? (
          <Button key="continue" size="md" onClick={proceed} disabled={frozen} autoFocus className="flex-1">
            Continue
          </Button>
        ) : (
          <Button key="pause" variant="secondary" size="md" onClick={pause} disabled={run === 'paused'}>
            Pause
          </Button>
        )}
        <Button variant="ghost" size="md" onClick={onExit}>
          Exit
        </Button>
      </div>
    </div>
  );
}
