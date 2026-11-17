/**
 * Shared fake of the `tone` module for playback tests (not a test file itself).
 * Use from a test with:
 *   vi.mock('tone', async () => (await import('./test-tone-mock')).toneMockFactory());
 * Everything the engine asks Tone to do is recorded in `mock`.
 */
export type Call = { name: string; args: unknown[] };

export const mock = {
  currentTime: 10,
  draws: [] as { cb: () => void; time: number }[],
  dest: { mute: false },
  ctx: { currentTime: 0, lookAhead: 0.1 },
  started: 0,
  instances: [] as { kind: string; calls: Call[]; disposed: boolean; volume: { value: number } }[],
};

export function resetMock(): void {
  mock.currentTime = 10;
  mock.draws = [];
  mock.dest.mute = false;
  mock.started = 0;
  mock.instances.length = 0;
}

export function callsOf(kind: string, name?: string): Call[] {
  return mock.instances
    .filter((i) => i.kind === kind)
    .flatMap((i) => i.calls)
    .filter((c) => !name || c.name === name);
}

export function toneMockFactory() {
  class Node {
    calls: Call[] = [];
    disposed = false;
    volume = { value: 0 };
    maxPolyphony = 0;
    constructor(public kind: string) {
      mock.instances.push(this);
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
      queueMicrotask(() => (options.onload as () => void)());
    }
  }
  mock.ctx = {
    get currentTime() {
      return mock.currentTime;
    },
    lookAhead: 0.1,
  } as typeof mock.ctx;
  return {
    Synth,
    PolySynth,
    Sampler,
    start: async () => {
      mock.started += 1;
    },
    now: () => mock.currentTime + 0.01,
    getContext: () => mock.ctx,
    getDestination: () => mock.dest,
    getDraw: () => ({
      schedule: (cb: () => void, time: number) => mock.draws.push({ cb, time }),
    }),
  };
}
