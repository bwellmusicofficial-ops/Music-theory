'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '@/audio';
import { Button } from '@/components/ui';
import type { TimeSignature } from '@/engine/types';
import { BeatIndicator } from './beat-indicator';
import { calibrationOffset, matchTaps } from './scoring';
import { TapTarget } from './tap-target';
import { PULSE_MS, TICK_MS } from './timing';

export const CALIBRATION_CLICKS = 8;
const TIME: TimeSignature = { beats: 4, beatUnit: 4 };

export interface LatencyCalibrationProps {
  /** Called with the offset in ms (-50..300). Storage is the caller's concern. */
  onCalibrated: (offsetMs: number) => void;
  /** Click tempo. Default 80. */
  bpm?: number;
}

type Phase = 'idle' | 'starting' | 'running' | 'done';

export function LatencyCalibration({ onCalibrated, bpm = 80 }: LatencyCalibrationProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [beat, setBeat] = useState(-1);
  const [pulsing, setPulsing] = useState(false);
  const [offset, setOffset] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [error, setError] = useState<string | null>(null);

  const phaseRef = useRef<Phase>('idle');
  const mounted = useRef(true);
  const taps = useRef<number[]>([]);
  const state = useRef<{ start: number; spb: number; timer: ReturnType<typeof setInterval>; metro: { stop(): void } } | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCalibratedRef = useRef(onCalibrated);
  useEffect(() => {
    onCalibratedRef.current = onCalibrated;
  });

  const changePhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const stopAll = useCallback(() => {
    const s = state.current;
    if (!s) return;
    clearInterval(s.timer);
    s.metro.stop();
    state.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopAll();
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
  }, [stopAll]);

  const finish = useCallback(() => {
    const s = state.current;
    if (!s) return;
    stopAll();
    const expected = Array.from({ length: CALIBRATION_CLICKS }, (_, i) => s.start + i * s.spb);
    // Half a beat either side, so a late tap is still paired with the click it aims at.
    const { errorsMs } = matchTaps(expected, taps.current, (s.spb * 1000) / 2);
    const value = calibrationOffset(errorsMs, 6, 3);
    setBeat(-1);
    changePhase('done');
    if (value === null) {
      setFailed(true);
      setOffset(null);
      setAnnounce('Not enough taps were heard. Try again.');
      return;
    }
    setFailed(false);
    setOffset(value);
    setAnnounce(`Calibrated. Offset ${value} milliseconds.`);
    onCalibratedRef.current(value);
  }, [stopAll, changePhase]);

  const tick = useCallback(() => {
    const s = state.current;
    if (!s) return;
    const now = getAudioEngine().now();
    const n = Math.floor((now - s.start) / s.spb);
    setBeat(n < 0 ? -1 : n % TIME.beats);
    // Ends one beat after the last click.
    if (now >= s.start + CALIBRATION_CLICKS * s.spb) finish();
  }, [finish]);

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'done') return;
    const engine = getAudioEngine();
    changePhase('starting');
    setError(null);
    setFailed(false);
    setOffset(null);
    setAnnounce('Starting');
    taps.current = [];
    try {
      await engine.unlock();
    } catch {
      if (!mounted.current) return;
      changePhase('idle');
      setError('Sound could not be started on this device.');
      return;
    }
    try {
      await engine.load();
    } catch {
      // Synth fallback still clicks.
    }
    if (!mounted.current) return;
    const spb = 60 / bpm;
    const metro = engine.startMetronome(TIME, bpm);
    state.current = { start: metro.startTime, spb, metro, timer: setInterval(tick, TICK_MS) };
    changePhase('running');
    setAnnounce(`Tap along with the ${CALIBRATION_CLICKS} clicks.`);
  }, [bpm, tick, changePhase]);

  const handleTap = useCallback(() => {
    const engine = getAudioEngine();
    const at = engine.now();
    if (phaseRef.current !== 'running') return;
    engine.playUi('tap');
    taps.current.push(at);
    setPulsing(true);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulsing(false), PULSE_MS);
  }, []);

  const running = phase === 'running';
  return (
    <section aria-label="Latency calibration" data-phase={phase} className="flex flex-col items-stretch gap-4">
      <p className="text-center text-fg-secondary">
        {`Tap along with ${CALIBRATION_CLICKS} clicks. Tap exactly on each click.`}
      </p>
      <BeatIndicator beatsPerBar={TIME.beats} current={running ? beat : -1} />
      <TapTarget onTap={handleTap} active={running} pulsing={pulsing} label="Tap with the click" />
      <div className="flex justify-center gap-3">
        {phase === 'idle' || phase === 'starting' ? (
          <Button size="lg" onClick={start} loading={phase === 'starting'}>
            Start calibration
          </Button>
        ) : null}
        {phase === 'done' ? (
          <Button variant="secondary" onClick={start}>
            Try again
          </Button>
        ) : null}
      </div>
      {offset !== null ? (
        <p className="text-center text-lg font-semibold" data-testid="calibration-result">
          {`Your offset is ${offset} ms`}
        </p>
      ) : null}
      {failed ? (
        <p className="text-center text-danger" data-testid="calibration-failed">
          Not enough taps were heard. Try again.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-center text-danger">
          {error}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
    </section>
  );
}
