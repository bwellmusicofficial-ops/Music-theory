import type { NextConfig } from 'next';

/**
 * Files named `page.dev.tsx` are routes only when NEXT_PUBLIC_ENABLE_DEV_ROUTES=1
 * (the end-to-end test harness under src/app/(dev)). Without it Next ignores them,
 * so the production route list does not contain them.
 */
const devRoutes = process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  pageExtensions: ['tsx', 'ts', 'jsx', 'js', ...(devRoutes ? ['dev.tsx'] : [])],
};

export default nextConfig;
