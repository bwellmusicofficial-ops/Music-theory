'use client';

import dynamic from 'next/dynamic';

/**
 * The small account state in the site header: "Sign in", or the code name and "Sign out".
 *
 * `NEXT_PUBLIC_ACCOUNTS_ENABLED` is replaced by a literal at build time, so without the switch the
 * `import()` below is dead code: the account UI and its code are not in the build at all (checked by
 * `scripts/check-no-account-ui.mjs`).
 */
const Inner = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === '1' ? dynamic(() => import('./account-status-inner')) : null;

export function AccountStatus() {
  return Inner ? <Inner /> : null;
}
