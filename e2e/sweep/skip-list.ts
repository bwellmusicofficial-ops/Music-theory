/**
 * Questions the sweep knows are broken because of their CONTENT (not code), so the test is
 * skipped on purpose and the reason is on record. Key: "<lesson id>/<question id>" or
 * "<lesson id>/<question id>#<seed>". Anything here must also be reported to the content owner.
 */
export const SKIPPED: Record<string, string> = {};
