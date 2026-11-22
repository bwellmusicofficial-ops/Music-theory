import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '@/lesson/player/test-fixtures';
import { Outbox } from './outbox';
import { Syncer, type SendResult } from './syncer';
import type { BatchWire } from './wire';

/** A clock and timers the test winds by hand. */
function clock() {
  let t = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let next = 1;
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = next++;
      timers.push({ at: t + ms, fn, id });
      return id;
    },
    clearTimer: (h: unknown) => {
      const i = timers.findIndex((x) => x.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
    /** Wind forward, firing due timers in order, letting promises settle between them. */
    async advance(ms: number) {
      const end = t + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const due = timers[0];
        if (!due || due.at > end) break;
        timers.shift();
        t = due.at;
        due.fn();
        await settle();
      }
      t = end;
    },
    waiting: () => timers.map((x) => x.at - t),
  };
}
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const lesson = (id: string) => ({ k: 'lesson' as const, v: { lessonId: id, state: 'in-progress' as const, step: 'hook' as const, questionIndex: 0, bestScore: null } });
const attempt = (i: number) => ({ k: 'attempt' as const, v: { lessonId: 'l-1', step: 'practice' as const, questionId: `q-${i}`, skill: 'a.b', type: 'ordering' as const, correct: true, score: 1, msTaken: 1, at: new Date(Date.UTC(2026, 5, 1, 10, 0, i)).toISOString() } });

function setup(script: SendResult[] | ((b: BatchWire, n: number) => SendResult), opts: { online?: () => boolean } = {}) {
  const outbox = new Outbox(new MemoryStorage());
  const c = clock();
  const sent: BatchWire[] = [];
  const syncer = new Syncer({
    outbox,
    send: async (b) => {
      sent.push(b);
      const n = sent.length - 1;
      return typeof script === 'function' ? script(b, n) : (script[Math.min(n, script.length - 1)] ?? { kind: 'ok' });
    },
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
    random: () => 1,
    isOnline: opts.online,
  });
  return { outbox, c, sent, syncer };
}

describe('Syncer', () => {
  it('does nothing until it is resumed (not signed in)', async () => {
    const { outbox, sent, syncer } = setup([{ kind: 'ok' }]);
    outbox.add([lesson('a')]);
    syncer.kick();
    await settle();
    expect(sent).toHaveLength(0);
    expect(syncer.status()).toEqual({ pending: 1, failing: false, paused: true });
  });

  it('sends what is waiting once resumed, and empties the outbox on success', async () => {
    const { outbox, sent, syncer } = setup([{ kind: 'ok' }]);
    outbox.add([lesson('a'), attempt(1)]);
    syncer.resume();
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.lessons).toHaveLength(1);
    expect(sent[0]!.attempts).toHaveLength(1);
    expect(syncer.status()).toEqual({ pending: 0, failing: false, paused: false });
  });

  it('sends in order, one batch at a time, until the outbox is empty', async () => {
    const { outbox, sent, syncer } = setup([{ kind: 'ok' }]);
    outbox.add(Array.from({ length: 450 }, (_, i) => attempt(i)));
    syncer.resume();
    await settle();
    expect(sent.map((b) => b.attempts.length)).toEqual([200, 200, 50]);
    expect(sent[0]!.attempts[0]!.questionId).toBe('q-0');
    expect(sent[2]!.attempts[49]!.questionId).toBe('q-449');
    expect(outbox.size()).toBe(0);
  });

  it('after a failure keeps everything, waits, and retries with a growing delay up to a cap', async () => {
    const { outbox, c, sent, syncer } = setup([{ kind: 'retry' }]);
    outbox.add([lesson('a')]);
    syncer.resume();
    await settle();
    expect(sent).toHaveLength(1);
    expect(outbox.size()).toBe(1);
    expect(syncer.status().failing).toBe(true);
    expect(c.waiting()).toEqual([2000]);
    await c.advance(1999);
    expect(sent).toHaveLength(1);
    await c.advance(1);
    await settle();
    expect(sent).toHaveLength(2);
    expect(c.waiting()).toEqual([4000]);
    // 2s, 4s, 8s, 16s ... never more than five minutes
    const delays: number[] = [];
    for (let i = 0; i < 10; i++) {
      delays.push(c.waiting()[0]!);
      await c.advance(c.waiting()[0]!);
      await settle();
    }
    expect(delays).toEqual([4000, 8000, 16000, 32000, 64000, 128000, 256000, 300000, 300000, 300000]);
    expect(outbox.size()).toBe(1);
  });

  it('jitters the delay downwards only, never below three quarters', () => {
    for (const r of [0, 0.5, 1]) {
      const s = new Syncer({ outbox: new Outbox(undefined), send: async () => ({ kind: 'ok' }), random: () => r });
      const d = s.delayFor(3);
      expect(d).toBeGreaterThanOrEqual(6000);
      expect(d).toBeLessThanOrEqual(8000);
    }
  });

  it('recovers: the first success clears the failing state and the backoff', async () => {
    const { outbox, c, sent, syncer } = setup([{ kind: 'retry' }, { kind: 'retry' }, { kind: 'ok' }]);
    outbox.add([lesson('a')]);
    syncer.resume();
    await settle();
    await c.advance(2000);
    await settle();
    await c.advance(4000);
    await settle();
    expect(sent).toHaveLength(3);
    expect(outbox.size()).toBe(0);
    expect(syncer.status()).toEqual({ pending: 0, failing: false, paused: false });
    expect(c.waiting()).toEqual([]);
    outbox.add([lesson('b')]);
    syncer.kick();
    await settle();
    expect(sent).toHaveLength(4);
  });

  it('honours how long the server asked it to wait, when that is longer', async () => {
    const { outbox, c, syncer } = setup([{ kind: 'retry', afterMs: 60_000 }]);
    outbox.add([lesson('a')]);
    syncer.resume();
    await settle();
    expect(c.waiting()).toEqual([60_000]);
  });

  it('does not try while offline, and tries at once when told the network is back', async () => {
    let online = false;
    const { outbox, c, sent, syncer } = setup([{ kind: 'ok' }], { online: () => online });
    outbox.add([lesson('a')]);
    syncer.resume();
    await settle();
    expect(sent).toHaveLength(0);
    expect(syncer.status().failing).toBe(true);
    expect(c.waiting()).toHaveLength(1);
    online = true;
    syncer.kick({ resetBackoff: true });
    await settle();
    expect(sent).toHaveLength(1);
    expect(outbox.size()).toBe(0);
  });

  it('drops a batch the server will never accept so it cannot block the ones behind it', async () => {
    const { outbox, sent, syncer } = setup((b, n) => (n === 0 ? { kind: 'drop' } : { kind: 'ok' }));
    outbox.add([lesson('a')]);
    syncer.resume();
    await settle();
    outbox.add([lesson('b')]);
    syncer.kick();
    await settle();
    expect(sent).toHaveLength(2);
    expect(outbox.size()).toBe(0);
  });

  it('stops, keeping the outbox, when the server says nobody is signed in', async () => {
    const { outbox, c, sent, syncer } = setup([{ kind: 'signed-out' }]);
    outbox.add([lesson('a')]);
    syncer.resume();
    await settle();
    expect(sent).toHaveLength(1);
    expect(outbox.size()).toBe(1);
    expect(syncer.status().paused).toBe(true);
    expect(c.waiting()).toEqual([]);
    syncer.kick();
    await settle();
    expect(sent).toHaveLength(1);
  });

  it('treats a send that throws as a retry', async () => {
    const outbox = new Outbox(new MemoryStorage());
    const c = clock();
    let calls = 0;
    const syncer = new Syncer({ outbox, send: async () => { calls++; throw new Error('boom'); }, setTimer: c.setTimer, clearTimer: c.clearTimer, random: () => 1 });
    outbox.add([lesson('a')]);
    syncer.resume();
    await settle();
    expect(calls).toBe(1);
    expect(outbox.size()).toBe(1);
    expect(c.waiting()).toEqual([2000]);
  });

  it('replaying after a lost answer is just sending again: the same entries go out twice', async () => {
    const { outbox, sent, syncer, c } = setup([{ kind: 'retry' }, { kind: 'ok' }]);
    outbox.add([lesson('a'), attempt(1)]);
    syncer.resume();
    await settle();
    await c.advance(2000);
    await settle();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
  });

  it('pause() cancels a scheduled retry', async () => {
    const { outbox, c, sent, syncer } = setup([{ kind: 'retry' }]);
    outbox.add([lesson('a')]);
    syncer.resume();
    await settle();
    syncer.pause();
    await c.advance(10 * 60_000);
    await settle();
    expect(sent).toHaveLength(1);
    expect(outbox.size()).toBe(1);
  });

  it('a kick during a send is not lost', async () => {
    let release: (r: SendResult) => void = () => {};
    const outbox = new Outbox(new MemoryStorage());
    const batches: number[] = [];
    const syncer = new Syncer({
      outbox,
      send: (b) => {
        batches.push(b.lessons.length);
        return new Promise<SendResult>((res) => { release = res; });
      },
    });
    outbox.add([lesson('a')]);
    syncer.resume();
    await settle();
    outbox.add([lesson('b')]);
    syncer.kick();
    release({ kind: 'ok' });
    await settle();
    release({ kind: 'ok' });
    await settle();
    expect(batches).toEqual([1, 1]);
    expect(outbox.size()).toBe(0);
  });

  it('settle() resolves with the number still waiting: zero on success, more after a failure, and gives up at the timeout', async () => {
    const ok = setup([{ kind: 'ok' }]);
    ok.outbox.add([lesson('a')]);
    ok.syncer.resume();
    expect(await ok.syncer.settle(1000)).toBe(0);

    const bad = setup([{ kind: 'retry' }]);
    bad.outbox.add([lesson('a'), lesson('b')]);
    bad.syncer.resume();
    expect(await bad.syncer.settle(1000)).toBe(2);

    let release: (r: SendResult) => void = () => {};
    const outbox = new Outbox(new MemoryStorage());
    const c = clock();
    const hung = new Syncer({ outbox, send: () => new Promise<SendResult>((res) => { release = res; }), setTimer: c.setTimer, clearTimer: c.clearTimer });
    outbox.add([lesson('a')]);
    hung.resume();
    const waiting = hung.settle(5000);
    await settle();
    await c.advance(5000);
    expect(await waiting).toBe(1);
    release({ kind: 'ok' });
  });
});
