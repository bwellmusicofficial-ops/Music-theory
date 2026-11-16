'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '@/audio';
import { Button } from '@/components/ui';
import { createRng } from '@/engine/rng';
import type { LearnerSettings } from '@/lesson/contracts';
import {
  completeRhythm,
  createGame,
  extraTap,
  isTimeUp,
  judge,
  multiplierForStreak,
  restartRhythm,
  STREAK_STEP,
  tick,
  timeLeftMs,
  timingFor,
  type GameResult,
  type GameState,
  type RhythmRecord,
  type Step,
  type TapItConfig,
  type Verdict,
} from './engine';
import { RhythmRound } from './round';
import type { TapRhythm } from './rhythms';

export interface PlayScreenProps {
  settings: LearnerSettings;
  config: TapItConfig;
  seed: number;
  onFinished: (result: GameResult) => void;
  onExit: () => void;
}

/** About one bar of feedback, never shorter or longer than this. */
const FEEDBACK_MIN_MS = 1800;
const FEEDBACK_MAX_MS = 3500;
const CLOCK_MS = 100;
const MAX_CLOCK_STEP_MS = 500;

type RunState = 'running' | 'paused' | 'countdown';
type Stage = 'play' | 'feedback';
interface Banner {
  kind: 'good' | 'ok' | 'bad' | 'level';
  text: string;
  icon: string;
  key: number;
}

interface View {
  score: number;
  streak: number;
  level: number;
  timeLeftMs: number | null;
  timeUp: boolean;
  rhythmNumber: number;
  hit: number;
  missed: number;
}
function snapshot(g: GameState): View {
  return {
    score: g.score,
    streak: g.streak,
    level: g.level,
    timeLeftMs: timeLeftMs(g),
    timeUp: isTimeUp(g),
    rhythmNumber: g.rhythmNumber,
    hit: g.perfects + g.closes,
    missed: g.misses,
  };
}

function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** One bar of the rhythm, in ms, within limits. */
function feedbackMsFor(r: TapRhythm): number {
  const barMs = (r.time.beats * 60000) / r.bpm;
  return Math.round(Math.min(FEEDBACK_MAX_MS, Math.max(FEEDBACK_MIN_MS, barMs)));
}

export function PlayScreen({ settings, config, seed, onFinished, onExit }: PlayScreenProps) {
  const reduced = settings.reducedMotion;
  const practice = config.practice;

  const [initial] = useState(() => createGame(config, createRng(seed)));
  const gameRef = useRef<GameState>(initial);
  const [view, setView] = useState<View>(() => snapshot(initial));
  const [round, setRound] = useState<{ key: number; rhythm: TapRhythm }>(() => ({ key: 1, rhythm: initial.current }));
  const [stage, setStage] = useState<Stage>('play');
  const [record, setRecord] = useState<RhythmRecord | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [run, setRun] = useState<RunState>('running');
  const [count, setCount] = useState(3);
  const [announcement, setAnnouncement] = useState<{ text: string; key: number }>(() => ({
    text: `Rhythm 1. Read the notation; a one-bar count-in follows, then tap the two bars.`,
    key: 0,
  }));

  const latest = useRef({ settings, onFinished });
  useEffect(() => {
    latest.current = { settings, onFinished };
  });
  const keyCounter = useRef(0);
  const finishedRef = useRef(false);
  const lastSecond = useRef<number | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** What to do when a pause ends: carry on to the next rhythm (paused in feedback) or replay this one. */
  const resumeWith = useRef<'next' | 'replay'>('replay');
  /** The result, held until the last rhythm's feedback has been shown. */
  const pendingResult = useRef<GameResult | null>(null);

  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
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

  const showBanner = useCallback((kind: Banner['kind'], text: string, icon: string) => {
    const key = ++keyCounter.current;
    setBanner({ kind, text, icon, key });
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner((b) => (b && b.key === key ? null : b)), 3000);
  }, []);

  /** Stores an engine step and turns its events into sound, text and the view. */
  const commit = useCallback(
    (step: Step) => {
      gameRef.current = step.state;
      const said: string[] = [];
      let result: GameResult | null = null;
      for (const ev of step.events) {
        switch (ev.type) {
          case 'rhythmDone': {
            const r = ev.record;
            setRecord(r);
            playSound(r.accuracy >= 0.5 ? 'correct' : 'wrong');
            if (practice) {
              showBanner(r.accuracy >= 0.5 ? 'good' : 'ok', `${r.perfect + r.close} of ${r.onsets} hit`, r.accuracy >= 0.5 ? '✓' : '~');
              said.push(`Rhythm done. ${r.perfect + r.close} of ${r.onsets} notes hit.`);
            } else if (r.bonus > 0) {
              showBanner('good', `Perfect rhythm! +${r.points}`, '★');
              said.push(`Rhythm done. Every note perfect. ${r.points} points including a ${r.bonus} point bonus.`);
            } else {
              showBanner(r.accuracy >= 0.5 ? 'good' : 'bad', `${r.perfect + r.close} of ${r.onsets} hit, +${r.points}`, r.accuracy >= 0.5 ? '✓' : '✗');
              said.push(`Rhythm done. ${r.perfect + r.close} of ${r.onsets} notes hit. ${r.points} points.`);
            }
            break;
          }
          case 'levelUp':
            showBanner('level', `Level ${ev.level}`, '▲');
            said.push(`Level up. Now level ${ev.level}.`);
            break;
          case 'levelDown':
            showBanner('level', `Level ${ev.level}`, '▼');
            said.push(`Level down. Now level ${ev.level}.`);
            break;
          case 'finished':
            result = ev.result;
            break;
          default:
            break;
        }
      }
      if (said.length > 0) setAnnouncement({ text: said.join(' '), key: ++keyCounter.current });
      setView(snapshot(step.state));
      if (result) pendingResult.current = result;
    },
    [playSound, practice, showBanner],
  );

  const startNextRhythm = useCallback(() => {
    const g = gameRef.current;
    if (g.phase === 'finished') {
      if (!finishedRef.current && pendingResult.current) {
        finishedRef.current = true;
        playSound('complete');
        latest.current.onFinished(pendingResult.current);
      }
      return;
    }
    setRecord(null);
    setStage('play');
    setRound((r) => ({ key: r.key + 1, rhythm: g.current }));
    setAnnouncement({
      text: `Rhythm ${g.rhythmNumber}, level ${g.level}. Read the notation; a one-bar count-in follows.`,
      key: ++keyCounter.current,
    });
  }, [playSound]);

  const onJudged = useCallback(
    (index: number, verdict: Verdict) => {
      commit(judge(gameRef.current, index, verdict));
    },
    [commit],
  );
  const onExtra = useCallback(() => {
    commit(extraTap(gameRef.current));
  }, [commit]);

  const onRoundComplete = useCallback(() => {
    if (gameRef.current.phase === 'finished') return;
    const rhythmPlayed = gameRef.current.current;
    commit(completeRhythm(gameRef.current));
    setStage('feedback');
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(startNextRhythm, feedbackMsFor(rhythmPlayed));
  }, [commit, startNextRhythm]);

  // --- the round clock: engine time only moves here, and only while running --------------------
  useEffect(() => {
    if (run !== 'running' || practice) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(Math.max(now - last, 0), MAX_CLOCK_STEP_MS);
      last = now;
      const step = tick(gameRef.current, dt);
      gameRef.current = step.state;
      const left = timeLeftMs(step.state);
      const second = left === null ? null : Math.ceil(left / 1000);
      if (second !== lastSecond.current) {
        lastSecond.current = second;
        setView(snapshot(step.state));
      }
    }, CLOCK_MS);
    return () => clearInterval(id);
  }, [run, practice]);

  // --- pause, resume with a countdown, hidden tab ----------------------------------------------------
  const pauseNow = useCallback(() => {
    if (gameRef.current.phase === 'finished') return;
    // The rhythm on the pad is abandoned and its taps taken back; in feedback it is already scored.
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = null;
    if (stage === 'play') {
      resumeWith.current = 'replay';
      gameRef.current = restartRhythm(gameRef.current);
      setView(snapshot(gameRef.current));
    } else {
      resumeWith.current = 'next';
    }
    setRun('paused');
  }, [stage]);
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
        if (resumeWith.current === 'next') startNextRhythm();
        else {
          setStage('play');
          setRound((r) => ({ key: r.key + 1, rhythm: gameRef.current.current }));
          setAnnouncement({ text: 'Same rhythm again. A one-bar count-in follows.', key: ++keyCounter.current });
        }
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [run, count, startNextRhythm]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      if (run === 'running') pauseNow();
      else if (run === 'countdown') setRun('paused');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [run, pauseNow]);

  // --- Space taps from anywhere on the page (the tap surface also takes Space and Enter itself) ----------
  useEffect(() => {
    if (run !== 'running') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && typeof t.closest === 'function' && t.closest('button, a, input, select, textarea, [contenteditable="true"]')) return;
      const pad = document.querySelector<HTMLElement>('.ti-pad [data-testid="tap-target"]');
      if (!pad) return;
      e.preventDefault();
      pad.focus({ preventScroll: true });
      pad.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run]);

  // --- render ----------------------------------------------------------------------------------------
  const multiplier = multiplierForStreak(view.streak);
  const filledPips = multiplier >= 4 ? STREAK_STEP : view.streak % STREAK_STEP;
  const timing = timingFor(config);
  const status =
    banner ??
    (view.timeUp && !practice && stage === 'play'
      ? ({ kind: 'level', text: 'Last rhythm!', icon: '⏱', key: -1 } as Banner)
      : null);

  return (
    <div className="flex flex-col gap-2 p-3 sm:p-5">
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="ti-announce">
        <span key={announcement.key}>{announcement.text}</span>
      </p>

      <div className="flex items-start justify-between gap-2">
        {practice ? (
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Slow practice</p>
            <p className="m-0 text-xl font-black tabular-nums" data-testid="ti-hits">
              Hit {view.hit} · Missed {view.missed}
            </p>
          </div>
        ) : (
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Score</p>
            <p className="ti-score m-0" data-testid="ti-score">
              {view.score}
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-stretch justify-end gap-1.5 text-right">
          {practice ? null : (
            <div className="ti-stat" aria-label={`Score multiplier ${multiplier}`}>
              <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Streak</p>
              <p className="m-0 text-lg font-black tabular-nums" data-testid="ti-multiplier">
                x{multiplier}
              </p>
              <div aria-hidden="true" className="mt-0.5 flex justify-end gap-0.5">
                {Array.from({ length: STREAK_STEP }, (_, i) => (
                  <span key={i} className={`ti-pip${i < filledPips ? ' ti-pip--on' : ''}`} />
                ))}
              </div>
            </div>
          )}
          <div className="ti-stat">
            <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Level</p>
            <p className="m-0 text-lg font-black tabular-nums" data-testid="ti-level">
              {view.level}
            </p>
          </div>
          {practice ? (
            <div className="ti-stat">
              <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Rhythm</p>
              <p className="m-0 text-lg font-black tabular-nums" data-testid="ti-progress">
                {Math.min(view.rhythmNumber, config.practiceRhythms)}/{config.practiceRhythms}
              </p>
            </div>
          ) : (
            <div className="ti-stat">
              <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Time</p>
              <p className="m-0 text-lg font-black tabular-nums" data-testid="ti-time">
                {formatClock(view.timeLeftMs ?? 0)}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="ti-feedback" data-kind={status?.kind} aria-hidden="true" data-testid="ti-feedback">
        {status ? (
          <span key={status.key}>
            {status.icon} {status.text}
          </span>
        ) : stage === 'play' ? (
          <span className="text-base font-bold text-fg-secondary">
            Rhythm {view.rhythmNumber}
            {practice ? ` of ${config.practiceRhythms}` : ''}: tap along after the count-in
          </span>
        ) : null}
      </div>

      {run === 'paused' ? (
        <div className="ti-overlay" role="group" aria-label="Paused">
          <p className="m-0 text-3xl font-black uppercase tracking-widest">Paused</p>
          <Button size="lg" onClick={resume} autoFocus>
            Resume
          </Button>
        </div>
      ) : run === 'countdown' ? (
        <div className="ti-overlay" aria-hidden="true" data-testid="ti-countdown">
          <p className="ti-count m-0" key={count}>
            {count}
          </p>
        </div>
      ) : (
        <RhythmRound
          key={round.key}
          rhythm={round.rhythm}
          terminology={settings.terminology}
          reducedMotion={reduced}
          latencyOffsetMs={settings.latencyOffsetMs}
          timing={timing}
          onJudged={onJudged}
          onExtraTap={onExtra}
          onComplete={onRoundComplete}
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" onClick={pauseNow} disabled={run !== 'running'}>
          Pause
        </Button>
        {record && stage === 'feedback' ? (
          <p className="m-0 text-sm font-semibold text-fg-secondary" data-testid="ti-record">
            {record.perfect} perfect, {record.close} close, {record.miss} missed
          </p>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onExit}>
          Exit
        </Button>
      </div>
    </div>
  );
}
