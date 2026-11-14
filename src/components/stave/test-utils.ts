import { getStaveLayout } from './layout-registry';

/**
 * jsdom stubs so VexFlow 5 can measure text and draw (docs/stave-interaction.md section 10).
 * Call `installStaveStubs()` in a `beforeAll` or at the top of a test file.
 */
export const STUB_ROOT_RECT = { width: 400, height: 300 };

export function installStaveStubs(): void {
  const ctx = {
    font: '',
    measureText: (t: string) => ({
      width: t.length * 10,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 10,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: t.length * 10,
    }),
  };
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];

  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load: async () => [], addEventListener() {}, removeEventListener() {} },
  });

  class StubResizeObserver {
    constructor(private cb: ResizeObserverCallback) {
      void this.cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver;

  // Fixed rects: the stave root is STUB_ROOT_RECT wide; the canvas is exactly the notation size.
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this.classList.contains('mtn-stave')) return rect(0, 0, STUB_ROOT_RECT.width, STUB_ROOT_RECT.height);
    if (this.classList.contains('mtn-stave__canvas')) {
      const m = getStaveLayout(this);
      if (m) return rect(0, 0, m.width * m.scale, m.height * m.scale);
    }
    return rect(0, 0, 0, 0);
  };

  Element.prototype.scrollIntoView = function () {};
  if (!('setPointerCapture' in Element.prototype)) {
    (Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
    (Element.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
  }
  if (typeof window.requestAnimationFrame !== 'function') {
    window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0) as unknown as number) as typeof window.requestAnimationFrame;
  }
}

/** A DOMRect-like object. */
export function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {},
  } as DOMRect;
}
