import type { Bar, NoteEvent, Passage, Pitch, ScoreEvent } from '@/engine/types';
import type { Engines } from '../types';
import type { EditAction, EditConstraints, EditFocus, EditResult, RejectReason, Sign } from './actions';
import { fromWritten, toWritten, type WrittenEvent, type WrittenHead } from './accidentals';
import { isBarEditable, isEventLocked, isTupletEvent, slotRange, withinCapacity } from './constraints';
import { carryEventMarks, deleteMap, hasExpressionOrMarks, identityMap, insertMap, remapExpression, type EventMap } from './expression-refs';
import { pruneTies } from './ties';

type Fail = { fail: RejectReason };
const fail = (reason: RejectReason): Fail => ({ fail: reason });
const isFail = (x: unknown): x is Fail => typeof x === 'object' && x !== null && 'fail' in x;

interface Draft {
  events: WrittenEvent[];
  focus: EditFocus;
  /** Where each event of the edited bar went (expression refs follow it); identity when omitted. */
  map?: EventMap;
  /** Which written events' pitches should sound: the focus event heads (or a single head). */
  sound: 'focus-head' | 'focus-event' | 'none';
}

const SINGLE_NOTE_ALLOWED = new Set(['set-single-note', 'move-head', 'set-sign']);

function sortHeads(heads: WrittenHead[]): WrittenHead[] {
  return heads.slice().sort((a, b) => a.position - b.position);
}

function inRange(c: EditConstraints, position: number): boolean {
  return position >= c.range.min && position <= c.range.max;
}

export function createReducer(e: Engines) {
  function run(passage: Passage, action: EditAction, c: EditConstraints): EditResult {
    const barIdx = action.bar;
    const bar = passage.bars[barIdx];
    if (!bar) return { ok: false, reason: 'no-target' };
    if (!isBarEditable(c, barIdx)) return { ok: false, reason: 'locked' };
    if (c.kind === 'single-note' && !SINGLE_NOTE_ALLOWED.has(action.type)) {
      return { ok: false, reason: 'not-allowed' };
    }
    if (c.kind === 'free' && action.type === 'set-single-note') {
      return { ok: false, reason: 'not-allowed' };
    }

    // Existence and lock checks for event-addressed actions.
    if ('event' in action) {
      if (action.event < 0 || action.event >= bar.events.length) return { ok: false, reason: 'no-target' };
      if (isEventLocked(c, passage, barIdx, action.event)) return { ok: false, reason: 'locked' };
      if (isTupletEvent(passage, barIdx, action.event)) return { ok: false, reason: 'not-allowed' };
    }
    if ('slot' in action) {
      const r = slotRange(c, passage, barIdx);
      if (!r || action.slot < r[0] || action.slot > r[1]) return { ok: false, reason: 'locked' };
    }

    const tieIn = tieInFor(passage, barIdx);
    const written = toWritten(e, bar, passage.key, passage.clef, tieIn);
    const draft = apply(passage, action, c, written);
    if (isFail(draft)) return { ok: false, reason: draft.fail };

    const rebuilt = fromWritten(e, draft.events, passage.key, passage.clef, tieIn);
    const nextFirst = passage.bars[barIdx + 1]?.events[0];
    let newBar = pruneTies(rebuilt, nextFirst);
    // Expression and written signs ride along: the editor models only pitch, length and ties.
    if (hasExpressionOrMarks(passage)) newBar = carryEventMarks(bar, newBar, draft.map ?? identityMap(bar.events.length));

    if (action.type === 'toggle-tie') {
      const before = bar.events[action.event];
      const turnedOn = before.kind === 'note' && !before.tieToNext;
      const ev = newBar.events[action.event];
      if (turnedOn && ev.kind === 'note' && !ev.tieToNext) return { ok: false, reason: 'no-target' };
    }

    const bars = passage.bars.slice();
    bars[barIdx] = newBar;
    let next: Passage = { ...passage, bars };
    if (hasExpressionOrMarks(passage)) next = remapExpression(passage, next, barIdx, draft.map ?? identityMap(bar.events.length));

    const focus = draft.focus;
    let sound: Pitch[] = [];
    if (focus.kind === 'event' && draft.sound !== 'none') {
      const ev = newBar.events[focus.event];
      if (ev && ev.kind === 'note') {
        sound = draft.sound === 'focus-head' ? [ev.pitches[focus.pitchIndex]].filter(Boolean) : ev.pitches.slice();
      }
    }
    return { ok: true, passage: next, focus, sound };
  }

  function tieInFor(passage: Passage, barIdx: number): NoteEvent | undefined {
    if (barIdx === 0) return undefined;
    const prev = passage.bars[barIdx - 1].events;
    const last = prev[prev.length - 1] as ScoreEvent | undefined;
    return last && last.kind === 'note' && last.tieToNext ? last : undefined;
  }

  function capacity(passage: Passage, events: WrittenEvent[]): boolean {
    const asEvents = events.map<ScoreEvent>((w) =>
      w.kind === 'rest'
        ? { kind: 'rest', duration: w.duration }
        : { kind: 'note', pitches: [{ letter: 'C', accidental: 0, octave: 4 }], duration: w.duration },
    );
    return withinCapacity(e, passage, asEvents);
  }

  function apply(passage: Passage, a: EditAction, c: EditConstraints, w: WrittenEvent[]): Draft | Fail {
    const slotFocus = (slot: number): EditFocus => ({ kind: 'slot', bar: a.bar, slot });
    const evFocus = (event: number, pitchIndex = 0): EditFocus => ({ kind: 'event', bar: a.bar, event, pitchIndex });

    switch (a.type) {
      case 'insert-note': {
        if (!c.allow.values.includes(a.value)) return fail('not-allowed');
        if (a.dots > c.allow.maxDots) return fail('not-allowed');
        if (a.sign !== null && !c.allow.signs.includes(a.sign)) return fail('not-allowed');
        if (!inRange(c, a.position)) return fail('out-of-range');
        const events = w.slice();
        events.splice(a.slot, 0, {
          kind: 'note',
          duration: { value: a.value, dots: a.dots },
          tieToNext: false,
          heads: [{ position: a.position, sign: a.sign }],
        });
        if (!capacity(passage, events)) return fail('bar-full');
        return { events, focus: evFocus(a.slot), sound: 'focus-head', map: insertMap(w.length, a.slot) };
      }
      case 'insert-rest': {
        if (!c.allow.rests || !c.allow.values.includes(a.value)) return fail('not-allowed');
        if (a.dots > c.allow.maxDots) return fail('not-allowed');
        const events = w.slice();
        events.splice(a.slot, 0, {
          kind: 'rest',
          duration: { value: a.value, dots: a.dots },
          tieToNext: false,
          heads: [],
        });
        if (!capacity(passage, events)) return fail('bar-full');
        return { events, focus: evFocus(a.slot), sound: 'none', map: insertMap(w.length, a.slot) };
      }
      case 'set-single-note': {
        const entry = c.editable.find((x) => x.bar === a.bar)!;
        const index = entry.lockedPrefix;
        const end = w.length - entry.lockedSuffix;
        if (a.sign !== null && !c.allow.signs.includes(a.sign)) return fail('not-allowed');
        if (!inRange(c, a.position)) return fail('out-of-range');
        const events = w.slice();
        if (index >= end) {
          const value = c.allow.values[0];
          if (!value) return fail('not-allowed');
          events.splice(index, 0, {
            kind: 'note',
            duration: { value, dots: 0 },
            tieToNext: false,
            heads: [{ position: a.position, sign: a.sign }],
          });
        } else {
          const cur = events[index];
          if (cur.kind !== 'note') return fail('no-target');
          events[index] = { ...cur, heads: [{ position: a.position, sign: a.sign }] };
        }
        return { events, focus: evFocus(index), sound: 'focus-head', map: index >= end ? insertMap(w.length, index) : undefined };
      }
      case 'move-head': {
        const ev = w[a.event];
        if (ev.kind !== 'note') return fail('no-target');
        if (!ev.heads[a.pitchIndex]) return fail('no-target');
        if (!inRange(c, a.position)) return fail('out-of-range');
        if (ev.heads.some((h, i) => i !== a.pitchIndex && h.position === a.position)) {
          return fail('position-occupied');
        }
        const heads = ev.heads.slice();
        const moved: WrittenHead = { position: a.position, sign: null };
        heads[a.pitchIndex] = moved;
        const sorted = sortHeads(heads);
        const events = w.slice();
        events[a.event] = { ...ev, heads: sorted };
        return { events, focus: evFocus(a.event, sorted.indexOf(moved)), sound: 'focus-head' };
      }
      case 'add-head': {
        const ev = w[a.event];
        if (ev.kind !== 'note') return fail('no-target');
        if (c.maxChordSize === 1) return fail('not-allowed');
        if (ev.heads.length >= c.maxChordSize) return fail('chord-full');
        if (a.sign !== null && !c.allow.signs.includes(a.sign)) return fail('not-allowed');
        if (!inRange(c, a.position)) return fail('out-of-range');
        if (ev.heads.some((h) => h.position === a.position)) return fail('position-occupied');
        const added: WrittenHead = { position: a.position, sign: a.sign };
        const sorted = sortHeads([...ev.heads, added]);
        const events = w.slice();
        events[a.event] = { ...ev, heads: sorted };
        return { events, focus: evFocus(a.event, sorted.indexOf(added)), sound: 'focus-event' };
      }
      case 'remove-head': {
        const ev = w[a.event];
        if (ev.kind !== 'note') return fail('no-target');
        if (!ev.heads[a.pitchIndex]) return fail('no-target');
        if (ev.heads.length <= 1) {
          const events = w.slice();
          events.splice(a.event, 1);
          return { events, focus: slotFocus(a.event), sound: 'none', map: deleteMap(w.length, a.event) };
        }
        const heads = ev.heads.filter((_, i) => i !== a.pitchIndex);
        const events = w.slice();
        events[a.event] = { ...ev, heads };
        return { events, focus: evFocus(a.event, Math.min(a.pitchIndex, heads.length - 1)), sound: 'none' };
      }
      case 'set-sign': {
        const ev = w[a.event];
        if (ev.kind !== 'note') return fail('no-target');
        if (!ev.heads[a.pitchIndex]) return fail('no-target');
        if (a.sign !== null && !c.allow.signs.includes(a.sign)) return fail('not-allowed');
        if (c.allow.signs.length === 0) return fail('not-allowed');
        const heads = ev.heads.slice();
        heads[a.pitchIndex] = { ...heads[a.pitchIndex], sign: a.sign };
        const events = w.slice();
        events[a.event] = { ...ev, heads };
        return { events, focus: evFocus(a.event, a.pitchIndex), sound: 'focus-head' };
      }
      case 'set-value': {
        if (!c.allow.values.includes(a.value)) return fail('not-allowed');
        const ev = w[a.event];
        const dots = Math.min(ev.duration.dots, c.allow.maxDots) as 0 | 1 | 2;
        const events = w.slice();
        events[a.event] = { ...ev, duration: { value: a.value, dots } };
        if (!lengthOk(passage, w, events)) return fail('bar-full');
        return { events, focus: evFocus(a.event), sound: 'none' };
      }
      case 'set-dots': {
        if (a.dots > c.allow.maxDots) return fail('not-allowed');
        const ev = w[a.event];
        const events = w.slice();
        events[a.event] = { ...ev, duration: { value: ev.duration.value, dots: a.dots } };
        if (!lengthOk(passage, w, events)) return fail('bar-full');
        return { events, focus: evFocus(a.event), sound: 'none' };
      }
      case 'to-rest': {
        if (!c.allow.rests) return fail('not-allowed');
        const ev = w[a.event];
        if (ev.kind === 'rest') return fail('no-target');
        const events = w.slice();
        events[a.event] = { kind: 'rest', duration: ev.duration, tieToNext: false, heads: [] };
        return { events, focus: evFocus(a.event), sound: 'none' };
      }
      case 'to-note': {
        const ev = w[a.event];
        if (ev.kind !== 'rest') return fail('no-target');
        if (!inRange(c, a.position)) return fail('out-of-range');
        const events = w.slice();
        events[a.event] = { kind: 'note', duration: ev.duration, tieToNext: false, heads: [{ position: a.position, sign: null }] };
        return { events, focus: evFocus(a.event), sound: 'focus-head' };
      }
      case 'toggle-tie': {
        if (!c.allow.ties) return fail('not-allowed');
        const ev = w[a.event];
        if (ev.kind !== 'note') return fail('no-target');
        const events = w.slice();
        events[a.event] = { ...ev, tieToNext: !ev.tieToNext };
        return { events, focus: evFocus(a.event), sound: 'none' };
      }
      case 'delete-event': {
        const events = w.slice();
        events.splice(a.event, 1);
        return { events, focus: slotFocus(a.event), sound: 'none', map: deleteMap(w.length, a.event) };
      }
    }
  }

  /** Lengthening is rejected beyond capacity; shortening always passes. */
  function lengthOk(passage: Passage, before: WrittenEvent[], after: WrittenEvent[]): boolean {
    const toEvents = (ws: WrittenEvent[]): ScoreEvent[] =>
      ws.map((x) =>
        x.kind === 'rest'
          ? { kind: 'rest', duration: x.duration }
          : { kind: 'note', pitches: [{ letter: 'C', accidental: 0, octave: 4 }], duration: x.duration },
      );
    const lb = e.rhythm.eventsLength(toEvents(before));
    const la = e.rhythm.eventsLength(toEvents(after));
    if (e.rhythm.compareFractions(la, lb) <= 0) return true;
    return withinCapacity(e, passage, toEvents(after));
  }

  return run;
}

export type Reducer = ReturnType<typeof createReducer>;

export type { Bar, Sign };
