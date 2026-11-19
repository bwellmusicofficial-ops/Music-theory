'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react';
import { getAudioEngine } from '@/audio';
import { Button } from '@/components/ui';
import { DEV_ROUTES_ENABLED } from '@/dev/enabled';
import { rhythm } from '@/engine/rhythm';
import { BeatIndicator } from './beat-indicator';
import { FeedbackRow } from './feedback-row';
import {
  DEFAULT_PERFECT_MS,
  DEFAULT_TOLERANCE_MS,
  applyLatency,
  createTapMatcher,
  expectedOnsets,
  resultOf,
  type TapMatcher,
} from './scoring';
import { TapTarget } from './tap-target';
import { ANNOUNCE_EVERY_S, BEAT_PULSE_MS, FLASH_MS, METRONOME_STOP_MARGIN_S, PULSE_MS, TICK_MS, VERDICT_MS } from './timing';
import type { OnsetJudgement, PadPhase, RhythmPadProps, TapResult } from './types';
import { VerdictChip, liveVerdictOf, verdictWord, type LiveVerdict } from './verdict-chip';

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';
function subscribeReduced(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(REDUCE_QUERY);
  mq.addEventListener?.('change', onChange);
  return () => mq.removeEventListener?.('change', onChange);
}
const readReduced = () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCE_QUERY).matches;

type Phase = 'idle' | 'starting' | 'count-in' | 'playing' | 'done';

interface Run {
  metro: { stop(): void } | null;
  metronomeStart: number;
  spb: number;
  perBar: number;
  countInBeats: number;
  playStart: number;
  endTime: number;
  /** Perform mode: the one matcher behind the live events and the final result. */
  matcher: TapMatcher | null;
  perfectMs: number;
  toleranceMs: number;
  windowMs: number;
  lastBeat: number;
  nextDue: number;
  lastAnnounce: number;
  metroStopAt: number | null;
  expected: number[];
  timer: ReturnType<typeof setInterval> | null;
}

export function RhythmPad({
  bars,
  time,
  bpm,
  countInBars = 1,
  onComplete,
  mode = 'perform',
  latencyOffsetMs = 0,
  metronome = true,
  onTap,
  perfectMs = DEFAULT_PERFECT_MS,
  toleranceMs = DEFAULT_TOLERANCE_MS,
  matchWindowMs,
  showRetry = true,
  onOnsetJudged,
  onExtraTap,
  onOnsetDue,
  onBeat,
  onPhase,
  reducedMotion = false,
  ref,
  autoStart = false,
  chrome = 'full',
  tapSize = 'default',
  clock,
  children,
}: RhythmPadProps) {
  const free = mode === 'free';
  const minimal = chrome === 'minimal';
  // A parent-owned clock only makes sense for a scored performance; free mode keeps its own click.
  const sharedClock = free ? undefined : clock;
  const perBar = rhythm.beatsPerBar(time);
  const [phase, setPhase] = useState<Phase>('idle');
  const [beat, setBeat] = useState(-1);
  const [pulsing, setPulsing] = useState(false);
  const [result, setResult] = useState<TapResult | null>(null);
  const [announce, setAnnounce] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const [hits, setHits] = useState(0);
  const [total, setTotal] = useState(0);
  const [verdict, setVerdict] = useState<LiveVerdict | null>(null);
  const [flash, setFlash] = useState<LiveVerdict | null>(null);
  const [beatPulse, setBeatPulse] = useState(false);
  const mqReduced = useSyncExternalStore(subscribeReduced, readReduced, () => false);
  const reduced = reducedMotion || mqReduced;

  const run = useRef<Run | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const mounted = useRef(true);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapCountRef = useRef(0);
  const hitsRef = useRef(0);
  const verdictTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportedPhase = useRef<PadPhase | null>(null);
  const latest = useRef({
    onComplete,
    onTap,
    latencyOffsetMs,
    perfectMs,
    toleranceMs,
    onOnsetJudged,
    onExtraTap,
    onOnsetDue,
    onBeat,
    onPhase,
    reduced,
  });
  useEffect(() => {
    latest.current = {
      onComplete,
      onTap,
      latencyOffsetMs,
      perfectMs,
      toleranceMs,
      onOnsetJudged,
      onExtraTap,
      onOnsetDue,
      onBeat,
      onPhase,
      reduced,
    };
  });

  const changePhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
    // The parent sees idle, count-in, playing, done; 'starting' is still idle to it.
    const reported: PadPhase = p === 'starting' ? 'idle' : p;
    if (reportedPhase.current === reported && reported !== 'idle') return;
    reportedPhase.current = reported;
    latest.current.onPhase?.(reported);
  }, []);

  /** Verdict word beside the tally, tally count, and (for a tap) the pad flash. Never called for free mode. */
  const showVerdict = useCallback((v: LiveVerdict, fromTap: boolean) => {
    setVerdict(v);
    if (verdictTimer.current) clearTimeout(verdictTimer.current);
    verdictTimer.current = setTimeout(() => setVerdict(null), VERDICT_MS);
    if (!fromTap) return;
    setFlash(v);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    // Reduced motion: the colour stays until the next tap instead of blinking.
    if (!latest.current.reduced) flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  }, []);

  const judged = useCallback(
    (j: OnsetJudgement, fromTap: boolean) => {
      if (j.verdict !== 'miss') {
        hitsRef.current += 1;
        setHits(hitsRef.current);
      }
      showVerdict(liveVerdictOf(j), fromTap);
      latest.current.onOnsetJudged?.(j);
      // The live region gets the running verdict at most every few seconds; the summary comes at the end.
      const r = run.current;
      const at = getAudioEngine().now();
      if (r && at - r.lastAnnounce >= ANNOUNCE_EVERY_S) {
        r.lastAnnounce = at;
        setAnnounce(`${verdictWord(liveVerdictOf(j))}. ${hitsRef.current} of ${r.matcher?.size ?? 0} hit.`);
      }
    },
    [showVerdict],
  );

  const clearRun = useCallback(() => {
    const r = run.current;
    if (!r) return;
    if (r.timer) clearInterval(r.timer);
    r.metro?.stop();
    r.metro = null;
    r.timer = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearRun();
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
      if (verdictTimer.current) clearTimeout(verdictTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (beatTimer.current) clearTimeout(beatTimer.current);
    };
  }, [clearRun]);

  const finish = useCallback(() => {
    const r = run.current;
    if (!r) return;
    clearRun();
    // Onsets still undecided are misses; the live events and the result come from one matcher.
    const matcher = r.matcher as TapMatcher;
    for (const j of matcher.finish()) judged(j, false);
    const res = resultOf(matcher, { perfectMs: r.perfectMs, toleranceMs: r.toleranceMs });
    setResult(res);
    setBeat(-1);
    changePhase('done');
    const pct = Math.round(res.accuracy * 100);
    const missed = res.errorsMs.filter((e) => e === null).length;
    setAnnounce(
      `Finished. Accuracy ${pct} percent. ${res.errorsMs.length - missed} of ${res.errorsMs.length} hit, ${missed} missed, ${res.extraTaps} extra ${res.extraTaps === 1 ? 'tap' : 'taps'}.`,
    );
    latest.current.onComplete(res);
  }, [clearRun, changePhase, judged]);

  const tick = useCallback(() => {
    const r = run.current;
    if (!r) return;
    const now = getAudioEngine().now();
    if (r.metro && r.metroStopAt !== null && now >= r.metroStopAt) {
      r.metro.stop();
      r.metro = null;
    }
    // A microsecond of slack, so a tick exactly on a beat is not read as just before it.
    const beatCount = Math.floor((now - r.metronomeStart) / r.spb + 1e-6);
    if (beatCount < 0) {
      setBeat(-1);
      return;
    }
    setBeat(beatCount % r.perBar);
    if (!free && beatCount >= r.countInBeats && phaseRef.current === 'count-in') {
      changePhase('playing');
      setAnnounce('Go');
    }
    if (beatCount !== r.lastBeat) {
      r.lastBeat = beatCount;
      const bar = Math.floor(beatCount / r.perBar);
      latest.current.onBeat?.(beatCount % r.perBar, free ? bar % Math.max(1, bars.length) : bar - r.countInBeats / r.perBar);
      if (!latest.current.reduced) {
        setBeatPulse(true);
        if (beatTimer.current) clearTimeout(beatTimer.current);
        beatTimer.current = setTimeout(() => setBeatPulse(false), BEAT_PULSE_MS);
      }
    }
    if (free) return;
    while (r.nextDue < r.expected.length && now >= r.expected[r.nextDue]) {
      latest.current.onOnsetDue?.(r.nextDue);
      r.nextDue += 1;
    }
    if (r.matcher) {
      for (const j of r.matcher.advance(now - latest.current.latencyOffsetMs / 1000)) judged(j, false);
    }
    if (now >= r.endTime) finish();
  }, [free, bars.length, finish, changePhase, judged]);

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'done') return;
    const engine = getAudioEngine();
    changePhase('starting');
    setResult(null);
    setError(null);
    setBeat(-1);
    tapCountRef.current = 0;
    setTapCount(0);
    hitsRef.current = 0;
    setHits(0);
    setTotal(0);
    setVerdict(null);
    setFlash(null);
    setAnnounce('Starting');
    // unlock() is called synchronously inside the user gesture.
    try {
      await engine.unlock();
    } catch {
      if (!mounted.current) return;
      changePhase('idle');
      setError('Sound could not be started on this device.');
      setAnnounce('Sound could not be started on this device.');
      return;
    }
    try {
      await engine.load();
    } catch {
      // The engine falls back to its synth voice; clicks still work.
    }
    if (!mounted.current) return;

    const spb = 60 / bpm;
    const countInBeats = free ? 0 : Math.max(0, Math.round(countInBars)) * perBar;
    // With a parent-owned clock the click is already running: the count-in starts on its next bar line.
    const metro = sharedClock ? null : engine.startMetronome(time, bpm);
    const metronomeStart = sharedClock ? sharedClock.claimBarLine(time, bpm) : (metro as { startTime: number }).startTime;
    const playStart = metronomeStart + countInBeats * spb;
    const scoreBeats = bars.length * perBar;
    const stopOffset = Math.min(METRONOME_STOP_MARGIN_S, spb - 0.01);
    const windowMs = Math.max(matchWindowMs ?? toleranceMs, toleranceMs);
    const expected = free ? [] : expectedOnsets(bars, time, bpm, countInBeats * spb, metronomeStart);
    setTotal(expected.length);
    run.current = {
      metro,
      metronomeStart,
      spb,
      perBar,
      countInBeats,
      playStart,
      endTime: metronomeStart + (countInBeats + scoreBeats + 1) * spb,
      metroStopAt: !free && !metronome && !sharedClock ? playStart - stopOffset : null,
      expected,
      matcher: free ? null : createTapMatcher(expected, { perfectMs, toleranceMs, windowMs }),
      perfectMs,
      toleranceMs,
      windowMs,
      lastBeat: -1,
      nextDue: 0,
      lastAnnounce: -Infinity,
      timer: setInterval(tick, TICK_MS),
    };
    // Test hook (dev routes only): the audio-clock times the taps are judged against, so a browser test can tap on time.
    if (DEV_ROUTES_ENABLED) {
      const w = window as unknown as { __rhythmRun?: { id: number; expected: number[]; now: () => number } };
      w.__rhythmRun = { id: (w.__rhythmRun?.id ?? 0) + 1, expected: [...expected], now: () => engine.now() };
    }
    if (free) {
      changePhase('playing');
      setAnnounce('Playing along. Tap freely.');
    } else if (countInBeats > 0) {
      changePhase('count-in');
      setAnnounce(`Count-in, ${Array.from({ length: perBar }, (_, i) => i + 1).join(', ')}`);
    } else {
      changePhase('playing');
      setAnnounce('Go');
    }
  }, [bars, bpm, countInBars, free, metronome, perBar, time, tick, changePhase, perfectMs, toleranceMs, matchWindowMs, sharedClock]);

  const stopFree = useCallback(() => {
    clearRun();
    setBeat(-1);
    setBeatPulse(false);
    changePhase('idle');
    setAnnounce(free ? `Stopped. ${tapCountRef.current} taps.` : 'Stopped.');
  }, [clearRun, changePhase, free]);

  // The parent's controls. `start` is the same function the Start button runs.
  useImperativeHandle(
    ref,
    () => ({
      start,
      stop: () => {
        const p = phaseRef.current;
        if (p === 'count-in' || p === 'playing') stopFree();
      },
    }),
    [start, stopFree],
  );

  useEffect(() => {
    // In a microtask so the effect itself sets no state; a second call (StrictMode) finds the pad already starting.
    if (autoStart)
      queueMicrotask(() => {
        if (mounted.current) void start();
      });
    // Once, on mount: later changes to bars or tempo do not restart a performance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTap = useCallback(() => {
    // Read the clock first: this is the timestamp that gets scored.
    const engine = getAudioEngine();
    const at = engine.now();
    const p = phaseRef.current;
    const r = run.current;
    if (!r || (p !== 'count-in' && p !== 'playing')) return;
    // A tap on the first onset can come before the next tick has moved the phase on.
    if (!free && p === 'count-in' && at >= r.playStart - 1e-6) {
      changePhase('playing');
      setAnnounce('Go');
    }
    engine.playUi('tap');
    setPulsing(true);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulsing(false), PULSE_MS);
    if (free) {
      tapCountRef.current += 1;
      setTapCount(tapCountRef.current);
      latest.current.onTap?.(tapCountRef.current);
      return;
    }
    const corrected = applyLatency([at], latest.current.latencyOffsetMs)[0];
    // Taps during the count-in only count if they are within reach of the first onset.
    if (!r.matcher || corrected < r.playStart - r.windowMs / 1000) return;
    const outcome = r.matcher.tap(corrected);
    if (outcome.kind === 'matched') {
      judged(outcome.judgement, true);
    } else {
      showVerdict('extra', true);
      latest.current.onExtraTap?.();
    }
  }, [free, judged, showVerdict, changePhase]);

  const running = phase === 'count-in' || phase === 'playing';
  const showStart = !minimal && (phase === 'idle' || phase === 'starting');
  const showRetryButton = !minimal && phase === 'done' && showRetry;
  const showControls = showStart || showRetryButton || (free && running);
  const status =
    phase === 'count-in' ? 'Count-in' : phase === 'playing' ? (free ? 'Play along' : 'Tap the rhythm') : '';

  return (
    <section
      aria-label={free ? 'Rhythm play-along' : 'Rhythm pad'}
      data-phase={phase}
      data-chrome={chrome}
      className={minimal ? 'flex flex-col items-stretch gap-2' : 'flex flex-col items-stretch gap-4'}
    >
      {children}
      <div className="flex min-h-12 flex-col items-center gap-2">
        <BeatIndicator beatsPerBar={perBar} current={running ? beat : -1} />
        <div className="flex min-h-7 items-center justify-center gap-3">
          <p aria-hidden="true" className="text-sm text-fg-secondary" data-testid="status-text">
            {status}
          </p>
          {!free && running && total > 0 ? (
            <p aria-hidden="true" className="text-sm font-semibold text-fg tabular-nums" data-testid="tally">
              {`${hits} of ${total} hit`}
            </p>
          ) : null}
          {!free && running ? (
            <span className="flex min-w-24 items-center">{verdict ? <VerdictChip verdict={verdict} /> : null}</span>
          ) : null}
        </div>
      </div>
      <TapTarget
        onTap={handleTap}
        active={running}
        pulsing={pulsing}
        flash={free ? null : flash}
        beatPulse={running && beatPulse}
        reduced={reduced}
        label={free ? 'Tap along' : 'Tap the rhythm'}
        size={tapSize}
      />
      {showControls ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {showStart ? (
            <Button onClick={start} loading={phase === 'starting'} size="lg">
              Start
            </Button>
          ) : null}
          {free && running ? (
            <Button variant="secondary" onClick={stopFree}>
              Stop
            </Button>
          ) : null}
          {showRetryButton ? (
            <Button variant="secondary" onClick={start}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
      {free && tapCount > 0 ? (
        <p className="text-center text-sm text-fg-secondary">{`Taps: ${tapCount}`}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-center text-danger">
          {error}
        </p>
      ) : null}
      {result && !minimal ? (
        <div className="flex flex-col items-center gap-3" data-testid="result">
          <p className="text-lg font-semibold">{`Accuracy ${Math.round(result.accuracy * 100)}%`}</p>
          <FeedbackRow errorsMs={result.errorsMs} perfectMs={perfectMs} toleranceMs={toleranceMs} />
          {result.extraTaps > 0 ? (
            <p className="text-sm text-fg-secondary">{`Extra taps: ${result.extraTaps}`}</p>
          ) : null}
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only" data-testid="live-region">
        {announce}
      </p>
    </section>
  );
}
