'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { AccountUser } from '../backend/types';
import { getEngine } from '@/sync/engine';
import { accountApi } from './api';

/**
 * Who is signed in, shared by the header, Settings and the forms. Only the code name and age band
 * ever get here. `unknown` until the first answer from /api/account/me.
 */
export type AccountState =
  | { status: 'unknown' }
  /** `unreachable`: the check itself failed (offline), so nobody has said the person is signed out. */
  | { status: 'signed-out'; unreachable?: boolean }
  | { status: 'signed-in'; user: AccountUser };

const UNKNOWN: AccountState = { status: 'unknown' };
let state: AccountState = UNKNOWN;
let loading = false;
const listeners = new Set<() => void>();

function set(next: AccountState) {
  state = next;
  for (const l of listeners) l();
}

export const accountStore = {
  setSignedIn: (user: AccountUser) => set({ status: 'signed-in', user }),
  setSignedOut: () => set({ status: 'signed-out' }),
  async load() {
    if (loading || state.status !== 'unknown') return;
    loading = true;
    const r = await accountApi.me();
    loading = false;
    // Do not overwrite an answer that arrived while we waited (a sign-in finishing first).
    if (state.status !== 'unknown') return;
    // A failed check (offline, 404) reads as signed out: the page still works.
    set(
      r.ok && r.data.user
        ? { status: 'signed-in', user: r.data.user }
        : { status: 'signed-out', ...(r.ok ? {} : { unreachable: true }) },
    );
  },
  /** For tests. */
  reset() {
    loading = false;
    set(UNKNOWN);
  },
};

export function useAccount(): AccountState {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => UNKNOWN,
  );
  useEffect(() => {
    void accountStore.load();
  }, []);
  return s;
}

export type SignOutResult = 'ok' | 'failed' | 'unsaved';

/**
 * Signs out. First tries to send any progress still waiting to be saved: if some cannot be sent (offline), it
 * stops and says so (`unsaved`), because signing out removes the account's progress from this device. Pass
 * `force` to sign out anyway. On success the server session is ended, the account's cached progress is wiped
 * from this device (settings stay), and the state becomes signed out. `failed`: the server could not be reached.
 */
export async function signOutNow(options: { force?: boolean } = {}): Promise<SignOutResult> {
  const engine = getEngine();
  if (!options.force && (await engine.prepareSignOut()) > 0) return 'unsaved';
  const r = await accountApi.signOut();
  if (!r.ok) return 'failed';
  engine.afterSignOut();
  accountStore.setSignedOut();
  return 'ok';
}

export type DeleteOutcome = { ok: true } | { ok: false; error: string; retryAfterSeconds?: number };

/**
 * Deletes the account on the server. On success the device is cleaned exactly as a sign-out cleans it (the
 * account's cached progress and the outbox go, guest progress that was set aside comes back, settings stay)
 * and the state becomes signed out. Nothing waiting to be saved is sent first: the account no longer exists.
 * If the server says nobody is signed in, the session is already gone, so the device is cleaned the same way.
 */
export async function deleteAccountNow(confirmCodeName: string): Promise<DeleteOutcome> {
  const r = await accountApi.deleteAccount(confirmCodeName);
  if (!r.ok && r.error !== 'not-signed-in') return r;
  getEngine().afterSignOut();
  accountStore.setSignedOut();
  return r.ok ? { ok: true } : r;
}
