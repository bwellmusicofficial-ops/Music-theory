import '@testing-library/jest-dom/vitest';

// The progress routes keep only lesson ids and game ids that really exist (src/accounts/known-ids.server.ts). Most
// tests save made-up ids such as 'g1-rhythm-01', so by default every id is accepted except ones starting with
// 'unknown-'. The tests of the real lists (src/accounts/known-ids.server.test.ts and progress-validation.test.ts)
// call vi.unmock to use the real thing.
vi.mock('@/accounts/known-ids.server', () => ({
  knownLessonIds: () => ({ has: (id: string) => !id.startsWith('unknown-') }),
  isKnownGameId: (id: string) => !id.startsWith('unknown-'),
}));
