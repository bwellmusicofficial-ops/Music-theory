/**
 * The browser-side sync engine (P1-03). One per page; the app talks to it through `src/sync/index.ts` and
 * the account UI. It owns the rules that decide what is on this device:
 *
 *   guest      no account: progress is plain localStorage, nothing is sent anywhere (as before accounts)
 *   offered    signed in, and this device holds guest progress: nothing is merged until the learner says so
 *   signed in  the device's progress keys hold a CACHE of the account (the owner marker says whose); writes go
 *              to localStorage at once and to the outbox, which is sent when online
 *
 * Signing out wipes the cache (and the outbox) and puts back any guest progress that was set aside, so the next
 * person on a shared computer starts where the device was before anyone signed in. Settings are never touched.
 */
import type { AttemptEvent, LessonProgress } from '@/lesson/contracts';
import {
  applySnapshot, attemptToWire, defaultStorage, guestPayload, hasProgress, hasStash, lessonToWire, mockToWire,
  readOwner, stashProgress, unsyncedAgainst, wipeAccountCache, writeOwner, STASH_KEY,
} from './local-cache';
import type { MockAttempt } from '@/mock/store';
import { Outbox } from './outbox';
import { Syncer, type SyncerOptions } from './syncer';
import { createFetchTransport, type Transport } from './transport';
import { encodeGameId, gameWireSchema, type BatchWire } from './wire';

export type Phase = 'idle' | 'offered' | 'adding';

export interface SyncStatus {
  /** Whether this device holds an account's progress (the owner marker is set). */
  active: boolean;
  phase: Phase;
  /** Changes written here that the account has not confirmed. */
  pending: number;
  /** The last send failed; a retry is scheduled. */
  failing: boolean;
  /** Guest progress is set aside (the learner said "Not now") and could still be added. */
  hasSetAside: boolean;
  /** Set when adding progress failed, in words for the person. */
  error: string | null;
}

export interface EngineOptions {
  storage?: Storage;
  transport?: Transport;
  syncer?: Partial<SyncerOptions>;
  /** Called after something on this device changed because of the account, so screens re-read it. */
  onLocalChange?: () => void;
  now?: () => number;
}

/** Same rule as the server's `normaliseCodeName`; inlined to keep the common-password list out of this chunk. */
const ownerKey = (codeName: string) => codeName.replace(/[^A-Za-z0-9]/g, '').toLowerCase();

export interface SignedInUser {
  codeName: string;
}

export function createEngine(options: EngineOptions = {}) {
  const storage = options.storage ?? defaultStorage();
  const transport = options.transport ?? createFetchTransport();
  const now = options.now ?? Date.now;
  const outbox = new Outbox(storage);
  const syncer = new Syncer({ outbox, send: (b) => transport.send(b), ...options.syncer });
  const notifyLocal = options.onLocalChange ?? (() => {});

  let phase: Phase = 'idle';
  let error: string | null = null;
  let signedInKey: string | null = null;
  let status: SyncStatus = compute();
  const listeners = new Set<() => void>();

  function compute(): SyncStatus {
    const s = syncer.status();
    return {
      active: readOwner(storage) !== null,
      phase,
      pending: s.pending,
      failing: s.failing,
      hasSetAside: hasStash(storage),
      error,
    };
  }
  function refresh() {
    const next = compute();
    if (JSON.stringify(next) === JSON.stringify(status)) return;
    status = next;
    for (const l of listeners) l();
  }
  syncer.subscribe(refresh);

  function setPhase(p: Phase, e: string | null = null) {
    phase = p;
    error = e;
    refresh();
  }

  // --- writes -------------------------------------------------------------------

  /** True when this device holds an account's progress, so writes are worth queueing. */
  const holdsAccount = () => readOwner(storage) !== null;
  const queued = () => {
    syncer.kick();
    refresh();
  };

  function enqueueLesson(p: LessonProgress) {
    if (!holdsAccount()) return;
    outbox.add([{ k: 'lesson', v: lessonToWire(p) }]);
    queued();
  }
  function enqueueAttempt(a: AttemptEvent) {
    if (!holdsAccount()) return;
    const w = attemptToWire(a, now);
    if (!w) return; // a type the database cannot hold yet: it stays on this device
    outbox.add([{ k: 'attempt', v: w }]);
    queued();
  }
  function enqueueGameBest(game: string, variant: string | null, score: number) {
    if (!holdsAccount()) return;
    const gameId = encodeGameId(game, variant);
    const w = gameId ? gameWireSchema.safeParse({ gameId, score: Math.floor(score) }) : null;
    if (!w?.success) return;
    outbox.add([{ k: 'game', v: w.data }]);
    queued();
  }
  function enqueueMock(a: MockAttempt) {
    if (!holdsAccount()) return;
    const w = mockToWire(a);
    if (!w) return;
    outbox.add([{ k: 'mock', v: w }]);
    queued();
  }

  function enqueueBatch(batch: BatchWire) {
    outbox.add([
      ...batch.lessons.map((v) => ({ k: 'lesson' as const, v })),
      ...batch.games.map((v) => ({ k: 'game' as const, v })),
      ...batch.mocks.map((v) => ({ k: 'mock' as const, v })),
    ]);
  }

  // --- reading ------------------------------------------------------------------

  let pulling: Promise<void> | null = null;
  /** Fetches the account's progress and folds it into this device's, then sends whatever the account lacks. */
  function pull(): Promise<void> {
    if (!holdsAccount()) return Promise.resolve();
    if (pulling) return pulling;
    pulling = (async () => {
      const r = await transport.snapshot();
      if (r.kind !== 'ok' || !holdsAccount()) return;
      const pendingLessons = new Set(outbox.entries().flatMap((e) => (e.k === 'lesson' ? [e.v.lessonId] : [])));
      if (applySnapshot(storage, r.snapshot, pendingLessons)) notifyLocal();
      enqueueBatch(unsyncedAgainst(storage, r.snapshot));
      syncer.kick();
      refresh();
    })().finally(() => {
      pulling = null;
    });
    return pulling;
  }

  function start() {
    setPhase('idle');
    syncer.resume();
    void pull();
  }

  // --- who is signed in -----------------------------------------------------------

  /** Call whenever the account state becomes "signed in". */
  function signedIn(user: SignedInUser) {
    const key = ownerKey(user.codeName);
    if (signedInKey === key && (holdsAccount() || phase !== 'idle')) return;
    signedInKey = key;
    const owner = readOwner(storage);
    if (owner && owner !== key) {
      // Someone else's cache is on this device (their session ended without a sign-out). It is not guest progress.
      wipeAccountCache(storage);
      outbox.clear();
      notifyLocal();
    }
    if (readOwner(storage) === key) return start();
    if (hasProgress(storage)) return setPhase('offered');
    writeOwner(storage, key);
    start();
  }

  /**
   * Call when a check of the session says, for sure, that nobody is signed in. A cache with nothing waiting to
   * be sent is removed (it is all in the account); one with unsent work is kept so signing in again can send it.
   */
  function confirmedSignedOut() {
    signedInKey = null;
    syncer.pause();
    if (phase === 'offered' || phase === 'adding') setPhase('idle');
    if (readOwner(storage) !== null && outbox.size() === 0) {
      wipeAccountCache(storage);
      notifyLocal();
    }
    refresh();
  }

  // --- the offer ------------------------------------------------------------------

  async function addGuestProgress(): Promise<boolean> {
    if (signedInKey === null) return false;
    const key = signedInKey;
    setPhase('adding');
    const payload = guestPayload(storage, now);
    const r = await transport.merge({ lessons: payload.lessons, attempts: payload.attempts });
    if (r.kind !== 'ok') {
      setPhase('offered', r.kind === 'signed-out' ? 'You were signed out. Please sign in again.' : "We couldn't add it just now. Check your connection and try again.");
      return false;
    }
    writeOwner(storage, key);
    enqueueBatch(payload); // best scores and mock results travel the ordinary way
    start();
    return true;
  }

  function keepSeparate() {
    if (signedInKey === null) return;
    stashProgress(storage);
    writeOwner(storage, signedInKey);
    notifyLocal();
    start();
  }

  /** Adds progress that was set aside earlier ("Not now") to the account. */
  async function addSetAsideProgress(): Promise<boolean> {
    const raw = storage?.getItem(STASH_KEY);
    if (!raw || !holdsAccount()) return false;
    const temp = memoryStorageFrom(raw);
    const payload = guestPayload(temp, now);
    setPhase('adding');
    const r = await transport.merge({ lessons: payload.lessons, attempts: payload.attempts });
    if (r.kind !== 'ok') {
      setPhase('idle', "We couldn't add it just now. Check your connection and try again.");
      return false;
    }
    enqueueBatch(payload);
    try {
      storage?.removeItem(STASH_KEY);
    } catch {
      /* ignore */
    }
    setPhase('idle');
    syncer.kick();
    await pull();
    return true;
  }

  // --- signing out ----------------------------------------------------------------

  /** Tries to send everything; resolves to how many changes are still unsent. */
  async function prepareSignOut(timeoutMs = 4000): Promise<number> {
    if (!holdsAccount()) return 0;
    return syncer.settle(timeoutMs);
  }

  /** The server has ended the session: wipe what the account put on this device and restore guest progress. */
  function afterSignOut() {
    signedInKey = null;
    syncer.pause();
    outbox.clear();
    wipeAccountCache(storage);
    phase = 'idle';
    error = null;
    notifyLocal();
    refresh();
  }

  return {
    enqueueLesson, enqueueAttempt, enqueueGameBest, enqueueMock,
    signedIn, confirmedSignedOut, addGuestProgress, keepSeparate, addSetAsideProgress,
    prepareSignOut, afterSignOut, pull,
    /** Network came back: send now, and look at the account again. */
    online() {
      syncer.kick({ resetBackoff: true });
      void pull();
    },
    getStatus: () => status,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Test access. */
    _outbox: outbox,
    _syncer: syncer,
  };
}

export type Engine = ReturnType<typeof createEngine>;

/** A read-only Storage over a stash's saved text, so the ordinary readers can be used on it. */
function memoryStorageFrom(stashJson: string): Storage {
  let data: Record<string, string> = {};
  try {
    const v: unknown = JSON.parse(stashJson);
    if (typeof v === 'object' && v !== null) {
      data = Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'));
    }
  } catch {
    /* empty */
  }
  return {
    get length() {
      return Object.keys(data).length;
    },
    key: (i) => Object.keys(data)[i] ?? null,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
    clear: () => void (data = {}),
  };
}

// --- the page's engine ---------------------------------------------------------------------------

let shared: Engine | null = null;
/** The one engine for this page. Created on first use, in the browser only. */
export function getEngine(): Engine {
  if (!shared) {
    shared = createEngine({
      onLocalChange: () => {
        // The same event another tab's write raises: every screen that reads progress already listens for it.
        window.dispatchEvent(new StorageEvent('storage'));
      },
    });
  }
  return shared;
}

export const enqueueLesson = (p: LessonProgress) => getEngine().enqueueLesson(p);
export const enqueueAttempt = (a: AttemptEvent) => getEngine().enqueueAttempt(a);
export const enqueueGameBest = (game: string, variant: string | null, score: number) => getEngine().enqueueGameBest(game, variant, score);
export const enqueueMock = (a: MockAttempt) => getEngine().enqueueMock(a);
