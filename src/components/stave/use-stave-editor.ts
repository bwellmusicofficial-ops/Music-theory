'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Accidental, Letter, NoteValue, Passage } from '@/engine/types';
import {
  announceDeleted,
  announceDuration,
  announceHeadAdded,
  announceMoved,
  announcePlaced,
  announceRejected,
  announceSelection,
  announceSign,
  announceTie,
  type DescribeOptions,
} from './a11y/describe';
import { MESSAGES } from './a11y/strings';
import type { EditAction, EditConstraints, EditFocus, EditResult } from './edit/actions';
import { signsForBar } from './edit/accidentals';
import { isEventLocked, isTupletEvent, slotRange } from './edit/constraints';
import {
  chordLetterPosition,
  firstDifferingBar,
  jumpBar,
  nearestLetterPosition,
  referencePosition,
  stepStop,
  stopFor,
  stopsForBar,
  type Stop,
} from './edit/navigation';
import { createReducer } from './edit/reducer';
import type { StaveSound } from './stave-sound';
import type { Armed, Caret, Engines, Selection } from './types';
import { useEditHistory } from './use-edit-history';

export interface EditUi {
  caret: Caret;
  selection: Selection | null;
  armed: Armed;
}

export interface EditorProps {
  engines: Engines;
  enabled: boolean;
  passage: Passage;
  constraints: EditConstraints;
  describe: DescribeOptions;
  sound: StaveSound;
  onChange: (next: Passage) => void;
  firstValue: NoteValue;
  onReject?: () => void;
}

function initialCaret(c: EditConstraints, passage: Passage): Caret {
  for (const entry of c.editable) {
    const r = slotRange(c, passage, entry.bar);
    if (r) return { bar: entry.bar, slot: r[1] };
  }
  return { bar: 0, slot: 0 };
}

export type Editor = ReturnType<typeof useStaveEditor>;

export function useStaveEditor(props: EditorProps) {
  const { engines: e, constraints, passage } = props;
  const reduce = useMemo(() => createReducer(e), [e]);
  const history = useEditHistory();

  const [ui, setUiState] = useState<EditUi>(() => ({
    caret: initialCaret(constraints, passage),
    selection: null,
    armed: { value: props.firstValue, rest: false, dots: 0, sign: null, chord: false },
  }));
  const uiRef = useRef(ui);
  const [live, setLive] = useState('');

  // Always-current props for event handlers.
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    propsRef.current = props;
  });

  const setUi = useCallback((patch: Partial<EditUi>) => {
    uiRef.current = { ...uiRef.current, ...patch };
    setUiState(uiRef.current);
  }, []);

  const announce = useCallback((text: string) => {
    if (!text) return;
    setLive((prev) => (prev.replace(/​/g, '') === text ? text + '​' : text));
  }, []);

  // Foreign passage: parent reset it. History, selection and caret are cleared.
  useLayoutEffect(() => {
    const reset = history.sync(passage);
    if (reset) {
      setUi({ selection: null, caret: initialCaret(constraints, passage) });
    }
  }, [passage, constraints, history, setUi]);

  // The first armed value follows the palette when it changes.
  useEffect(() => {
    setUi({ armed: { ...uiRef.current.armed, value: props.firstValue } });
  }, [props.firstValue, setUi]);

  const cur = useCallback(() => propsRef.current, []);

  const adoptFocus = useCallback(
    (focus: EditFocus) => {
      if (focus.kind === 'event') {
        setUi({
          selection: { bar: focus.bar, event: focus.event, pitchIndex: focus.pitchIndex },
          caret: { bar: focus.bar, slot: focus.event + 1 },
        });
      } else {
        setUi({ selection: null, caret: { bar: focus.bar, slot: focus.slot } });
      }
    },
    [setUi],
  );

  type Announcer = (res: Extract<EditResult, { ok: true }>, before: Passage) => string;

  const perform = useCallback(
    (action: EditAction, say: Announcer, extra?: { throttleSound?: boolean; direction?: 'high' | 'low' }): EditResult => {
      const p = cur();
      if (!p.enabled) return { ok: false, reason: 'not-allowed' };
      const res = reduce(p.passage, action, p.constraints);
      if (!res.ok) {
        announce(announceRejected(res.reason, extra?.direction));
        p.onReject?.();
        return res;
      }
      const emitted = history.commit(res.passage);
      p.onChange(emitted);
      adoptFocus(res.focus);
      p.sound.play(res.sound, { throttle: extra?.throttleSound });
      announce(say(res, p.passage));
      return res;
    },
    [reduce, announce, adoptFocus, cur, history],
  );

  const d = useCallback(() => propsRef.current.describe, []);
  const posOf = useCallback(
    (p: Passage, bar: number, event: number, pitchIndex: number) => {
      const ev = p.bars[bar]?.events[event];
      return ev && ev.kind === 'note' ? e.pitch.stavePosition(ev.pitches[pitchIndex], p.clef) : 4;
    },
    [e],
  );
  const sayPlaced = useCallback<Announcer>(
    (res) => (res.focus.kind === 'event' ? announcePlaced(e, res.passage, res.focus.bar, res.focus.event, d()) : ''),
    [e, d],
  );

  // --- placement ------------------------------------------------------------
  const placeAt = useCallback(
    (bar: number, slot: number, position: number): EditResult => {
      const { armed } = uiRef.current;
      const p = cur();
      if (p.constraints.kind === 'single-note') {
        return perform({ type: 'set-single-note', bar, position, sign: armed.sign }, sayPlaced);
      }
      const action: EditAction = armed.rest
        ? { type: 'insert-rest', bar, slot, value: armed.value, dots: armed.dots }
        : { type: 'insert-note', bar, slot, position, value: armed.value, dots: armed.dots, sign: armed.sign };
      const dir = position > p.constraints.range.max ? 'high' : 'low';
      const res = perform(action, sayPlaced, { direction: dir });
      if (res.ok && (armed.dots !== 0 || armed.sign !== null)) {
        setUi({ armed: { ...uiRef.current.armed, dots: 0, sign: null } });
      }
      return res;
    },
    [perform, setUi, cur, sayPlaced],
  );

  const addHeadAt = useCallback(
    (bar: number, event: number, position: number) =>
      perform(
        { type: 'add-head', bar, event, position, sign: uiRef.current.armed.sign },
        (res) =>
          res.focus.kind === 'event'
            ? announceHeadAdded(e, res.passage, res.focus.bar, res.focus.event, res.focus.pitchIndex, d())
            : '',
      ),
    [perform, e, d],
  );

  const select = useCallback(
    (bar: number, event: number, pitchIndex: number) => {
      const p = cur();
      if (isEventLocked(p.constraints, p.passage, bar, event) || isTupletEvent(p.passage, bar, event)) {
        setUi({ selection: null });
        announce(MESSAGES.fixed);
        return;
      }
      setUi({ selection: { bar, event, pitchIndex }, caret: { bar, slot: event + 1 } });
      const ev = p.passage.bars[bar].events[event];
      if (ev.kind === 'note') p.sound.play(ev.pitches);
      announce(announceSelection(e, p.passage, bar, event, d()));
    },
    [announce, e, setUi, cur, d],
  );

  const clearSelection = useCallback(() => setUi({ selection: null }), [setUi]);

  /** Tap on an event column (rules 3 and 4 of 3.3). */
  const tapEvent = useCallback(
    (bar: number, event: number, pitchIndex: number | null, nearest: number | null, position: number) => {
      const p = cur();
      const ev = p.passage.bars[bar]?.events[event];
      if (!ev) return;
      const { armed, selection } = uiRef.current;
      if (p.constraints.kind === 'single-note') {
        placeAt(bar, 0, position);
        return;
      }
      if (armed.chord && ev.kind === 'note' && pitchIndex === null) {
        addHeadAt(bar, event, position);
        return;
      }
      const idx = pitchIndex ?? nearest ?? 0;
      if (selection && selection.bar === bar && selection.event === event && selection.pitchIndex === idx) {
        setUi({ selection: null });
        return;
      }
      select(bar, event, idx);
    },
    [addHeadAt, placeAt, select, setUi, cur],
  );

  const commitMove = useCallback(
    (bar: number, event: number, pitchIndex: number, position: number, opts?: { direction?: 'high' | 'low' }) =>
      perform(
        { type: 'move-head', bar, event, pitchIndex, position },
        (res) =>
          res.focus.kind === 'event'
            ? announceMoved(e, res.passage, res.focus.bar, res.focus.event, res.focus.pitchIndex, d())
            : '',
        { direction: opts?.direction },
      ),
    [perform, e, d],
  );

  /** Move the selected head by `delta` positions (arrow keys and Step buttons). */
  const moveSelected = useCallback(
    (delta: number): EditResult | null => {
      const p = cur();
      const { selection } = uiRef.current;
      const range = p.constraints.range;
      if (!selection) {
        if (p.constraints.kind === 'single-note') {
          const entry = p.constraints.editable[0];
          if (!entry) return null;
          return perform({ type: 'set-single-note', bar: entry.bar, position: 4, sign: null }, sayPlaced);
        }
        return null;
      }
      const ev = p.passage.bars[selection.bar]?.events[selection.event];
      if (!ev || ev.kind !== 'note') {
        announce(MESSAGES.notAvailable);
        return null;
      }
      const used = ev.pitches.map((x) => e.pitch.stavePosition(x, p.passage.clef));
      const own = used[selection.pitchIndex];
      const step = delta > 0 ? 1 : -1;
      let target = own + delta;
      while (used.includes(target) && target !== own && target >= range.min && target <= range.max) target += step;
      const clamped = Math.min(range.max, Math.max(range.min, target));
      if (clamped === own || (used.includes(clamped) && clamped !== own)) {
        announce(announceRejected('out-of-range', delta > 0 ? 'high' : 'low'));
        p.onReject?.();
        return null;
      }
      return commitMove(selection.bar, selection.event, selection.pitchIndex, clamped);
    },
    [announce, commitMove, e, perform, cur, sayPlaced],
  );

  const addAtCaret = useCallback(
    (position?: number): EditResult | null => {
      const p = cur();
      const { caret } = uiRef.current;
      const r = slotRange(p.constraints, p.passage, caret.bar);
      if (!r) {
        announce(MESSAGES.fixed);
        return null;
      }
      const pos = position ?? referencePosition(e, p.passage, caret);
      return placeAt(caret.bar, Math.max(r[0], Math.min(r[1], caret.slot)), pos);
    },
    [announce, e, placeAt, cur],
  );

  const insertRestAtCaret = useCallback((): EditResult | null => {
    const p = cur();
    const { caret, armed } = uiRef.current;
    const r = slotRange(p.constraints, p.passage, caret.bar);
    if (!r) {
      announce(MESSAGES.fixed);
      return null;
    }
    return perform(
      { type: 'insert-rest', bar: caret.bar, slot: Math.max(r[0], Math.min(r[1], caret.slot)), value: armed.value, dots: armed.dots },
      sayPlaced,
    );
  }, [announce, perform, cur, sayPlaced]);

  const insertLetter = useCallback(
    (letter: Letter, shift: boolean): EditResult | null => {
      const p = cur();
      const { caret, selection } = uiRef.current;
      const range = p.constraints.range;
      if (p.constraints.kind === 'single-note') {
        const entry = p.constraints.editable[0];
        if (!entry) return null;
        const ref = selection ? posOf(p.passage, selection.bar, selection.event, selection.pitchIndex) : 4;
        const pos = nearestLetterPosition(e, letter, ref, p.passage.clef, range);
        if (pos === null) return null;
        return perform({ type: 'set-single-note', bar: entry.bar, position: pos, sign: null }, sayPlaced);
      }
      if (shift) {
        if (!selection) {
          announce(MESSAGES.notAvailable);
          return null;
        }
        const ev = p.passage.bars[selection.bar].events[selection.event];
        if (ev.kind !== 'note') {
          announce(MESSAGES.notAvailable);
          return null;
        }
        const used = ev.pitches.map((x) => e.pitch.stavePosition(x, p.passage.clef));
        const pos = chordLetterPosition(e, letter, Math.max(...used), Math.min(...used), p.passage.clef, range, used);
        if (pos === null) {
          announce(announceRejected('out-of-range', 'high'));
          return null;
        }
        return addHeadAt(selection.bar, selection.event, pos);
      }
      const ref = referencePosition(e, p.passage, caret);
      const pos = nearestLetterPosition(e, letter, ref, p.passage.clef, range);
      if (pos === null) {
        announce(announceRejected('out-of-range', 'high'));
        return null;
      }
      return addAtCaret(pos);
    },
    [addAtCaret, addHeadAt, announce, e, perform, cur, posOf, sayPlaced],
  );

  // --- changes to the selected event ---------------------------------------------
  const selectedEvent = useCallback(() => {
    const p = propsRef.current;
    const { selection } = uiRef.current;
    if (!selection) return null;
    const ev = p.passage.bars[selection.bar]?.events[selection.event];
    return ev ? { ev, selection } : null;
  }, []);

  const chooseValue = useCallback(
    (value: NoteValue) => {
      setUi({ armed: { ...uiRef.current.armed, value } });
      const s = selectedEvent();
      if (s) {
        perform({ type: 'set-value', bar: s.selection.bar, event: s.selection.event, value }, (res) =>
          announceDuration(e, res.passage, s.selection.bar, s.selection.event, d()),
        );
      }
    },
    [e, perform, setUi, d, selectedEvent],
  );

  const pressDot = useCallback(() => {
    const p = cur();
    const max = p.constraints.allow.maxDots;
    if (max === 0) {
      announce(MESSAGES.notAvailable);
      return;
    }
    const s = selectedEvent();
    if (s) {
      const next = ((s.ev.duration.dots + 1) % (max + 1)) as 0 | 1 | 2;
      perform({ type: 'set-dots', bar: s.selection.bar, event: s.selection.event, dots: next }, (res) =>
        announceDuration(e, res.passage, s.selection.bar, s.selection.event, d()),
      );
    } else {
      const armed = uiRef.current.armed;
      setUi({ armed: { ...armed, dots: ((armed.dots + 1) % (max + 1)) as 0 | 1 | 2 } });
    }
  }, [announce, e, perform, setUi, cur, d, selectedEvent]);

  const currentSign = useCallback((): Accidental | null => {
    const p = cur();
    const s = selectedEvent();
    if (!s || s.ev.kind !== 'note') return null;
    const tieIn = p.passage.bars[s.selection.bar - 1]?.events.at(-1);
    const signs = signsForBar(
      e,
      p.passage.bars[s.selection.bar],
      p.passage.key,
      tieIn && tieIn.kind === 'note' && tieIn.tieToNext ? tieIn : undefined,
    );
    // Heads are listed in pitches order in `signs`.
    return signs[s.selection.event]?.[s.selection.pitchIndex] ?? null;
  }, [cur, e, selectedEvent]);

  /** Set a sign: on the selected head if there is one, else arm it. Pressing the sign it has removes it. */
  const applySign = useCallback(
    (sign: Accidental | null) => {
      const p = cur();
      if (p.constraints.allow.signs.length === 0 || (sign !== null && !p.constraints.allow.signs.includes(sign))) {
        announce(MESSAGES.notAvailable);
        return;
      }
      const s = selectedEvent();
      if (s) {
        if (s.ev.kind !== 'note') {
          announce(MESSAGES.notAvailable);
          return;
        }
        const target = sign !== null && currentSign() === sign ? null : sign;
        perform({ type: 'set-sign', bar: s.selection.bar, event: s.selection.event, pitchIndex: s.selection.pitchIndex, sign: target }, (res) =>
          announceSign(e, res.passage, s.selection.bar, s.selection.event, s.selection.pitchIndex, target, d()),
        );
      } else {
        const armed = uiRef.current.armed;
        setUi({ armed: { ...armed, sign: armed.sign === sign ? null : sign } });
      }
    },
    [announce, e, perform, setUi, cur, currentSign, d, selectedEvent],
  );

  const toggleRest = useCallback(() => {
    const p = cur();
    if (!p.constraints.allow.rests) {
      announce(MESSAGES.notAvailable);
      return;
    }
    const s = selectedEvent();
    if (s) {
      if (s.ev.kind === 'note') {
        perform({ type: 'to-rest', bar: s.selection.bar, event: s.selection.event }, (res) =>
          announceDuration(e, res.passage, s.selection.bar, s.selection.event, d()),
        );
      } else {
        const pos = referencePosition(e, p.passage, { bar: s.selection.bar, slot: s.selection.event });
        perform({ type: 'to-note', bar: s.selection.bar, event: s.selection.event, position: pos }, (res) =>
          announcePlaced(e, res.passage, s.selection.bar, s.selection.event, d()),
        );
      }
    } else {
      setUi({ armed: { ...uiRef.current.armed, rest: !uiRef.current.armed.rest } });
    }
  }, [announce, e, perform, setUi, cur, d, selectedEvent]);

  const toggleChord = useCallback(() => {
    setUi({ armed: { ...uiRef.current.armed, chord: !uiRef.current.armed.chord } });
  }, [setUi]);

  const toggleTie = useCallback(() => {
    const s = selectedEvent();
    if (!s) {
      announce(MESSAGES.notAvailable);
      return;
    }
    const was = s.ev.kind === 'note' && s.ev.tieToNext === true;
    perform({ type: 'toggle-tie', bar: s.selection.bar, event: s.selection.event }, () => announceTie(!was));
  }, [announce, perform, selectedEvent]);

  const deleteSelected = useCallback(() => {
    const p = cur();
    const s = selectedEvent();
    if (s) {
      const { bar, event, pitchIndex } = s.selection;
      const multi = s.ev.kind === 'note' && s.ev.pitches.length > 1;
      const action: EditAction = multi
        ? { type: 'remove-head', bar, event, pitchIndex }
        : { type: 'delete-event', bar, event };
      perform(action, (res) => announceDeleted(res.passage, bar, d()));
      return;
    }
    // Backspace with no selection deletes the event before the caret.
    const { caret } = uiRef.current;
    if (caret.slot > 0) {
      perform({ type: 'delete-event', bar: caret.bar, event: caret.slot - 1 }, (res) => announceDeleted(res.passage, caret.bar, d()));
    } else {
      announce(MESSAGES.notAvailable);
    }
    void p;
  }, [announce, perform, cur, d, selectedEvent]);

  // --- history ---------------------------------------------------------------------
  const applyHistory = useCallback(
    (target: Passage | null, text: string) => {
      const p = cur();
      if (!target) return;
      const bar = firstDifferingBar(p.passage, target);
      const r = slotRange(p.constraints, target, bar);
      const caretBar = r ? bar : (p.constraints.editable[0]?.bar ?? 0);
      const r2 = slotRange(p.constraints, target, caretBar);
      setUi({ selection: null, caret: { bar: caretBar, slot: r2 ? r2[1] : 0 } });
      p.onChange(target);
      announce(text);
    },
    [announce, setUi, cur],
  );
  const undo = useCallback(() => applyHistory(history.undo(), MESSAGES.undone), [applyHistory, history]);
  const redo = useCallback(() => applyHistory(history.redo(), MESSAGES.redone), [applyHistory, history]);

  // --- navigation ------------------------------------------------------------------
  const goToStop = useCallback(
    (stop: Stop | null) => {
      const p = cur();
      if (!stop) return;
      if (stop.kind === 'event') {
        setUi({ selection: { bar: stop.bar, event: stop.event, pitchIndex: 0 }, caret: { bar: stop.bar, slot: stop.event + 1 } });
        const ev = p.passage.bars[stop.bar].events[stop.event];
        // Land on the top head.
        if (ev.kind === 'note') {
          const top = ev.pitches
            .map((x, i) => ({ i, pos: e.pitch.stavePosition(x, p.passage.clef) }))
            .sort((a, b) => b.pos - a.pos)[0].i;
          uiRef.current = { ...uiRef.current, selection: { bar: stop.bar, event: stop.event, pitchIndex: top } };
          setUiState(uiRef.current);
          p.sound.play(ev.pitches);
        }
        announce(announceSelection(e, p.passage, stop.bar, stop.event, d()));
      } else {
        setUi({ selection: null, caret: { bar: stop.bar, slot: stop.slot } });
        announce(announceSelection(e, p.passage, stop.bar, null, d()));
      }
    },
    [announce, e, setUi, cur, d],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      const p = cur();
      const from = stopFor(p.constraints, p.passage, uiRef.current);
      goToStop(stepStop(p.constraints, p.passage, from, dir));
    },
    [goToStop, cur],
  );
  const jump = useCallback(
    (dir: 1 | -1) => {
      const p = cur();
      goToStop(jumpBar(p.constraints, p.passage, uiRef.current.caret.bar, dir));
    },
    [goToStop, cur],
  );
  const home = useCallback(() => {
    const p = cur();
    const bar = uiRef.current.caret.bar;
    const r = slotRange(p.constraints, p.passage, bar);
    if (!r) return;
    setUi({ selection: null, caret: { bar, slot: r[0] } });
    announce(announceSelection(e, p.passage, bar, null, d()));
  }, [announce, e, setUi, cur, d]);
  const end = useCallback(() => {
    const p = cur();
    const bar = uiRef.current.caret.bar;
    const stops = stopsForBar(p.constraints, p.passage, bar);
    goToStop(stops.length ? stops[stops.length - 1] : null);
  }, [goToStop, cur]);

  const cycleHead = useCallback(
    (dir: 1 | -1) => {
      const p = cur();
      const s = selectedEvent();
      if (!s || s.ev.kind !== 'note' || s.ev.pitches.length < 2) return;
      const order = s.ev.pitches
        .map((x, i) => ({ i, pos: e.pitch.stavePosition(x, p.passage.clef) }))
        .sort((a, b) => a.pos - b.pos);
      const at = order.findIndex((o) => o.i === s.selection.pitchIndex);
      const next = order[at + dir];
      if (!next) return;
      setUi({ selection: { ...s.selection, pitchIndex: next.i } });
      announce(`${announceMoved(e, p.passage, s.selection.bar, s.selection.event, next.i, d())}`);
    },
    [announce, e, setUi, cur, d, selectedEvent],
  );

  const playSelected = useCallback(() => {
    const s = selectedEvent();
    if (s && s.ev.kind === 'note') cur().sound.play(s.ev.pitches);
  }, [cur, selectedEvent]);

  return {
    ui,
    uiRef,
    live,
    announce,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    setUi,
    perform,
    placeAt,
    addHeadAt,
    select,
    clearSelection,
    tapEvent,
    commitMove,
    moveSelected,
    addAtCaret,
    insertRestAtCaret,
    insertLetter,
    chooseValue,
    pressDot,
    applySign,
    currentSign,
    toggleRest,
    toggleChord,
    toggleTie,
    deleteSelected,
    undo,
    redo,
    step,
    jump,
    home,
    end,
    cycleHead,
    playSelected,
  };
}
