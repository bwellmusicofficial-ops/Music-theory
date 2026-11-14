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
