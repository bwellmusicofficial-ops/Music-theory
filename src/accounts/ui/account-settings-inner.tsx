'use client';

import Link from 'next/link';
import { useState } from 'react';
import { buttonClasses } from '@/components/site/button-link';
import { Button, Card } from '@/components/ui';
import { signOutNow, useAccount } from './store';

/** The account card in Settings (see account-settings.tsx for the switch that loads it). */
export default function AccountSettingsInner() {
  const account = useAccount();
  const [message, setMessage] = useState('');
  if (account.status === 'unknown') return null;
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
          <p className="text-fg-secondary">
            Your progress is still saved on this device only for now. Saving it to your account is coming soon.
          </p>
          <div>
            <Button
              variant="secondary"
              onClick={async () => setMessage((await signOutNow()) ? '' : "Couldn't sign out. Please try again.")}
            >
              Sign out
            </Button>
          </div>
          <p role="status" className="font-semibold">
            {message}
          </p>
        </>
      ) : (
        <>
          <p className="text-fg-secondary">
            Make an account with a code name, or sign in. You don&apos;t need an email address. Your progress is still
            saved on this device only for now.
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
