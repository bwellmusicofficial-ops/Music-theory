/** Seconds before the next click's scheduled time at which the engine commits it (HORIZON + pump). */
export const METRONOME_STOP_MARGIN_S = 0.3;

export const TICK_MS = 20;
export const PULSE_MS = 120;
/** How long a tap's verdict colour stays on the pad. */
export const FLASH_MS = 260;
/** How long the verdict word stays beside the tally. */
export const VERDICT_MS = 1000;
/** The click pulse on the pad. */
export const BEAT_PULSE_MS = 110;
/** At most one running verdict goes to the live region in this long (seconds on the audio clock). */
export const ANNOUNCE_EVERY_S = 3;
