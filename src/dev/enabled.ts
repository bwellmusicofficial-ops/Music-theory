/**
 * True only when the app was built with NEXT_PUBLIC_ENABLE_DEV_ROUTES=1 (the
 * end-to-end tests do this). Gates the test harness page and the test hooks
 * (`window.__mockPaper`, `data-test-*` attributes). Inlined at build time, so in a
 * production build without the variable the hooks compile away.
 */
export const DEV_ROUTES_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES === '1';
