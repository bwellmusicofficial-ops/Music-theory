import type { StrandId } from '@/components/ui';

/**
 * The games on the Games page and the dashboard. Add a game by adding a row;
 * the page needs no other change.
 */
export interface GameInfo {
  id: string;
  name: string;
  /** One line. */
  description: string;
  /** Colours the card. */
  strand: StrandId;
  href: string;
  /**
   * Where the game keeps its personal best in localStorage, so the dashboard
   * can show it. 'single': the value is one number. 'by-deck': a JSON map of
   * deck id to score, and the best of them is shown. Omit when there is none.
   */
  best?: { key: string; shape: 'single' | 'by-deck' };
}

export const GAMES: readonly GameInfo[] = [
  {
    id: 'note-rush',
    name: 'Note Rush',
    description: 'Name the notes as they fly across the stave before they get away.',
    strand: 'pitch',
    href: '/games/note-rush',
    // Same key as BEST_SCORE_KEY in src/app/(site)/games/note-rush/runner.tsx.
    best: { key: 'mtn:v1:note-rush-best', shape: 'single' },
  },
  {
    id: 'term-blitz',
    name: 'Term Blitz',
    description: 'Rapid-fire musical terms and signs. How many can you get in a minute?',
    strand: 'terms',
    href: '/games/term-blitz',
    // Same key as BEST_SCORES_KEY in src/games/term-blitz/best-scores.ts.
    best: { key: 'mtn:v1:term-blitz-best', shape: 'by-deck' },
  },
  {
    id: 'tap-it',
    name: 'Tap It',
    description: 'Read the rhythm and tap it in time. Notes light up as you hit them.',
    strand: 'rhythm',
    href: '/games/tap-it',
    // Same key as BEST_SCORE_KEY in src/app/(site)/games/tap-it/runner.tsx (a JSON map of mode to score).
    best: { key: 'mtn:v1:tap-it-best', shape: 'by-deck' },
  },
  {
    id: 'key-hunt',
    name: 'Key Hunt',
    description: 'Spot the key from its key signature before the timer runs out.',
    strand: 'scales-keys',
    href: '/games/key-hunt',
    // Same key as BEST_SCORE_KEY in src/app/(site)/games/key-hunt/runner.tsx (a JSON map of mode to score).
    best: { key: 'mtn:v1:key-hunt-best', shape: 'by-deck' },
  },
];
