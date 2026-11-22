'use client';

import { useEffect } from 'react';
import { useAccount } from '@/accounts/ui/store';
import { MergePrompt } from './merge-prompt';
import { useEngine } from './use-engine';

/** Looks again at the account this often while the page is in view. */
const REFRESH_MS = 60_000;

/**
 * Mounted once in the root layout (only when accounts are switched on at build time). Tells the engine who is
 * signed in, wakes it when the network or the page comes back, and shows the "add this device's progress" question.
 */
export default function SyncProvider() {
  const engine = useEngine();
  const account = useAccount();

  useEffect(() => {
    if (account.status === 'signed-in') engine.signedIn(account.user);
    // A failed check (offline) says nothing about being signed out: the cache stays.
    else if (account.status === 'signed-out' && !account.unreachable) engine.confirmedSignedOut();
  }, [account, engine]);

  useEffect(() => {
    const online = () => engine.online();
    const visible = () => {
      if (document.visibilityState === 'visible') engine.online();
    };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void engine.pull();
    }, REFRESH_MS);
    return () => {
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
      window.clearInterval(timer);
    };
  }, [engine]);

  return <MergePrompt />;
}
