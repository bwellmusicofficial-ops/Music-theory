'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { AccountUser } from '../backend/types';
import { accountApi } from './api';

/**
 * Who is signed in, shared by the header, Settings and the forms. Only the code name and age band
 * ever get here. `unknown` until the first answer from /api/account/me.
 */
export type AccountState =
  | { status: 'unknown' }
  | { status: 'signed-out' }
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
    set(r.ok && r.data.user ? { status: 'signed-in', user: r.data.user } : { status: 'signed-out' });
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

/** Signs out on the server, then forgets locally. Returns false when the server could not be reached. */
export async function signOutNow(): Promise<boolean> {
  const r = await accountApi.signOut();
  if (r.ok) accountStore.setSignedOut();
  return r.ok;
}
