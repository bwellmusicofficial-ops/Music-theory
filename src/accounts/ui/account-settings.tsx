'use client';

import dynamic from 'next/dynamic';

/** The account card in Settings. Loaded only when the accounts switch is on at build time (see account-status.tsx). */
const Inner = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === '1' ? dynamic(() => import('./account-settings-inner')) : null;

export function AccountSettings() {
  return Inner ? <Inner /> : null;
}
