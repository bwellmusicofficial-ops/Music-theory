'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Accidental, NoteValue, Terminology } from '@/engine/types';
import { PALETTE_LABELS } from './a11y/strings';
import type { EditConstraints } from './edit/actions';
import type { Editor } from './use-stave-editor';
import type { Engines } from './types';

const NOTE_GLYPHS: Record<NoteValue, string> = {
  breve: '',
  semibreve: '',
  minim: '',
  crotchet: '',
  quaver: '',
  semiquaver: '',
  demisemiquaver: '',
};
const REST_GLYPHS: Record<NoteValue, string> = {
  breve: '',
  semibreve: '',
  minim: '',
  crotchet: '',
  quaver: '',
  semiquaver: '',
  demisemiquaver: '',
};
const SIGN_GLYPHS: Record<number, string> = {
  [-2]: '',
  [-1]: '',
  0: '',
  1: '',
  2: '',
};
const SIGN_LABELS: Record<number, string> = {
  [-2]: PALETTE_LABELS.doubleFlat,
  [-1]: PALETTE_LABELS.flat,
  0: PALETTE_LABELS.natural,
  1: PALETTE_LABELS.sharp,
  2: PALETTE_LABELS.doubleSharp,
};

interface Item {
  id: string;
  label: string;
  glyph?: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  group: string;
}

export interface StavePaletteProps {
  editor: Editor;
  constraints: EditConstraints;
  engines: Engines;
  terminology: Terminology;
  durations: NoteValue[];
  /** True when the selected event is a note / rest / absent. */
  selected: { isNote: boolean; isRest: boolean; tied: boolean; sign: Accidental | null; chordSize: number } | null;
  chordsEnabled: boolean;
}

export function StavePalette({ editor: ed, constraints: c, engines, terminology, durations, selected, chordsEnabled }: StavePaletteProps) {
  const { armed, caret } = ed.ui;
  const single = c.kind === 'single-note';
  const items: Item[] = [];
  const restOn = selected ? selected.isRest : armed.rest;

  if (!single) {
    for (const value of durations) {
      const d = { value, dots: 0 as const };
      const label = restOn ? engines.rhythm.restName(d, terminology) : engines.rhythm.noteValueName(d, terminology);
      items.push({
        id: `dur-${value}`,
        label,
        glyph: restOn ? REST_GLYPHS[value] : NOTE_GLYPHS[value],
        pressed: armed.value === value,
        onClick: () => ed.chooseValue(value),
        group: 'durations',
      });
    }
    if (c.allow.rests) {
      items.push({ id: 'rest', label: PALETTE_LABELS.rest, glyph: REST_GLYPHS.crotchet, pressed: restOn, onClick: ed.toggleRest, group: 'rest' });
    }
    if (c.allow.maxDots > 0) {
      items.push({ id: 'dot', label: PALETTE_LABELS.dot, glyph: '', pressed: selected ? false : armed.dots > 0, onClick: ed.pressDot, group: 'dot' });
    }
  }
  for (const s of c.allow.signs) {
    items.push({
      id: `sign-${s}`,
      label: SIGN_LABELS[s],
      glyph: SIGN_GLYPHS[s],
      pressed: selected ? selected.sign === s : armed.sign === s,
      disabled: selected ? !selected.isNote : false,
      onClick: () => ed.applySign(s as Accidental),
      group: 'signs',
    });
  }
  if (!single && c.allow.ties) {
    items.push({
      id: 'tie',
      label: PALETTE_LABELS.tie,
      glyph: '⁀',
      pressed: selected?.tied ?? false,
      disabled: !selected || !selected.isNote,
      onClick: ed.toggleTie,
      group: 'tie',
    });
  }
  if (!single && chordsEnabled) {
    items.push({ id: 'chord', label: PALETTE_LABELS.chord, glyph: '≡', pressed: armed.chord, onClick: ed.toggleChord, group: 'chord' });
  }
  if (!single) {
    items.push({ id: 'prev', label: PALETTE_LABELS.previous, glyph: '←', onClick: () => ed.step(-1), group: 'step' });
    items.push({ id: 'next', label: PALETTE_LABELS.next, glyph: '→', onClick: () => ed.step(1), group: 'step' });
  }
  items.push({
    id: 'up',
    label: PALETTE_LABELS.up,
    glyph: '↑',
    disabled: single ? false : !selected || !selected.isNote,
    onClick: () => ed.moveSelected(1),
    group: 'step',
  });
  items.push({
    id: 'down',
    label: PALETTE_LABELS.down,
    glyph: '↓',
    disabled: single ? false : !selected || !selected.isNote,
    onClick: () => ed.moveSelected(-1),
    group: 'step',
  });
  if (!single) {
    items.push({ id: 'add', label: PALETTE_LABELS.add, glyph: '+', onClick: () => ed.addAtCaret(), group: 'step' });
  }
  items.push({ id: 'undo', label: PALETTE_LABELS.undo, glyph: '↶', disabled: !ed.canUndo, onClick: ed.undo, group: 'history' });
  items.push({ id: 'redo', label: PALETTE_LABELS.redo, glyph: '↷', disabled: !ed.canRedo, onClick: ed.redo, group: 'history' });
  if (!single) {
    items.push({ id: 'delete', label: PALETTE_LABELS.delete, glyph: '✕', disabled: !selected && caret.slot === 0, onClick: ed.deleteSelected, group: 'history' });
  }

  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const enabled = items.filter((i) => !i.disabled);
  const active = enabled.find((i) => i.id === activeId) ?? enabled[0];

  const onKeyDown = (e: KeyboardEvent) => {
    const i = enabled.findIndex((x) => x.id === active?.id);
    let n = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % enabled.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = enabled.length - 1;
    if (n < 0) return;
    e.preventDefault();
    const target = enabled[n];
    setActiveId(target.id);
    refs.current[target.id]?.focus();
  };

  return (
    <div role="toolbar" aria-label={PALETTE_LABELS.toolbar} className="mtn-stave__palette" onKeyDown={onKeyDown}>
      {items.map((it) => (
        <button
          key={it.id}
          ref={(el) => {
            refs.current[it.id] = el;
          }}
          type="button"
          className="mtn-stave__tool"
          data-group={it.group}
          aria-label={it.label}
          aria-pressed={it.pressed === undefined ? undefined : it.pressed}
          disabled={it.disabled}
          tabIndex={active?.id === it.id ? 0 : -1}
          onPointerDown={(e) => e.preventDefault()}
          onFocus={() => setActiveId(it.id)}
          onClick={it.onClick}
        >
          {it.glyph !== undefined ? <span aria-hidden="true" className="mtn-stave__glyph">{it.glyph}</span> : null}
        </button>
      ))}
    </div>
  );
}
