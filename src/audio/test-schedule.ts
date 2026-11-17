import { vi } from 'vitest';
import type { Passage } from '@/engine/types';
import { ToneAudioEngine } from './engine';
import { callsOf, mock, resetMock } from './test-tone-mock';

/** What `playPassage` asked the voices to do, with times relative to the first scheduled sound. */
export interface Recorded {
  /** Voice notes: seconds from the start, sounding seconds, pitch in Hz, velocity. */
  notes: { time: number; duration: number; hz: number; velocity: number }[];
  clicks: { time: number; hz: number }[];
  /** Cursor callbacks: when the draw was scheduled, and the position onEvent reported. */
  cursor: { time: number; bar: number; event: number }[];
  /** Seconds (from the start) at which `done` had not yet resolved / had resolved. */
  doneResolved: boolean;
}

/** The engine starts scheduling this long after "now" (see START_LEAD in engine.ts). */
export const START = 10.1;
const round = (x: number) => Math.round(x * 1e9) / 1e9;

/**
 * Plays a passage on a fake clock and records everything scheduled. The caller
 * must have `vi.mock('tone', ...)` set up and fake timers are managed here.
 */
export async function record(
  passage: Passage,
  options: { bpm: number; countInBeats?: number },
  voice: 'synth' | 'sampled' = 'synth',
): Promise<Recorded> {
  vi.useFakeTimers();
  resetMock();
  try {
    const engine = new ToneAudioEngine({
      fetchImpl: async () => new Response(JSON.stringify({ files: ['C4.mp3'] }), { status: 200 }),
    });
    await engine.unlock();
    if (voice === 'sampled') await engine.load();
    const onEvent = vi.fn();
    const handle = engine.playPassage(passage, { ...options, onEvent });
    let doneResolved = false;
    void handle.done.then(() => (doneResolved = true));
    for (let i = 0; i < 4000 && !doneResolved; i++) {
      mock.currentTime += 0.05;
      await vi.advanceTimersByTimeAsync(25);
    }
    const kind = voice === 'sampled' ? 'sampler' : 'poly';
    const notes = callsOf(kind, 'triggerAttackRelease').map((c) => {
      const [hz, duration, time, velocity] = c.args as number[];
      return { time: round(time - START), duration: round(duration), hz: round(hz), velocity: round(velocity) };
    });
    const clicks = callsOf('synth', 'triggerAttackRelease').map((c) => {
      const [hz, , time] = c.args as number[];
      return { time: round(time - START), hz: round(hz) };
    });
    const cursor: Recorded['cursor'] = [];
    for (const d of mock.draws) {
      const before = onEvent.mock.calls.length;
      d.cb();
      const call = onEvent.mock.calls[before] as [number, number] | undefined;
      if (call) cursor.push({ time: round(d.time - START), bar: call[0], event: call[1] });
    }
    return { notes, clicks, cursor, doneResolved };
  } finally {
    vi.useRealTimers();
  }
}
