/** Class toggles on cached VexFlow groups. Never calls VexFlow (section 1.3, stage 3). */
import type { StaveMark } from '../types';
import type { EventElements } from './draw';

export interface DecorateState {
  marks?: Record<string, StaveMark>;
  cursor?: { bar: number; event: number } | null;
  selection?: { bar: number; event: number } | null;
  locked?: ReadonlySet<string>;
}

const CLASSES = ['mtn-ev--correct', 'mtn-ev--wrong', 'mtn-ev--playing', 'mtn-ev--selected', 'mtn-ev--locked'] as const;

function toggle(el: Element | null, cls: string, on: boolean) {
  if (!el) return;
  if (on) el.classList.add(cls);
  else el.classList.remove(cls);
}

export function decorate(elements: Map<string, EventElements>, state: DecorateState): void {
  const cur = state.cursor ? `${state.cursor.bar}:${state.cursor.event}` : null;
  const sel = state.selection ? `${state.selection.bar}:${state.selection.event}` : null;
  elements.forEach((el, key) => {
    const mark = state.marks?.[key];
    const on: Record<(typeof CLASSES)[number], boolean> = {
      'mtn-ev--correct': mark === 'correct',
      'mtn-ev--wrong': mark === 'wrong',
      'mtn-ev--playing': cur === key,
      'mtn-ev--selected': sel === key,
      'mtn-ev--locked': state.locked?.has(key) ?? false,
    };
    for (const c of CLASSES) {
      toggle(el.group, c, on[c]);
      toggle(el.stem, c, on[c]);
    }
  });
}

/** The lifted class is applied imperatively during a drag. */
export function setLifted(elements: Map<string, EventElements>, key: string, lifted: boolean): void {
  const el = elements.get(key);
  toggle(el?.group ?? null, 'mtn-ev--lifted', lifted);
  toggle(el?.stem ?? null, 'mtn-ev--lifted', lifted);
}
