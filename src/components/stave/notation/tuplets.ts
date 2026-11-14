import type { Bar } from '@/engine/types';

export interface TupletChunk {
  start: number;
  count: number;
  actual: number;
  normal: number;
}

/** Consecutive events with the same ratio, chunked into groups of `actual` events. Display only. */
export function tupletChunks(bar: Bar): TupletChunk[] {
  const chunks: TupletChunk[] = [];
  let i = 0;
  while (i < bar.events.length) {
    const t = bar.events[i].duration.tuplet;
    if (!t) {
      i++;
      continue;
    }
    let j = i;
    while (
      j < bar.events.length &&
      j - i < t.actual &&
      bar.events[j].duration.tuplet?.actual === t.actual &&
      bar.events[j].duration.tuplet?.normal === t.normal
    ) {
      j++;
    }
    chunks.push({ start: i, count: j - i, actual: t.actual, normal: t.normal });
    i = j;
  }
  return chunks;
}
