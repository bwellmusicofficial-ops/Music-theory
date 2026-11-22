import type { NextConfig } from 'next';

/**
 * Files named `page.dev.tsx` are routes only when NEXT_PUBLIC_ENABLE_DEV_ROUTES=1
 * (the end-to-end test harness under src/app/(dev)). Without it Next ignores them,
 * so the production route list does not contain them.
 */
const devRoutes = process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES === '1';

/**
 * Accounts (P1-02) sit behind NEXT_PUBLIC_ACCOUNTS_ENABLED=1, set at build time (Vercel Preview only for
 * now). Without it the `*.account.tsx` / `*.account.ts` files (sign-in pages and /api/account routes) are not
 * routes at all, and the account UI in the header and Settings is dropped from the bundle.
 */
const accounts = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === '1';

// The in-memory account backend is for tests. Refuse to even build with it unless the test harness is on.
if (process.env.ACCOUNTS_FAKE_BACKEND === '1' && !devRoutes) {
  throw new Error('ACCOUNTS_FAKE_BACKEND=1 requires NEXT_PUBLIC_ENABLE_DEV_ROUTES=1 (tests only).');
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Always defined, so the bundler replaces `process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES` with a
  // literal ('0' in production) and drops the test hooks (`__mockPaper`, `data-test-correct`).
  // Left unset, the bundler keeps a runtime lookup and the hook code stays in the bundle.
  env: {
    NEXT_PUBLIC_ENABLE_DEV_ROUTES: devRoutes ? '1' : '0',
    NEXT_PUBLIC_ACCOUNTS_ENABLED: accounts ? '1' : '0',
  },
  pageExtensions: ['tsx', 'ts', 'jsx', 'js', ...(devRoutes ? ['dev.tsx'] : []), ...(accounts ? ['account.tsx', 'account.ts'] : [])],
};

export default nextConfig;
