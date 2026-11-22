'use client';

import dynamic from 'next/dynamic';

/**
 * Starts the sync engine and the "add this device's progress" question on every page. Loaded only when the
 * accounts switch is on at build time: otherwise the `import()` is dead code and none of the sync code is in the
 * build (see `scripts/check-no-account-ui.mjs`).
 */
const Inner = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === '1' ? dynamic(() => import('./ui/sync-provider')) : null;

export function SyncMount() {
  return Inner ? <Inner /> : null;
}

/** A line for the "clear everything on this device" card, only when accounts are on (same switch as above). */
const Note = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === '1' ? dynamic(() => import('./ui/clear-data-note')) : null;

export function ClearDataAccountNote() {
  return Note ? <Note /> : null;
}
