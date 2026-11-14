/**
 * The audio engine's metronome starts its first click this long after
 * `startMetronome` is called (START_LEAD in src/audio/engine.ts). `startMetronome`
 * does not return its start time, so we derive it from `now()` plus this lead.
 * Recommended contract change: have startMetronome return `startTime`.
 */
export const METRONOME_START_LEAD_S = 0.1;

/** Seconds before the next click's scheduled time at which the engine commits it (HORIZON + pump). */
export const METRONOME_STOP_MARGIN_S = 0.3;

export const TICK_MS = 20;
export const PULSE_MS = 120;
