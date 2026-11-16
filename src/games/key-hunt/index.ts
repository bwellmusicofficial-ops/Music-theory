export { KeyHunt, variantOf, type KeyHuntProps } from './key-hunt';
export {
  answer,
  buildResult,
  createGame,
  DEFAULT_CONFIG,
  multiplierForStreak,
  next,
  questionMs,
  resolveConfig,
  tick,
  type GameEvent,
  type GameResult,
  type GameState,
  type KeyHuntConfig,
  type KeyMistake,
  type Step,
} from './engine';
export { DEFAULT_GRADE, describePool, GRADE_POOLS, gradePool, poolKeys, type GradeId, type GradePool, type PoolEntry } from './pools';
export { buildQuestion, describeSignature, signaturePassage, type AskMode, type Question, type QuestionKind } from './questions';
