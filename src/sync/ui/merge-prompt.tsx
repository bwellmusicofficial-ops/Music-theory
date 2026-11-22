'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { useEngine, useSyncStatus } from './use-engine';

/**
 * Asked once after signing in or making an account, when this device holds progress from before: "Add this
 * device's progress to your account?". Nothing is merged unless the answer is Add. Not now keeps that progress
 * on this device only, set aside, and gives it back if the person signs out.
 *
 * It waits while the sign-up screens are showing so it never covers the recovery code.
 */
export function MergePrompt() {
  const engine = useEngine();
  const status = useSyncStatus();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const open = status.phase === 'offered' || status.phase === 'adding';
  if (!open || (pathname ?? '').startsWith('/account')) return null;

  const add = async () => {
    setBusy(true);
    await engine.addGuestProgress();
    setBusy(false);
  };
  const notNow = () => {
    if (!busy) engine.keepSeparate();
  };

  return (
    <Modal open title="Add this device's progress to your account?" onClose={notNow} closeLabel="Close, same as Not now">
      <div className="flex flex-col gap-4" data-testid="merge-prompt">
        <p>You did some learning on this device before you signed in. Add it to your account and it will follow you to your other devices.</p>
        <p className="text-fg-secondary">
          Not now keeps it on this device only. You can add it later in Settings, and it comes back if you sign out.
        </p>
        {status.error ? (
          <p role="alert" className="font-semibold">
            {status.error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button onClick={add} disabled={busy}>
            {busy ? 'Adding' : 'Add'}
          </Button>
          <Button variant="secondary" onClick={notNow} disabled={busy}>
            Not now
          </Button>
        </div>
      </div>
    </Modal>
  );
}
