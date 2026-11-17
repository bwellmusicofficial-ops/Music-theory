import type { NextConfig } from 'next';

/**
 * Files named `page.dev.tsx` are routes only when NEXT_PUBLIC_ENABLE_DEV_ROUTES=1
 * (the end-to-end test harness under src/app/(dev)). Without it Next ignores them,
 * so the production route list does not contain them.
 */
const devRoutes = process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Always defined, so the bundler replaces `process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES` with a
  // literal ('0' in production) and drops the test hooks (`__mockPaper`, `data-test-correct`).
  // Left unset, the bundler keeps a runtime lookup and the hook code stays in the bundle.
  env: { NEXT_PUBLIC_ENABLE_DEV_ROUTES: devRoutes ? '1' : '0' },
  pageExtensions: ['tsx', 'ts', 'jsx', 'js', ...(devRoutes ? ['dev.tsx'] : [])],
};

export default nextConfig;
