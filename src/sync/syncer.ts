/**
 * Sends the outbox to the account: one batch at a time, in order, and when a send fails, waits and tries
 * again with a growing delay. Clock, timers and the network are injected so the rules can be tested without
 * waiting.
 */
import type { Outbox } from './outbox';
import type { BatchWire } from './wire';

export type SendResult =
  /** Saved. */
  | { kind: 'ok' }
  /** The server will never accept this batch (it is malformed). Drop it rather than block everything behind it. */
  | { kind: 'drop' }
  /** Try again later (offline, a server fault, rate limited). `afterMs` is the server's own wait, if it gave one. */
  | { kind: 'retry'; afterMs?: number }
  /** Not signed in (any more). Stop until told otherwise. */
  | { kind: 'signed-out' };

export interface SyncerOptions {
  outbox: Outbox;
  send: (batch: BatchWire) => Promise<SendResult>;
  /** Defaults to navigator.onLine where there is one. */
  isOnline?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** 0..1, for jitter. */
  random?: () => number;
  now?: () => number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface SyncerStatus {
  pending: number;
  /** The last send failed and a retry is scheduled. */
  failing: boolean;
  /** Stopped because the person is not signed in. */
  paused: boolean;
}

export const BASE_DELAY_MS = 2000;
export const MAX_DELAY_MS = 5 * 60_000;

export class Syncer {
  private failures = 0;
  private timer: unknown = null;
  private running = false;
  private again = false;
  private paused = true;
  private failing = false;
  private readonly listeners = new Set<() => void>();
  private readonly o: Required<Omit<SyncerOptions, 'outbox' | 'send'>> & Pick<SyncerOptions, 'outbox' | 'send'>;

  constructor(options: SyncerOptions) {
    this.o = {
      isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      random: Math.random,
      now: Date.now,
      baseDelayMs: BASE_DELAY_MS,
      maxDelayMs: MAX_DELAY_MS,
      // An option passed as undefined means "the default", not "nothing".
      ...(Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) as SyncerOptions),
    };
  }

  status(): SyncerStatus {
    return { pending: this.o.outbox.size(), failing: this.failing, paused: this.paused };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  /**
   * Tries to send everything now and waits until that has either finished or failed, or `timeoutMs` passes.
   * Returns how many entries are still waiting.
   */
  async settle(timeoutMs: number): Promise<number> {
    this.kick({ resetBackoff: true });
    const done = () => !this.running && (this.o.outbox.size() === 0 || this.failing || this.paused);
    if (!done()) {
      await new Promise<void>((resolve) => {
        let off = () => {};
        const timer = this.o.setTimer(() => finish(), timeoutMs);
        const finish = () => {
          off();
          this.o.clearTimer(timer);
          resolve();
        };
        off = this.subscribe(() => {
          if (done()) finish();
        });
      });
    }
    return this.o.outbox.size();
  }

  /** Signed in: start (or restart) sending. */
  resume(): void {
    this.paused = false;
    this.failures = 0;
    this.failing = false;
    this.kick();
  }

  /** Signed out: stop and forget the backoff. The outbox is left alone. */
  pause(): void {
    this.paused = true;
    this.cancelTimer();
    this.failing = false;
    this.emit();
  }

  /** The delay before the next try after `failures` failures in a row, with jitter. */
  delayFor(failures: number): number {
    const raw = Math.min(this.o.maxDelayMs, this.o.baseDelayMs * 2 ** Math.max(0, failures - 1));
    return Math.round(raw * (0.75 + 0.25 * this.o.random()));
  }

  private cancelTimer() {
    if (this.timer !== null) this.o.clearTimer(this.timer);
    this.timer = null;
  }

  /** New work, or the network is back: try now (cancelling any wait). */
  kick(options: { resetBackoff?: boolean } = {}): void {
    if (this.paused) return;
    if (options.resetBackoff) this.failures = 0;
    this.cancelTimer();
    if (this.running) {
      this.again = true;
      return;
    }
    void this.run();
  }

  private async run(): Promise<void> {
    this.running = true;
    try {
      for (;;) {
        this.again = false;
        if (this.paused) return;
        const next = this.o.outbox.nextBatch();
        if (!next) {
          this.failures = 0;
          this.failing = false;
          return;
        }
        if (!this.o.isOnline()) {
          this.fail();
          return;
        }
        let result: SendResult;
        try {
          result = await this.o.send(next.batch);
        } catch {
          result = { kind: 'retry' };
        }
        if (this.paused) return;
        if (result.kind === 'ok' || result.kind === 'drop') {
          this.o.outbox.remove(next.ids);
          this.failures = 0;
          this.failing = false;
          this.emit();
          continue;
        }
        if (result.kind === 'signed-out') {
          this.paused = true;
          this.failing = false;
          return;
        }
        this.fail(result.afterMs);
        return;
      }
    } finally {
      this.running = false;
      this.emit();
      if (this.again && !this.paused && this.timer === null) void this.run();
    }
  }

  private fail(serverWaitMs = 0) {
    this.failures++;
    this.failing = true;
    this.cancelTimer();
    const wait = Math.max(this.delayFor(this.failures), serverWaitMs);
    this.timer = this.o.setTimer(() => {
      this.timer = null;
      this.kick();
    }, wait);
  }
}
