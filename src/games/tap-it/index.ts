export { TapIt, type TapItProps } from './tap-it';
export {
  buildResult,
  completeRhythm,
  createGame,
  DEFAULT_CONFIG,
  extraTap,
  isTimeUp,
  judge,
  multiplierForStreak,
  resolveConfig,
  restartRhythm,
  tick,
  timeLeftMs,
  timingFor,
  weakestLevel,
  type GameEvent,
  type GameResult,
  type GameState,
  type RhythmRecord,
  type StartChoice,
  type Step,
  type TapItConfig,
  type Verdict,
} from './engine';
export { LEVELS, levelSpec, type LevelSpec } from './levels';
export { generateRhythm, type TapRhythm } from './rhythms';
