export { TermBlitz, type TermBlitzProps } from './term-blitz';
export { buildBank, type Bank, type TermInfo } from './bank';
export { buildDecks, type Deck } from './decks';
export {
  answer,
  buildResult,
  cardTimeMs,
  continueRound,
  createGame,
  DEFAULT_CONFIG,
  multiplierForStreak,
  tick,
  type GameEvent,
  type GameResult,
  type GameState,
  type MissedTerm,
  type Step,
  type TermBlitzConfig,
} from './engine';
export { MEANING_LIMIT, parseAbbreviations, shortenMeaning } from './meaning';
export { BEST_SCORES_KEY, parseBestScores } from './best-scores';
