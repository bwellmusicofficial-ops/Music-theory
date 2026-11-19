/** Every tunable number from docs/stave-interaction.md lives here. */
import type { StaveSize } from './types';

export const SCALES: Record<StaveSize, number> = { sm: 1.0, md: 1.25, lg: 1.5 };
export const POSITION_UNITS = 5;
export const LINE_GAP = 10;
export const PAD = 14;
export const SYSTEM_GAP = 6;
export const MAX_BARS_PER_SYSTEM = 4;
export const JUSTIFY_THRESHOLD = 0.6;
export const SINGLE_BAR_MAX_STRETCH = 1.5;
export const MIN_SCALE_FACTOR = 0.75;

export const EDITABLE_MIN_NOTES_WIDTH = 110;
export const READ_MIN_NOTES_WIDTH = 60;
export const APPEND_ZONE = 30;
export const BAR_EXTRA = 10;
export const MIN_EVENT_PX = 24;
/** Gap toggles (read mode): wanted width where the gap allows, and the least width ever. */
export const GAP_TARGET_PX = 44;
export const GAP_MIN_PX = 24;
export const MIN_WIDTH_FACTOR = 1.4;

export const CORE_PAD = 3;
export const CORE_MIN_PX = 12;
export const MIN_SLOT = 8;
export const EMPTY_SLOT_OFFSET = 15;
export const FIRST_SLOT_OFFSET = 6;
export const LAST_SLOT_OFFSET = 15;
export const LAST_SLOT_END_INSET = 10;
export const HEAD_HIT_DISTANCE = 7.5;
export const HOVER_TARGET_HYSTERESIS = 4;
export const SNAP_HYSTERESIS = 0.65;
export const OUTSIDE_SYSTEM_LIMIT = 20;

export const DEFAULT_RANGE = { min: -6, max: 14 };

export const SLOP_TOUCH_PX = 10;
export const SLOP_MOUSE_PX = 6;

export const HISTORY_LIMIT = 50;
export const BAR_CAPACITY_FACTOR = 2;
export const BAR_CAPACITY_EVENTS = 32;
export const MAX_CHORD = 4;

export const SOUND_DURATION_MS = 350;
export const DRAG_SOUND_INTERVAL_MS = 80;

export const FONT_TIMEOUT_MS = 3000;
export const LOUPE_SIZE_PX = 96;
export const LOUPE_OFFSET_PX = 72;
export const LOUPE_MIN_ABOVE_PX = 110;
export const LOUPE_VIEW_UNITS = 32;

export const BADGE_SIZE = 12;
export const BADGE_GAP = 4;

export const NOTEHEAD_GLYPH = '';
export const FLAT_GLYPH = '';
export const NATURAL_GLYPH = '';
export const SHARP_GLYPH = '';
export const DOUBLE_SHARP_GLYPH = '';
export const DOUBLE_FLAT_GLYPH = '';

// Expression (docs/expression.md section 4, docs/stave-interaction.md section 14). Units unless stated.
/** Highest reserved position (above the bottom line) when a system holds a tempo, pause, sign or word above the stave. */
export const EXPR_TOP_RESERVED_MAX = 14;
/** Lowest reserved position (negative) when a system holds a dynamic, hairpin or word below the stave. */
export const EXPR_BOTTOM_RESERVED_MIN = -9;
/** Dynamic letters: baseline distance below the bottom stave line. */
export const DYN_BASELINE_OFFSET = 28;
/** Rough extent of a drawn dynamic letter above and below its baseline (for room checks). */
export const DYN_ASCENT = 21;
export const DYN_DESCENT = 9;
/** Clear space kept between the lowest note content and the top of the dynamic letters. */
export const DYN_NOTE_GAP = 3;
/** Gap between neighbouring dynamics or a dynamic and a hairpin. */
export const DYN_GAP = 4;
/** A hairpin squeezed below this width (units) moves to a lower lane instead. */
export const HAIRPIN_MIN_WIDTH = 16;
export const HAIRPIN_HEIGHT = 10;
/** Where a hairpin split over two systems is when it crosses the break, as a share of its full opening. */
export const HAIRPIN_SPLIT_OPEN = 0.6;
export const HAIRPIN_LANE_GAP = 14;
/** Words: font size (pt, VexFlow convention) and baseline offsets from the stave lines. */
export const WORDS_FONT_PT = 11;
export const WORDS_BELOW_OFFSET = 28;
export const WORDS_ABOVE_OFFSET = 14;
export const TEMPO_BASELINE_ABOVE = 24;
export const SLUR_GAP = 9;
/** Gap left between a slur's end and a sign (staccato, accent, tenuto, pause) on the slur's side of the note. */
export const SLUR_SIGN_CLEAR = 4;
/** Signs above a stem-down note are lifted this much off VexFlow's position. */
export const ARTIC_ABOVE_LIFT = 4;
/** Height of the ink of an articulation sign and of a pause sign, for clearing them. */
export const ARTIC_INK = 8;
export const FERMATA_INK = 12;
export const SLUR_MIN_HEIGHT = 12;
export const SLUR_MAX_HEIGHT = 26;
/** Room kept at the right of a line for a dynamic under its last note. */
export const DYN_RIGHT_ROOM = 8;
