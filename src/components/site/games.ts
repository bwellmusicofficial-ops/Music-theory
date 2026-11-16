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
    description: 'Rapid-fire musical terms and signs',
    strand: 'terms',
    href: '/games/term-blitz',
    // Same key as BEST_SCORES_KEY in src/games/term-blitz/best-scores.ts.
    best: { key: 'mtn:v1:term-blitz-best', shape: 'by-deck' },
  },
];
