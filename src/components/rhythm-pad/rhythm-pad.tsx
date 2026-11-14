'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '@/audio';
import { Button } from '@/components/ui';
import { rhythm } from '@/engine/rhythm';
import { BeatIndicator } from './beat-indicator';
import { FeedbackRow } from './feedback-row';
import {
  DEFAULT_PERFECT_MS,
  DEFAULT_TOLERANCE_MS,
  applyLatency,
  expectedOnsets,
  scoreTaps,
} from './scoring';
import { TapTarget } from './tap-target';
import { METRONOME_STOP_MARGIN_S, PULSE_MS, TICK_MS } from './timing';
import type { RhythmPadProps, TapResult } from './types';

type Phase = 'idle' | 'starting' | 'count-in' | 'playing' | 'done';

interface Run {
  metro: { stop(): void } | null;
  metronomeStart: number;
  spb: number;
  perBar: number;
  countInBeats: number;
  playStart: number;
  endTime: number;
  metroStopAt: number | null;
  expected: number[];
  /** Latency-corrected tap times on the audio clock. */
  taps: number[];
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
  showRetry = true,
  children,
}: RhythmPadProps) {
  const free = mode === 'free';
  const perBar = rhythm.beatsPerBar(time);
  const [phase, setPhase] = useState<Phase>('idle');
  const [beat, setBeat] = useState(-1);
  const [pulsing, setPulsing] = useState(false);
  const [result, setResult] = useState<TapResult | null>(null);
  const [announce, setAnnounce] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tapCount, setTapCount] = useState(0);

  const run = useRef<Run | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const mounted = useRef(true);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapCountRef = useRef(0);
  const latest = useRef({ onComplete, onTap, latencyOffsetMs, perfectMs, toleranceMs });
  useEffect(() => {
    latest.current = { onComplete, onTap, latencyOffsetMs, perfectMs, toleranceMs };
  });

  const changePhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

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
    };
  }, [clearRun]);

  const finish = useCallback(() => {
    const r = run.current;
    if (!r) return;
    clearRun();
    const { perfectMs: p, toleranceMs: t } = latest.current;
    const res = scoreTaps(r.expected, r.taps, { perfectMs: p, toleranceMs: t });
    setResult(res);
    setBeat(-1);
    changePhase('done');
    const pct = Math.round(res.accuracy * 100);
    const missed = res.errorsMs.filter((e) => e === null).length;
    setAnnounce(
      `Finished. Accuracy ${pct} percent. ${missed} missed, ${res.extraTaps} extra ${res.extraTaps === 1 ? 'tap' : 'taps'}.`,
    );
    latest.current.onComplete(res);
  }, [clearRun, changePhase]);

  const tick = useCallback(() => {
    const r = run.current;
    if (!r) return;
    const now = getAudioEngine().now();
    if (r.metro && r.metroStopAt !== null && now >= r.metroStopAt) {
      r.metro.stop();
      r.metro = null;
    }
    const beatCount = Math.floor((now - r.metronomeStart) / r.spb);
    if (beatCount < 0) {
      setBeat(-1);
      return;
    }
    setBeat(beatCount % r.perBar);
    if (free) return;
    if (now >= r.endTime) {
      finish();
      return;
    }
    if (beatCount >= r.countInBeats && phaseRef.current === 'count-in') {
      changePhase('playing');
      setAnnounce('Go');
    }
  }, [free, finish, changePhase]);

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'done') return;
    const engine = getAudioEngine();
    changePhase('starting');
    setResult(null);
    setError(null);
    setBeat(-1);
    tapCountRef.current = 0;
    setTapCount(0);
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
    const metro = engine.startMetronome(time, bpm);
    const metronomeStart = metro.startTime;
    const playStart = metronomeStart + countInBeats * spb;
    const scoreBeats = bars.length * perBar;
    const stopOffset = Math.min(METRONOME_STOP_MARGIN_S, spb - 0.01);
    run.current = {
      metro,
      metronomeStart,
      spb,
      perBar,
      countInBeats,
      playStart,
      endTime: metronomeStart + (countInBeats + scoreBeats + 1) * spb,
      metroStopAt: !free && !metronome ? playStart - stopOffset : null,
      expected: free ? [] : expectedOnsets(bars, time, bpm, countInBeats * spb, metronomeStart),
      taps: [],
      timer: setInterval(tick, TICK_MS),
    };
    if (free) {
      changePhase('playing');
      setAnnounce('Playing along. Tap freely.');
    } else if (countInBeats > 0) {
      changePhase('count-in');
      setAnnounce(`Count-in, ${countInBeats} beats`);
    } else {
      changePhase('playing');
      setAnnounce('Go');
    }
  }, [bars, bpm, countInBars, free, metronome, perBar, time, tick, changePhase]);

  const stopFree = useCallback(() => {
    clearRun();
    setBeat(-1);
    changePhase('idle');
    setAnnounce(`Stopped. ${tapCountRef.current} taps.`);
  }, [clearRun, changePhase]);

  const handleTap = useCallback(() => {
    // Read the clock first: this is the timestamp that gets scored.
    const engine = getAudioEngine();
    const at = engine.now();
    const p = phaseRef.current;
    const r = run.current;
    if (!r || (p !== 'count-in' && p !== 'playing')) return;
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
    if (corrected >= r.playStart - latest.current.toleranceMs / 1000) r.taps.push(corrected);
  }, [free]);

  const running = phase === 'count-in' || phase === 'playing';
  const status =
    phase === 'count-in' ? 'Count-in' : phase === 'playing' ? (free ? 'Play along' : 'Tap the rhythm') : '';

  return (
    <section
      aria-label={free ? 'Rhythm play-along' : 'Rhythm pad'}
      data-phase={phase}
      className="flex flex-col items-stretch gap-4"
    >
      {children}
      <div className="flex min-h-12 flex-col items-center gap-2">
        <BeatIndicator beatsPerBar={perBar} current={running ? beat : -1} />
        <p aria-hidden="true" className="text-sm text-fg-secondary" data-testid="status-text">
          {status}
        </p>
      </div>
      <TapTarget
        onTap={handleTap}
        active={running}
        pulsing={pulsing}
        label={free ? 'Tap along' : 'Tap the rhythm'}
      />
      <div className="flex flex-wrap items-center justify-center gap-3">
        {phase === 'idle' || phase === 'starting' ? (
          <Button onClick={start} loading={phase === 'starting'} size="lg">
            Start
          </Button>
        ) : null}
        {free && running ? (
          <Button variant="secondary" onClick={stopFree}>
            Stop
          </Button>
        ) : null}
        {phase === 'done' && showRetry ? (
          <Button variant="secondary" onClick={start}>
            Try again
          </Button>
        ) : null}
      </div>
      {free && tapCount > 0 ? (
        <p className="text-center text-sm text-fg-secondary">{`Taps: ${tapCount}`}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-center text-danger">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="flex flex-col items-center gap-3" data-testid="result">
          <p className="text-lg font-semibold">{`Accuracy ${Math.round(result.accuracy * 100)}%`}</p>
          <FeedbackRow errorsMs={result.errorsMs} perfectMs={perfectMs} />
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
