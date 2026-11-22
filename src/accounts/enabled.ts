/**
 * The accounts switch (P1-02). Everything account-related sits behind
 * NEXT_PUBLIC_ACCOUNTS_ENABLED=1. Unset (the default, and production for now)
 * means no account UI anywhere and every account route answers 404.
 *
 * `next.config.ts` always defines the variable ('0' or '1') so the bundler
 * replaces the lookup with a literal and drops the account UI from a build made
 * without the switch. Server code also calls `accountsEnabled()` at request
 * time so tests can flip it.
 */
export function accountsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === '1';
}
