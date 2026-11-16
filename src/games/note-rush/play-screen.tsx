'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getAudioEngine } from '@/audio';
import { Keyboard } from '@/components/keyboard';
import { NOTE_SPRITE_HEAD_X, NoteSprite, Stave, staveMetrics, type StaveSize } from '@/components/stave';
import { Button } from '@/components/ui';
import type { LearnerSettings } from '@/lesson/contracts';
import { pitch } from '@/engine/pitch';
import { createRng } from '@/engine/rng';
import type { Letter, Passage, Pitch } from '@/engine/types';
import {
  answer,
  createGame,
  leadingNote,
  multiplierForStreak,
  STREAK_STEP,
  tick,
  widestRange,
  type GameResult,
  type GameState,
  type NoteRushConfig,
  type Step,
} from './engine';
import { LetterPad } from './letter-pad';
import { describeStavePosition, staveWord } from './position-words';

export interface PlayScreenProps {
  settings: LearnerSettings;
  config: NoteRushConfig;
  seed: number;
  onFinished: (result: GameResult) => void;
  onExit: () => void;
}

// --- geometry (all in stave units, scaled by the sprite size) ------------------------------
/** Where the target line sits, right of the clef. */
const TARGET_UNITS = 72;
/** Spawn point is this far beyond the right edge, so notes slide in. */
const OFFSCREEN_PX = 28;
const FALLBACK_STAGE_PX = 640;
const SMALL_STAGE_PX = 560;
/** Longest frame time passed to the engine, so a stalled frame cannot teleport notes. */
const MAX_FRAME_MS = 100;
const FLASH_MS = 450;
const GHOST_MS = 900;
const FEEDBACK_MS = 1600;
const KEYBOARD_LOW = pitch.parsePitch('C4');
const KEYBOARD_HIGH = pitch.parsePitch('B4');
const STAVE_SHOW = { keySignature: false, timeSignature: false, finalBarline: false } as const;

interface Geometry {
  scale: number;
  targetPx: number;
  stageW: number;
}

function headPx(x: number, g: Geometry): number {
  return g.targetPx + x * (g.stageW + OFFSCREEN_PX - g.targetPx);
}
function noteTransform(x: number, g: Geometry): string {
  return `translate3d(${(headPx(x, g) - NOTE_SPRITE_HEAD_X * g.scale).toFixed(2)}px, 0, 0)`;
}

interface NoteView {
  id: number;
  pitch: Pitch;
  position: number;
  x: number;
}
interface View {
  score: number;
  streak: number;
  level: number;
  timeLeftMs: number | null;
  cleared: number;
  notes: NoteView[];
}
function snapshot(g: GameState): View {
  return {
    score: g.score,
    streak: g.streak,
    level: g.level,
    timeLeftMs: g.timeLeftMs,
    cleared: g.correct,
    notes: g.notes.map((n) => ({ id: n.id, pitch: n.pitch, position: n.position, x: n.x })),
  };
}

interface Ghost {
  key: number;
  kind: 'correct' | 'miss';
  pitch: Pitch;
  x: number;
  label?: string;
}
type Feedback = { kind: 'correct' | 'wrong' | 'miss' | 'level'; text: string; icon: string; key: number };
type RunState = 'running' | 'paused' | 'countdown';

function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function PlayScreen({ settings, config, seed, onFinished, onExit }: PlayScreenProps) {
  const reduced = settings.reducedMotion;
  const untimed = config.untimed;
  const word = staveWord(settings.terminology);

  const [initial] = useState(() => createGame(config, createRng(seed)));
  const gameRef = useRef<GameState>(initial);
  const [view, setView] = useState<View>(() => snapshot(initial));

  const [run, setRun] = useState<RunState>('running');
  const [count, setCount] = useState(3);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [announcement, setAnnouncement] = useState<{ text: string; key: number }>(() => ({
    text: untimed
      ? `Note 1 of ${config.untimedNotes}, on the ${describeStavePosition(initial.notes[0].position, settings.terminology)}.`
      : 'Go!',
    key: 0,
  }));
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [shakeId, setShakeId] = useState<number | null>(null);

  // --- layout: measured once and on resize, never per frame -----------------------------
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(FALLBACK_STAGE_PX);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStageW(el.clientWidth > 0 ? el.clientWidth : FALLBACK_STAGE_PX);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const size: StaveSize = stageW < SMALL_STAGE_PX ? 'sm' : 'md';
  const range = useMemo(() => {
    const w = widestRange(config);
    return { low: pitch.pitchAtStavePosition(w.low, config.clef), high: pitch.pitchAtStavePosition(w.high, config.clef) };
  }, [config]);
  const metrics = useMemo(() => staveMetrics(size, range, config.clef), [size, range, config.clef]);
  const geom = useMemo<Geometry>(
    () => ({ scale: metrics.scale, targetPx: TARGET_UNITS * metrics.scale, stageW }),
    [metrics.scale, stageW],
  );
  const geomRef = useRef(geom);
  useLayoutEffect(() => {
    geomRef.current = geom;
  }, [geom]);

  const passage = useMemo<Passage>(
    () => ({
      clef: config.clef,
      key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
      time: { beats: 4, beatUnit: 4 },
      bars: [],
    }),
    [config.clef],
  );

  // --- latest props for stable callbacks ---------------------------------------------------
  const latest = useRef({ settings, onFinished });
  useEffect(() => {
    latest.current = { settings, onFinished };
  });

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

  const spriteEls = useRef(new Map<number, HTMLElement>());
  const keyCounter = useRef(0);
  const lastSecond = useRef<number | null>(null);
  const finishedRef = useRef(false);

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

  const addGhost = useCallback(
    (ghost: Omit<Ghost, 'key'>) => {
      const key = ++keyCounter.current;
      setGhosts((g) => [...g, { ...ghost, key }]);
      later(() => setGhosts((g) => g.filter((x) => x.key !== key)), GHOST_MS);
    },
    [later],
  );

  /** Applies an engine step: stores the state, turns events into sound, text and animation. */
  const commit = useCallback(
    (prev: GameState, step: Step) => {
      const next = step.state;
      gameRef.current = next;
      const terminology = latest.current.settings.terminology;
      const said: string[] = [];
      let result: GameResult | null = null;
      for (const ev of step.events) {
        switch (ev.type) {
          case 'correct': {
            playSound('correct');
            const lead = prev.notes.find((n) => n.id === ev.noteId);
            if (lead) addGhost({ kind: 'correct', pitch: lead.pitch, x: lead.x });
            const times = ev.multiplier > 1 ? ` x${ev.multiplier}` : '';
            showFeedback('correct', `+${ev.points}${times}`, '✓');
            said.push(`Correct. ${ev.points} points${ev.multiplier > 1 ? `, times ${ev.multiplier}` : ''}.`);
            break;
          }
          case 'wrong':
            playSound('wrong');
            setShakeId(ev.noteId);
            later(() => setShakeId((id) => (id === ev.noteId ? null : id)), FLASH_MS);
            showFeedback('wrong', 'Not quite, try again', '✗');
            said.push('Not quite. Try again.');
            break;
          case 'miss':
            playSound('wrong');
            addGhost({ kind: 'miss', pitch: ev.pitch, x: 0, label: ev.letter });
            showFeedback('miss', `Missed: it was ${ev.letter}`, '!');
            said.push(`Missed. It was ${ev.letter}.`);
            break;
          case 'levelUp':
            showFeedback('level', `Level ${ev.level}`, '▲');
            said.push(`Level up. Now level ${ev.level}.`);
            break;
          case 'levelDown':
            showFeedback('level', `Level ${ev.level}`, '▼');
            said.push(`Level down. Now level ${ev.level}.`);
            break;
          case 'finished':
            result = ev.result;
            said.push('Round over.');
            break;
        }
      }
      if (untimed && !result && step.events.some((e) => e.type === 'correct')) {
        const lead = leadingNote(next);
        if (lead) {
          said.push(`Note ${next.correct + 1} of ${next.config.untimedNotes}, on the ${describeStavePosition(lead.position, terminology)}.`);
        }
      }
      if (said.length > 0) setAnnouncement({ text: said.join(' '), key: ++keyCounter.current });

      const notesChanged =
        prev.notes.length !== next.notes.length || prev.notes[prev.notes.length - 1]?.id !== next.notes[next.notes.length - 1]?.id;
      const second = next.timeLeftMs === null ? null : Math.ceil(next.timeLeftMs / 1000);
      const secondChanged = second !== lastSecond.current;
      lastSecond.current = second;
      if (step.events.length > 0 || notesChanged || secondChanged) setView(snapshot(next));

      if (result && !finishedRef.current) {
        finishedRef.current = true;
        playSound('complete');
        latest.current.onFinished(result);
      }
    },
    [addGhost, later, playSound, showFeedback, untimed],
  );

  const submit = useCallback(
    (guess: Letter | null) => {
      const prev = gameRef.current;
      if (prev.phase !== 'playing') return;
      commit(prev, answer(prev, guess));
    },
    [commit],
  );

  // --- the frame loop: engine.tick + transforms only; no React work per frame --------------
  const writeTransforms = useCallback(() => {
    const g = geomRef.current;
    for (const n of gameRef.current.notes) {
      const el = spriteEls.current.get(n.id);
      if (el) el.style.transform = noteTransform(n.x, g);
    }
  }, []);

  useEffect(() => {
    if (run !== 'running' || untimed) return;
    let raf = 0;
    let last: number | null = null;
    const frame = (ts: number) => {
      const dt = last === null ? 0 : Math.min(Math.max(ts - last, 0), MAX_FRAME_MS);
      last = ts;
      const prev = gameRef.current;
      commit(prev, tick(prev, dt));
      writeTransforms();
      if (gameRef.current.phase === 'playing') raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [run, untimed, commit, writeTransforms]);

  // --- pause, resume with a countdown, hidden tab ----------------------------------------------
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

  // --- computer keys a-g in letters mode ---------------------------------------------------------
  useEffect(() => {
    if (run !== 'running' || config.answerMode !== 'letters') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const k = e.key.length === 1 ? e.key.toUpperCase() : '';
      if (k >= 'A' && k <= 'G') {
        e.preventDefault();
        submit(k as Letter);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, config.answerMode, submit]);

  const onPianoNote = useCallback(
    (p: Pitch) => {
      // A black key is never a natural note name.
      submit(p.accidental === 0 ? p.letter : null);
    },
    [submit],
  );

  // --- render ---------------------------------------------------------------------------------------
  const lineYs = [0, 2, 4, 6, 8].map((p) => metrics.yForPositionPx(p));
  const lead = view.notes[0];
  const multiplier = multiplierForStreak(view.streak);
  const filledPips = multiplier >= 4 ? STREAK_STEP : view.streak % STREAK_STEP;
  const frozen = run !== 'running';
  const clefName = config.clef === 'treble' ? 'Treble clef' : 'Bass clef';

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-5">
      <h1 className="sr-only">Note Rush</h1>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        <span key={announcement.key}>{announcement.text}</span>
      </p>

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Score</p>
          <p className="nr-score m-0" data-testid="nr-score">
            {view.score}
          </p>
        </div>
        <div className="flex flex-wrap items-stretch justify-end gap-2 text-right">
          <div className="nr-stat" aria-label={`Score multiplier ${multiplier}`}>
            <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Streak</p>
            <p className="m-0 text-xl font-black tabular-nums" data-testid="nr-multiplier">
              x{multiplier}
            </p>
            <div aria-hidden="true" className="mt-0.5 flex justify-end gap-1">
              {Array.from({ length: STREAK_STEP }, (_, i) => (
                <span key={i} className={`nr-pip${i < filledPips ? ' nr-pip--on' : ''}`} />
              ))}
            </div>
          </div>
          <div className="nr-stat">
            <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Level</p>
            <p className="m-0 text-xl font-black tabular-nums" data-testid="nr-level">
              {view.level}
            </p>
          </div>
          {untimed ? (
            <div className="nr-stat">
              <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Notes</p>
              <p className="m-0 text-xl font-black tabular-nums" data-testid="nr-progress">
                {view.cleared}/{config.untimedNotes}
              </p>
            </div>
          ) : (
            <div className="nr-stat">
              <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Time</p>
              <p className="m-0 text-xl font-black tabular-nums" data-testid="nr-time">
                {formatClock(view.timeLeftMs ?? 0)}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="nr-feedback" data-kind={feedback?.kind} aria-hidden="true" data-testid="nr-feedback">
        {feedback ? (
          <span key={feedback.key}>
            {feedback.icon} {feedback.text}
          </span>
        ) : untimed && lead ? (
          <span className="text-base font-bold text-fg-secondary">
            {describeStavePosition(lead.position, settings.terminology)}
          </span>
        ) : null}
      </div>

      <div
        ref={stageRef}
        className="nr-stage"
        data-testid="nr-stage"
        style={{ height: metrics.heightPx }}
        data-reduced={reduced ? 'true' : undefined}
      >
        {lineYs.map((y, i) => (
          <div key={i} aria-hidden="true" className="nr-line" style={{ top: y - metrics.scale / 2, height: metrics.scale }} />
        ))}
        <div className="absolute left-0 top-0 overflow-hidden" style={{ width: geom.targetPx - 6, height: metrics.heightPx }}>
          <Stave
            passage={passage}
            mode="read"
            size={size}
            range={range}
            show={STAVE_SHOW}
            terminology={settings.terminology}
            reducedMotion={reduced}
            ariaLabel={`${clefName} ${word}`}
          />
        </div>
        <div aria-hidden="true" className="nr-target" style={{ left: geom.targetPx - 2 }} />

        {view.notes.map((n, i) => (
          <div
            key={n.id}
            ref={(el) => {
              if (el) spriteEls.current.set(n.id, el);
              else spriteEls.current.delete(n.id);
            }}
            data-testid="nr-note"
            aria-hidden="true"
            className={`nr-note${i === 0 ? ' nr-note--lead' : ''}${shakeId === n.id && !reduced ? ' nr-note--shake' : ''}`}
            style={{ transform: noteTransform(n.x, geom) }}
          >
            <NoteSprite
              pitch={n.pitch}
              clef={config.clef}
              size={size}
              range={range}
              state={shakeId === n.id ? 'wrong' : undefined}
            />
          </div>
        ))}

        {ghosts.map((g) => (
          <div
            key={g.key}
            aria-hidden="true"
            className={`nr-note nr-note--ghost nr-note--${g.kind}`}
            style={{ transform: noteTransform(g.x, geom) }}
          >
            <NoteSprite pitch={g.pitch} clef={config.clef} size={size} range={range} state={g.kind === 'correct' ? 'correct' : 'wrong'} />
            {g.label ? (
              <span className="nr-ghost-label" style={{ marginLeft: -4 }}>
                {g.label}
              </span>
            ) : null}
          </div>
        ))}

        {run === 'paused' ? (
          <div className="nr-overlay" role="group" aria-label="Paused">
            <p className="m-0 text-3xl font-black uppercase tracking-widest">Paused</p>
            <Button size="lg" onClick={resume} autoFocus>
              Resume
            </Button>
          </div>
        ) : null}
        {run === 'countdown' ? (
          <div className="nr-overlay" aria-hidden="true" data-testid="nr-countdown">
            <p className="nr-count m-0" key={count}>
              {count}
            </p>
          </div>
        ) : null}
      </div>

      {config.answerMode === 'letters' ? (
        <LetterPad disabled={frozen} onAnswer={submit} />
      ) : (
        <div aria-label="Answer on the keyboard" role="group">
          <Keyboard
            low={KEYBOARD_LOW}
            high={KEYBOARD_HIGH}
            showLabels
            sound={settings.soundOn}
            disabled={frozen}
            onNote={onPianoNote}
          />
        </div>
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
