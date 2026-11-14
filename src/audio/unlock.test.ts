import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  state: 'suspended' as string,
  /** What Tone.start() does on this call. */
  startBehaviour: 'resume' as 'resume' | 'hang',
  started: 0,
}));

vi.mock('tone', () => {
  class Node {
    volume = { value: 0 };
    maxPolyphony = 0;
    toDestination() {
      return this;
    }
  }
  return {
    Synth: Node,
    PolySynth: Node,
    Sampler: Node,
    start: () => {
      h.started += 1;
      if (h.startBehaviour === 'hang') return new Promise<void>(() => {});
      h.state = 'running';
      return Promise.resolve();
    },
    now: () => 0,
    getContext: () => ({
      currentTime: 0,
      lookAhead: 0.1,
      get state() {
        return h.state;
      },
    }),
    getDestination: () => ({ mute: false }),
    getDraw: () => ({ schedule: () => {} }),
  };
});

import { ToneAudioEngine } from './engine';
import { installGestureUnlock } from './gesture-unlock';

beforeEach(() => {
  h.state = 'suspended';
  h.startBehaviour = 'resume';
  h.started = 0;
  vi.useRealTimers();
});

describe('unlock on iOS-like browsers', () => {
  it('starts the context synchronously in the gesture once the library is preloaded', async () => {
    const engine = new ToneAudioEngine();
    await engine.preload();
    expect(h.started).toBe(0);
    const pending = engine.unlock();
    // No await between the gesture and the start call.
    expect(h.started).toBe(1);
    await pending;
    expect(engine.isUnlocked()).toBe(true);
  });

  it('does not hang or cache a failed attempt when the browser leaves the start pending', async () => {
    vi.useFakeTimers();
    const engine = new ToneAudioEngine();
    await engine.preload();
    h.startBehaviour = 'hang';
    const first = engine.unlock();
    await vi.advanceTimersByTimeAsync(2000);
    await first;
    expect(engine.isUnlocked()).toBe(false);

    // The next gesture is accepted by the browser.
    h.startBehaviour = 'resume';
    await engine.unlock();
    expect(h.started).toBe(2);
    expect(engine.isUnlocked()).toBe(true);
  });

  it('starts the context again after the browser suspends it', async () => {
    const engine = new ToneAudioEngine();
    await engine.preload();
    await engine.unlock();
    expect(engine.isUnlocked()).toBe(true);
    h.state = 'interrupted';
    await engine.unlock();
    expect(h.started).toBe(2);
    expect(engine.isUnlocked()).toBe(true);
  });

  it('does nothing more once the context is running', async () => {
    const engine = new ToneAudioEngine();
    await engine.preload();
    await engine.unlock();
    await engine.unlock();
    expect(h.started).toBe(1);
  });

  it('asks for the playback audio session where the browser offers one', async () => {
    const session = { type: 'auto' };
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true });
    const engine = new ToneAudioEngine();
    await engine.preload();
    await engine.unlock();
    expect(session.type).toBe('playback');
    delete (navigator as unknown as Record<string, unknown>).audioSession;
  });
});

describe('installGestureUnlock', () => {
  it('preloads at once and unlocks on the end of a touch, not before', async () => {
    const engine = new ToneAudioEngine();
    const preload = vi.spyOn(engine, 'preload');
    const unlock = vi.spyOn(engine, 'unlock');
    const remove = installGestureUnlock(engine);
    expect(preload).toHaveBeenCalledTimes(1);
    await preload.mock.results[0]?.value;

    document.dispatchEvent(new Event('pointerdown'));
    expect(unlock).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('touchend'));
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(h.started).toBe(1);

    remove();
    document.dispatchEvent(new Event('click'));
    expect(unlock).toHaveBeenCalledTimes(1);
  });
});
