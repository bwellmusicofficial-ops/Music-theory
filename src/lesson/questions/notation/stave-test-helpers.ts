/** Helpers for component tests that drive the real Stave under jsdom. Not imported by production code. */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { getStaveLayout } from '@/components/stave/layout-registry';

/** Waits until VexFlow has drawn the notation. */
export async function drawn(container: HTMLElement): Promise<void> {
  await waitFor(() => expect(container.querySelector('.vf-stavenote, .vf-stave')).toBeTruthy());
}

/** Pointer helpers for the edit surface, after the pattern in the stave's own tests. */
export function editSurface(container: HTMLElement) {
  const canvas = () => container.querySelector('.mtn-stave__canvas') as HTMLElement;
  const model = () => getStaveLayout(canvas())!;
  const surface = () => screen.getByTestId('stave-surface');
  const client = (x: number, y: number) => ({ clientX: x * model().scale, clientY: y * model().scale });
  const slotPoint = (bar: number, slot: number, position: number) => {
    const b = model().bars.find((x) => x.bar === bar)!;
    const sys = model().systems[b.system];
    return client(b.slotX[slot], sys.bottomLineY - position * 5);
  };
  const ptr = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', pt: { clientX: number; clientY: number }) =>
    fireEvent[type](surface(), { pointerId: 1, pointerType: 'mouse', button: 0, ...pt });
  /** A press and release at the given stave position of a slot. */
  const tapSlot = (bar: number, slot: number, position: number) => {
    const pt = slotPoint(bar, slot, position);
    ptr('pointerDown', pt);
    ptr('pointerUp', pt);
  };
  return { canvas, model, surface, slotPoint, ptr, tapSlot };
}
