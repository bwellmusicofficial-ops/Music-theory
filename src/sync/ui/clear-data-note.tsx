'use client';

import { useSyncStatus } from './use-engine';

/** Under "Your saved progress" in Settings: while signed in, "only on this device" would not be true. */
export default function ClearDataNote() {
  const status = useSyncStatus();
  if (!status.active) return null;
  return (
    <p className="mt-2 font-semibold" data-testid="clear-data-account-note">
      You&apos;re signed in, so your progress is also in your account. Clearing this device doesn&apos;t remove it from
      your account, and it comes back the next time this page checks.
    </p>
  );
}
