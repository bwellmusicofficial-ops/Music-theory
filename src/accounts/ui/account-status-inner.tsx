'use client';

import Link from 'next/link';
import { useState } from 'react';
import { signOutNow, useAccount } from './store';

/** The header's account state (see account-status.tsx for the switch that loads it). */
export default function AccountStatusInner() {
  const account = useAccount();
  const [failed, setFailed] = useState(false);
  if (account.status === 'unknown') return null;
  if (account.status === 'signed-out') {
    return (
      <div data-testid="account-status">
        <Link
          href="/account/sign-in"
          className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-border px-4 font-semibold text-fg hover:bg-surface-raised"
        >
          Sign in
        </Link>
      </div>
    );
  }
  return (
    <div data-testid="account-status" className="flex min-w-0 items-center gap-1">
      <Link
        href="/settings"
        aria-label={`Signed in as ${account.user.codeName}. Open settings`}
        className="hidden min-h-11 min-w-0 items-center rounded-full px-2 font-semibold text-fg-secondary hover:text-fg sm:inline-flex"
      >
        <span className="max-w-[10rem] truncate">{account.user.codeName}</span>
      </Link>
      <button
        type="button"
        onClick={async () => setFailed(!(await signOutNow()))}
        className="inline-flex min-h-11 cursor-pointer items-center whitespace-nowrap rounded-full border border-border px-3 font-semibold text-fg hover:bg-surface-raised"
      >
        Sign out
      </button>
      {failed ? <span role="alert" className="sr-only">Could not sign out. Try again.</span> : null}
    </div>
  );
}
