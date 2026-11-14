'use client';

import { useCallback, type KeyboardEvent } from 'react';
import type { Letter, NoteValue } from '@/engine/types';
import { MESSAGES } from './a11y/strings';
import { cycleFlat, cycleSharp, toggleNatural } from './edit/accidentals';
import type { EditConstraints } from './edit/actions';
import type { Editor } from './use-stave-editor';

const DIGITS: Record<string, NoteValue> = {
  '2': 'demisemiquaver',
  '3': 'semiquaver',
  '4': 'quaver',
  '5': 'crotchet',
  '6': 'minim',
  '7': 'semibreve',
  '8': 'breve',
};

export interface KeyboardDeps {
  editor: Editor;
  constraints: EditConstraints;
  /** Abandons a gesture in progress; returns true if there was one. */
  abortGesture: () => boolean;
}

/** Key map for the edit surface (3.6). Keys not listed are neither handled nor prevented. */
export function useStaveKeyboard({ editor: ed, constraints, abortGesture }: KeyboardDeps) {
  return useCallback(
    (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;
      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      const allowDouble = constraints.allow.signs.includes(2);

      if (mod) {
        if (key.toLowerCase() === 'z') {
          handled();
          if (e.shiftKey) ed.redo();
          else ed.undo();
          return;
        }
        if (key.toLowerCase() === 'y' && e.ctrlKey) {
          handled();
          ed.redo();
          return;
        }
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          handled();
          ed.jump(key === 'ArrowRight' ? 1 : -1);
        }
        return;
      }
      if (e.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
        handled();
        ed.cycleHead(key === 'ArrowUp' ? 1 : -1);
        return;
      }
      if (e.altKey) return;

      switch (key) {
        case 'ArrowLeft':
          handled();
          ed.step(-1);
          return;
        case 'ArrowRight':
          handled();
          ed.step(1);
          return;
        case 'Home':
          handled();
          ed.home();
          return;
        case 'End':
          handled();
          ed.end();
          return;
        case 'ArrowUp':
          handled();
          ed.moveSelected(e.shiftKey ? 7 : 1);
          return;
        case 'ArrowDown':
          handled();
          ed.moveSelected(e.shiftKey ? -7 : -1);
          return;
        case 'Enter':
          handled();
          if (ed.uiRef.current.armed.rest) ed.insertRestAtCaret();
          else ed.addAtCaret();
          return;
        case 'Backspace':
        case 'Delete':
          handled();
          ed.deleteSelected();
          return;
        case ' ':
          handled();
          ed.playSelected();
          return;
        case 'Escape':
          if (!abortGesture()) ed.clearSelection();
          return;
        case '.':
          handled();
          ed.pressDot();
          return;
        case '+':
        case '=': {
          handled();
          const cur = ed.uiRef.current.selection ? ed.currentSign() : ed.uiRef.current.armed.sign;
          ed.applySign(cycleSharp(cur, allowDouble));
          return;
        }
        case '-': {
          handled();
          const cur = ed.uiRef.current.selection ? ed.currentSign() : ed.uiRef.current.armed.sign;
          ed.applySign(cycleFlat(cur, allowDouble));
          return;
        }
      }

      if (key in DIGITS) {
        handled();
        const value = DIGITS[key];
        if (!constraints.allow.values.includes(value)) ed.announce(MESSAGES.notAvailable);
        else ed.chooseValue(value);
        return;
      }
      if (key.length === 1) {
        const k = key.toLowerCase();
        if (k >= 'a' && k <= 'g') {
          handled();
          ed.insertLetter(k.toUpperCase() as Letter, e.shiftKey);
          return;
        }
        if (k === 'r') {
          handled();
          ed.insertRestAtCaret();
          return;
        }
        if (k === 't') {
          handled();
          ed.toggleTie();
          return;
        }
        if (k === 'n') {
          handled();
          const cur = ed.uiRef.current.selection ? ed.currentSign() : ed.uiRef.current.armed.sign;
          ed.applySign(toggleNatural(cur));
        }
      }
    },
    [ed, constraints, abortGesture],
  );
}
