import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bar, note, passage } from './fixtures';
import { EditHistory, useEditHistory } from './use-edit-history';

const mk = (n: number) => passage([bar(note('C4'), ...Array.from({ length: n }, () => note('D4')))]);

describe('EditHistory', () => {
  it('push, undo, redo', () => {
    const h = new EditHistory();
    const p0 = mk(0), p1 = mk(1), p2 = mk(2);
    h.sync(p0);
    h.commit(p1);
    h.sync(p1);
    h.commit(p2);
    h.sync(p2);
    expect(h.canUndo).toBe(true);
    expect(h.undo()).toBe(p1);
    h.sync(p1);
    expect(h.undo()).toBe(p0);
    h.sync(p0);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe(p1);
    h.sync(p1);
    expect(h.redo()).toBe(p2);
    h.sync(p2);
    expect(h.redo()).toBeNull();
  });
  it('a new edit clears redo', () => {
    const h = new EditHistory();
    const p0 = mk(0), p1 = mk(1);
    h.sync(p0);
    h.commit(p1);
    h.sync(p1);
    h.undo();
    h.sync(p0);
    expect(h.canRedo).toBe(true);
    h.commit(mk(3));
    expect(h.canRedo).toBe(false);
  });
  it('caps at 50', () => {
    const h = new EditHistory();
    let cur = mk(0);
    h.sync(cur);
    for (let i = 1; i <= 60; i++) {
      const next = mk(i);
      h.commit(next);
      h.sync(next);
      cur = next;
    }
    expect(h.past).toHaveLength(50);
    let n = 0;
    while (h.undo()) n++;
    expect(n).toBe(50);
  });
  it('a foreign passage resets; an equal-by-hash one does not', () => {
    const h = new EditHistory();
    const p0 = mk(0), p1 = mk(1);
    h.sync(p0);
    h.commit(p1);
    expect(h.sync(structuredClone(p1))).toBe(false);
    expect(h.canUndo).toBe(true);
    expect(h.sync(mk(5))).toBe(true);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });
  it('the first sync never resets', () => {
    expect(new EditHistory().sync(mk(0))).toBe(false);
  });
});

describe('useEditHistory', () => {
  it('reports canUndo and canRedo reactively', () => {
    const { result } = renderHook(() => useEditHistory());
    const p0 = mk(0), p1 = mk(1);
    act(() => { result.current.sync(p0); });
    expect(result.current.canUndo).toBe(false);
    act(() => { result.current.commit(p1); });
    expect(result.current.canUndo).toBe(true);
    act(() => { result.current.sync(p1); result.current.undo(); });
    expect(result.current.canRedo).toBe(true);
  });
});
