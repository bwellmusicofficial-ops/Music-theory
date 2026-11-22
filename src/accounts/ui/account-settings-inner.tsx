'use client';

import Link from 'next/link';
import { useState } from 'react';
import { buttonClasses } from '@/components/site/button-link';
import { Button, Card } from '@/components/ui';
import { SyncStatusLine } from '@/sync/ui/sync-status-line';
import { signOutNow, useAccount } from './store';

/** The account card in Settings (see account-settings.tsx for the switch that loads it). */
export default function AccountSettingsInner() {
  const account = useAccount();
  const [message, setMessage] = useState('');
  const [unsaved, setUnsaved] = useState(false);
  if (account.status === 'unknown') return null;

  async function signOut(force = false) {
    const result = await signOutNow({ force });
    setUnsaved(result === 'unsaved');
    setMessage(result === 'failed' ? "Couldn't sign out. Please try again." : '');
  }
  return (
    <Card as="section" aria-labelledby="account-heading" className="flex flex-col gap-3" data-testid="account-settings">
      <h2 id="account-heading" className="text-xl font-bold">
        Your account
      </h2>
      {account.status === 'signed-in' ? (
        <>
          <p>
            Signed in as <strong data-testid="account-code-name">{account.user.codeName}</strong>.
          </p>
          <SyncStatusLine />
          {unsaved ? (
            <div className="flex flex-col gap-3" data-testid="sign-out-unsaved">
              <p role="alert" className="font-semibold">
                Some of your progress hasn&apos;t saved to your account yet. If you sign out now, it will be lost from this
                device.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button autoFocus onClick={() => void signOut()}>
                  Try saving again
                </Button>
                <Button variant="danger" onClick={() => void signOut(true)}>
                  Sign out anyway
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <Button variant="secondary" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </div>
              <p className="text-fg-secondary">
                Signing out takes your account&apos;s progress off this device. It stays safe in your account.
              </p>
            </>
          )}
          <p role="status" className="font-semibold">
            {message}
          </p>
        </>
      ) : (
        <>
          <p className="text-fg-secondary">
            Make an account with a code name, or sign in. You don&apos;t need an email address. Without an account your
            progress stays on this device only.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/account/sign-up" className={buttonClasses('primary')}>
              Make an account
            </Link>
            <Link href="/account/sign-in" className={buttonClasses('secondary')}>
              Sign in
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}
