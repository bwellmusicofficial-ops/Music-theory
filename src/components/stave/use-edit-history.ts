'use client';

import { useCallback, useState } from 'react';
import type { Passage } from '@/engine/types';
import { HISTORY_LIMIT } from './constants';

const hashes = new WeakMap<Passage, string>();
/** JSON of a passage, memoised on the object reference. */
export function hashPassage(p: Passage): string {
  let h = hashes.get(p);
  if (h === undefined) {
    h = JSON.stringify(p);
    hashes.set(p, h);
  }
  return h;
}

export function samePassage(a: Passage | null, b: Passage | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return hashPassage(a) === hashPassage(b);
}

/** Pure history state machine (section 3.5). */
export class EditHistory {
  past: Passage[] = [];
  future: Passage[] = [];
  private current: Passage | null = null;
  private lastEmitted: Passage | null = null;

  /** Tell the history what the parent currently holds. Returns true when it was reset by a foreign passage. */
  sync(passage: Passage): boolean {
    if (this.current === null) {
      this.current = passage;
      return false;
    }
    if (samePassage(passage, this.current)) {
      this.current = passage;
      return false;
    }
    if (samePassage(passage, this.lastEmitted)) {
      this.current = passage;
      return false;
    }
    this.past = [];
    this.future = [];
    this.lastEmitted = null;
    this.current = passage;
    return true;
  }

  /** An accepted edit: push the replaced passage, clear redo. Returns the passage to emit. */
  commit(next: Passage): Passage {
    if (this.current) {
      this.past.push(this.current);
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.future = [];
    this.lastEmitted = next;
    return next;
  }

  undo(): Passage | null {
    const target = this.past.pop();
    if (!target) return null;
    if (this.current) this.future.push(this.current);
    this.lastEmitted = target;
    return target;
  }

  redo(): Passage | null {
    const target = this.future.pop();
    if (!target) return null;
    if (this.current) this.past.push(this.current);
    this.lastEmitted = target;
    return target;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
}

export interface EditHistoryApi {
  sync(passage: Passage): boolean;
  commit(next: Passage): Passage;
  undo(): Passage | null;
  redo(): Passage | null;
  canUndo: boolean;
  canRedo: boolean;
}

export function useEditHistory(): EditHistoryApi {
  const [h] = useState(() => new EditHistory());
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  return {
    sync: (p) => h.sync(p),
    commit: (n) => {
      const r = h.commit(n);
      bump();
      return r;
    },
    undo: () => {
      const r = h.undo();
      bump();
      return r;
    },
    redo: () => {
      const r = h.redo();
      bump();
      return r;
    },
    canUndo: h.canUndo,
    canRedo: h.canRedo,
  };
}
