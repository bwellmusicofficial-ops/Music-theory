import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bar, Passage, Pitch } from '@/engine/types';

type Call = { name: string; args: unknown[] };

const h = vi.hoisted(() => {
  const state = {
    currentTime: 10,
    samplerMode: 'load' as 'load' | 'error' | 'hang',
    samplerOptions: null as null | Record<string, unknown>,
    draws: [] as { cb: () => void; time: number }[],
    dest: { mute: false },
    ctx: { currentTime: 0, lookAhead: 0.1 },
    started: 0,
    instances: [] as { kind: string; calls: Call[]; disposed: boolean }[],
  };
  return state;
});

vi.mock('tone', () => {
  class Node {
    calls: Call[] = [];
    disposed = false;
    volume = { value: 0 };
    maxPolyphony = 0;
    constructor(public kind: string) {
      h.instances.push(this);
    }
    rec(name: string, args: unknown[]) {
      this.calls.push({ name, args });
    }
    toDestination() {
      return this;
    }
    triggerAttack(...a: unknown[]) {
      this.rec('triggerAttack', a);
    }
    triggerRelease(...a: unknown[]) {
      this.rec('triggerRelease', a);
    }
    triggerAttackRelease(...a: unknown[]) {
      this.rec('triggerAttackRelease', a);
    }
    releaseAll(...a: unknown[]) {
      this.rec('releaseAll', a);
    }
    dispose() {
      this.disposed = true;
    }
  }
  class Synth extends Node {
    constructor() {
      super('synth');
    }
  }
  class PolySynth extends Node {
    constructor() {
      super('poly');
    }
  }
  class Sampler extends Node {
    constructor(options: Record<string, unknown>) {
      super('sampler');
      h.samplerOptions = options;
      if (h.samplerMode === 'load') queueMicrotask(() => (options.onload as () => void)());
      if (h.samplerMode === 'error')
        queueMicrotask(() => (options.onerror as (e: Error) => void)(new Error('404')));
    }
  }
  h.ctx = { get currentTime() { return h.currentTime; }, lookAhead: 0.1 } as typeof h.ctx;
  return {
    Synth,
    PolySynth,
    Sampler,
    start: async () => {
      h.started += 1;
    },
    now: () => h.currentTime + 0.01,
    getContext: () => h.ctx,
    getDestination: () => h.dest,
    getDraw: () => ({
      schedule: (cb: () => void, time: number) => h.draws.push({ cb, time }),
    }),
  };
});

import { pianoSampleUrls } from './samples';
import { ToneAudioEngine } from './engine';

const C4: Pitch = { letter: 'C', accidental: 0, octave: 4 };
const E4: Pitch = { letter: 'E', accidental: 0, octave: 4 };

function calls(kind: string, name?: string): Call[] {
  return h.instances
    .filter((i) => i.kind === kind)
    .flatMap((i) => i.calls)
    .filter((c) => !name || c.name === name);
}

function passage(bars: Bar[]): Passage {
  return {
    clef: 'treble',
    key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
    time: { beats: 4, beatUnit: 4 },
    bars,
  };
}

const crotchet = { value: 'crotchet', dots: 0 } as const;

beforeEach(() => {
  vi.useFakeTimers();
  h.currentTime = 10;
  h.samplerMode = 'load';
  h.samplerOptions = null;
  h.draws = [];
  h.dest.mute = false;
  h.started = 0;
  h.instances.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

const ALL_FILES = Object.values(pianoSampleUrls());
/** A fetch that serves a manifest listing the given files (default: all 30), and records the requests. */
function manifestFetch(files: string[] | null = ALL_FILES) {
  return vi.fn<typeof fetch>(async () =>
    files ? new Response(JSON.stringify({ files }), { status: 200 }) : new Response('', { status: 404 }),
  );
}

async function unlocked(options?: ConstructorParameters<typeof ToneAudioEngine>[0]) {
  const engine = new ToneAudioEngine({ fetchImpl: manifestFetch(), ...options });
  await engine.unlock();
  return engine;
}

describe('unlock', () => {
  it('starts Tone, is idempotent, sets a low lookAhead', async () => {
    const engine = new ToneAudioEngine();
    expect(engine.isUnlocked()).toBe(false);
    await Promise.all([engine.unlock(), engine.unlock()]);
    await engine.unlock();
    expect(engine.isUnlocked()).toBe(true);
    expect(h.started).toBe(1);
    expect(h.ctx.lookAhead).toBeLessThanOrEqual(0.02);
  });

  it('nothing sounds before unlock', () => {
    const engine = new ToneAudioEngine();
    engine.noteOn(C4);
    engine.playUi('tap');
    const { done } = engine.playPassage(passage([{ events: [{ kind: 'note', pitches: [C4], duration: crotchet }] }]), { bpm: 60 });
    const silent = engine.startMetronome({ beats: 4, beatUnit: 4 }, 60);
    expect(typeof silent.startTime).toBe('number');
    silent.stop();
    expect(h.instances).toHaveLength(0);
    return expect(done).resolves.toBeUndefined();
  });
});

describe('piano voice', () => {
  it('loads samples from the configurable base URL in Salamander layout', async () => {
    const engine = await unlocked({ sampleBaseUrl: '/custom/piano' });
    expect(engine.voice()).toBe('synth');
    await engine.load();
    expect(engine.voice()).toBe('sampled');
    expect(h.samplerOptions?.baseUrl).toBe('/custom/piano/');
    const urls = h.samplerOptions?.urls as Record<string, string>;
    expect(Object.keys(urls)).toHaveLength(30);
    expect(urls['F#4']).toBe('Fs4.mp3');
  });

  it('defaults to /audio/piano/', async () => {
    const engine = await unlocked();
    await engine.load();
    expect(h.samplerOptions?.baseUrl).toBe('/audio/piano/');
  });

  it('makes exactly one request when there is no manifest, and never asks for an mp3', async () => {
    const fetchImpl = manifestFetch(null);
    const engine = await unlocked({ fetchImpl });
    await engine.load();
    await engine.load();
    expect(fetchImpl.mock.calls.map((c) => String(c[0]))).toEqual(['/audio/piano/manifest.json']);
    expect(engine.voice()).toBe('synth');
    expect(h.samplerOptions).toBeNull();
    engine.noteOn(C4);
    expect(calls('poly', 'triggerAttack')).toHaveLength(1);
  });

  it('falls back to the synth when the manifest request fails or is not valid', async () => {
    for (const fetchImpl of [
      vi.fn(async () => Promise.reject(new Error('offline'))),
      vi.fn(async () => new Response('not json', { status: 200 })),
      vi.fn(async () => new Response(JSON.stringify({ files: [] }), { status: 200 })),
    ]) {
      const engine = await unlocked({ fetchImpl });
      await engine.load();
      expect(engine.voice()).toBe('synth');
    }
    expect(h.samplerOptions).toBeNull();
  });

  it('with a manifest, loads only the listed files', async () => {
    const engine = await unlocked({ fetchImpl: manifestFetch(['A0.mp3', 'C4.mp3', 'Fs4.mp3']) });
    await engine.load();
    expect(engine.voice()).toBe('sampled');
    expect(h.samplerOptions?.urls).toEqual({ A0: 'A0.mp3', C4: 'C4.mp3', 'F#4': 'Fs4.mp3' });
  });

  it('reads the manifest from the configured base URL', async () => {
    const fetchImpl = manifestFetch();
    const engine = await unlocked({ sampleBaseUrl: '/custom/piano', fetchImpl });
    await engine.load();
    expect(String(fetchImpl.mock.calls[0][0])).toBe('/custom/piano/manifest.json');
  });

  it('falls back to the synth when samples fail, and still resolves', async () => {
    h.samplerMode = 'error';
    const engine = await unlocked();
    await expect(engine.load()).resolves.toBeUndefined();
    expect(engine.voice()).toBe('synth');
    expect(h.instances.find((i) => i.kind === 'sampler')?.disposed).toBe(true);
    engine.noteOn(C4);
    expect(calls('poly', 'triggerAttack')).toHaveLength(1);
    expect(calls('sampler')).toHaveLength(0);
  });

  it('falls back when loading times out', async () => {
    h.samplerMode = 'hang';
    const engine = await unlocked({ loadTimeoutMs: 500 });
    const loading = engine.load();
    await vi.advanceTimersByTimeAsync(600);
    await expect(loading).resolves.toBeUndefined();
    expect(engine.voice()).toBe('synth');
  });

  it('load is safe to call repeatedly', async () => {
    const engine = await unlocked();
    const a = engine.load();
    const b = engine.load();
    expect(a).toBe(b);
    await a;
    await engine.load();
    expect(h.instances.filter((i) => i.kind === 'sampler')).toHaveLength(1);
  });

  it('uses the sampler for notes once loaded', async () => {
    const engine = await unlocked();
    await engine.load();
    engine.noteOn(C4, 0.5);
    engine.noteOff(C4);
    const on = calls('sampler', 'triggerAttack')[0].args;
    expect(on[0]).toBeCloseTo(261.6256, 3);
    expect(on[2]).toBe(0.5);
    expect(calls('sampler', 'triggerRelease')).toHaveLength(1);
    expect(calls('poly', 'triggerAttack')).toHaveLength(0);
  });
});

describe('playPassage', () => {
  const bars: Bar[] = [
    {
      events: [
        { kind: 'note', pitches: [C4], duration: crotchet, tieToNext: true },
        { kind: 'note', pitches: [C4], duration: crotchet },
        { kind: 'rest', duration: crotchet },
        { kind: 'note', pitches: [C4, E4], duration: crotchet },
      ],
    },
  ];

  it('schedules attacks at exact times, ties without re-attack, and finishes', async () => {
    const engine = await unlocked();
    const onEvent = vi.fn();
    const handle = engine.playPassage(passage(bars), { bpm: 120, countInBeats: 2, onEvent });
    let finished = false;
    void handle.done.then(() => (finished = true));

    // advance the audio clock past everything and let the pump run
    for (let i = 0; i < 40; i++) {
      h.currentTime += 0.1;
      await vi.advanceTimersByTimeAsync(25);
    }
    expect(finished).toBe(true);

    const base = 10 + 0.1;
    const notes = calls('poly', 'triggerAttackRelease');
    // tied C (1.0 s sustained minus release gap), chord C+E
    expect(notes).toHaveLength(3);
    const [tied, c, e] = notes.map((n) => n.args as number[]);
    expect(tied[0]).toBeCloseTo(261.6256, 3);
    expect(tied[2]).toBeCloseTo(base + 1, 9); // after 2-beat count-in at 0.5 s
    expect(tied[1]).toBeCloseTo(1 - 0.03, 9);
    expect(c[2]).toBeCloseTo(base + 2.5, 9); // chord: 1 s count-in + 3 crotchets
    expect(e[0]).toBeCloseTo(329.6276, 3);
    expect(e[2]).toBeCloseTo(c[2], 12);

    // count-in clicks: accent then normal, as seconds in the click synth
    const clicks = calls('synth', 'triggerAttackRelease').map((x) => x.args);
    expect(clicks).toHaveLength(2);
    expect(clicks[0][0]).toBeGreaterThan(clicks[1][0] as number);
    expect(clicks[0][2]).toBeCloseTo(base, 9);
    expect(clicks[1][2]).toBeCloseTo(base + 0.5, 9);

    // draw callbacks: one per event (incl. continuation and rest), at event start
    expect(h.draws.map((x) => x.time)).toEqual([base + 1, base + 1.5, base + 2, base + 2.5]);
    h.draws.forEach((x) => x.cb());
    expect(onEvent.mock.calls).toEqual([[0, 0], [0, 1], [0, 2], [0, 3]]);
  });

  it('stop releases sound, silences cursor callbacks and resolves done', async () => {
    const engine = await unlocked();
    const onEvent = vi.fn();
    const handle = engine.playPassage(passage(bars), { bpm: 60, onEvent });
    await vi.advanceTimersByTimeAsync(30);
    const before = h.draws.length;
    handle.stop();
    await expect(handle.done).resolves.toBeUndefined();
    expect(calls('poly', 'releaseAll').length).toBeGreaterThanOrEqual(1);
    h.draws.forEach((x) => x.cb());
    expect(onEvent).not.toHaveBeenCalled();
    h.currentTime += 5;
    await vi.advanceTimersByTimeAsync(200);
    expect(h.draws.length).toBe(before); // nothing more scheduled
    handle.stop(); // idempotent
  });

  it('does not schedule everything up front', async () => {
    const engine = await unlocked();
    const handle = engine.playPassage(passage(bars), { bpm: 60 });
    // only events within the horizon so far: the first note at base
    expect(calls('poly', 'triggerAttackRelease')).toHaveLength(1);
    handle.stop();
  });
});

describe('metronome', () => {
  it('clicks on felt beats with accented downbeat, onBeat aligned via draw', async () => {
    const engine = await unlocked();
    const onBeat = vi.fn();
    // 6/8 at 120 felt beats per minute: 2 beats per bar, 0.5 s apart.
    const m = engine.startMetronome({ beats: 6, beatUnit: 8 }, 120, onBeat);
    // The first click is scheduled at startTime on the audio clock.
    expect(m.startTime).toBeCloseTo(10.1, 9);
    for (let i = 0; i < 10; i++) {
      h.currentTime += 0.25;
      await vi.advanceTimersByTimeAsync(25);
    }
    h.draws.slice(0, 4).forEach((d) => d.cb());
    expect(onBeat.mock.calls.map((c) => c[0])).toEqual([0, 1, 0, 1]);
    m.stop();
    const clicks = calls('synth', 'triggerAttackRelease').map((c) => c.args as number[]);
    expect(clicks.length).toBeGreaterThanOrEqual(5);
    clicks.forEach((c, i) => {
      expect(c[2]).toBeCloseTo(10.1 + i * 0.5, 9);
      expect(c[0] === 1568).toBe(i % 2 === 0);
    });

    const count = clicks.length;
    h.currentTime += 3;
    await vi.advanceTimersByTimeAsync(100);
    expect(calls('synth', 'triggerAttackRelease')).toHaveLength(count);
    onBeat.mockClear();
    h.draws.forEach((d) => d.cb());
    expect(onBeat).not.toHaveBeenCalled();
  });
});

describe('metronome start time and stop time', () => {
  it('startAt puts the first click exactly there (never in the past); stopAt commits no click from that time on', async () => {
    const engine = await unlocked();
    // 4/4 at 120: clicks every 0.5 s. Ask for the first click at 10.6 (the clock is at 10).
    const m = engine.startMetronome({ beats: 4, beatUnit: 4 }, 120, undefined, { startAt: 10.6 });
    expect(m.startTime).toBeCloseTo(10.6, 9);
    m.stopAt(11.6);
    for (let i = 0; i < 20; i++) {
      h.currentTime += 0.1;
      await vi.advanceTimersByTimeAsync(25);
    }
    const times = calls('synth', 'triggerAttackRelease').map((c) => (c.args as number[])[2]!);
    expect(times).toHaveLength(2);
    expect(times[0]).toBeCloseTo(10.6, 9);
    expect(times[1]).toBeCloseTo(11.1, 9);
    m.stop();
    // A startAt in the past is moved up to now.
    const late = engine.startMetronome({ beats: 4, beatUnit: 4 }, 120, undefined, { startAt: 1 });
    expect(late.startTime).toBeCloseTo(h.currentTime, 9);
    late.stop();
  });
});

describe('ui sounds, mute, clock', () => {
  it('plays distinct short sounds and is silent when muted', async () => {
    const engine = await unlocked();
    const sizes: number[] = [];
    for (const s of ['tap', 'correct', 'wrong', 'complete'] as const) {
      const before = calls('poly', 'triggerAttackRelease').length;
      engine.playUi(s);
      sizes.push(calls('poly', 'triggerAttackRelease').length - before);
    }
    expect(sizes).toEqual([1, 2, 2, 4]);
    const all = calls('poly', 'triggerAttackRelease');
    all.forEach((c) => expect(c.args[1] as number).toBeLessThan(0.5));

    engine.setMuted(true);
    const n = calls('poly', 'triggerAttackRelease').length;
    engine.playUi('correct');
    expect(calls('poly', 'triggerAttackRelease')).toHaveLength(n);
    expect(h.dest.mute).toBe(true);
    engine.setMuted(false);
    expect(h.dest.mute).toBe(false);
  });

  it('applies a mute set before Tone loads', async () => {
    const engine = new ToneAudioEngine();
    engine.setMuted(true);
    await engine.unlock();
    expect(h.dest.mute).toBe(true);
  });

  it('now() is the audio clock', async () => {
    const engine = new ToneAudioEngine();
    expect(engine.now()).toBe(0);
    await engine.unlock();
    h.currentTime = 42.5;
    expect(engine.now()).toBe(42.5);
  });
});
