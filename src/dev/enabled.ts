/**
 * True only when the app was built with NEXT_PUBLIC_ENABLE_DEV_ROUTES=1 (the
 * end-to-end tests do this). Gates the test harness page and the test hooks
 * (`window.__mockPaper`, `data-test-*` attributes). Inlined at build time.
 *
 * A constant exported from here is NOT folded away across modules by the bundler, so
 * the code that must vanish from production (`__mockPaper`, `data-test-correct`) tests
 * `process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES === '1'` directly at the use site, where
 * the bundler replaces it with a literal and drops the dead branch.
 */
export const DEV_ROUTES_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES === '1';
