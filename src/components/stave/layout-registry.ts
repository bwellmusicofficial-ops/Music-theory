import type { LayoutModel } from './types';

const registry = new WeakMap<Element, LayoutModel>();

/** Records the layout of a canvas element; tests read it back to compute pointer coordinates. */
export function setStaveLayout(canvas: Element, model: LayoutModel): void {
  registry.set(canvas, model);
}
export function getStaveLayout(canvas: Element): LayoutModel | undefined {
  return registry.get(canvas);
}
