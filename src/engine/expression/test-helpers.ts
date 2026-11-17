import { bar, T } from '../rhythm/test-helpers';
import type { Bar, Expression, Passage, TimeSignature } from '../types';

export { T };

/**
 * A passage from rhythm shorthand (see ../rhythm/test-helpers: "c c rc m~").
 * Every pitch is C4, which is enough: expression never looks at pitch.
 */
export function passage(bars: string[], expression?: Expression, time: TimeSignature = T(4, 4)): Passage {
  return {
    clef: 'treble',
    key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
    time,
    bars: bars.map(bar),
    ...(expression ? { expression } : {}),
  };
}

/** Copy of a passage with extra fields (repeatStart, endBarline, marker) set on given bars. */
export function withBars(p: Passage, extras: Record<number, Partial<Bar>>): Passage {
  return { ...p, bars: p.bars.map((b, i) => ({ ...b, ...(extras[i] ?? {}) })) };
}

/** Copy of a passage with fields set on given events, keyed "bar:event". */
export function withEvents(p: Passage, extras: Record<string, Record<string, unknown>>): Passage {
  return {
    ...p,
    bars: p.bars.map((b, bi) => ({
      ...b,
      events: b.events.map((e, ei) => ({ ...e, ...(extras[`${bi}:${ei}`] ?? {}) }) as typeof e),
    })),
  };
}

export const ref = (bar: number, event: number) => ({ bar, event });
