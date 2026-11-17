/** The only dynamic import of VexFlow. Client only. */
import { FONT_TIMEOUT_MS } from './constants';

export type VexFlowModule = typeof import('vexflow/bravura');

let promise: Promise<VexFlowModule> | null = null;
let warned = false;
let fontsReadyFlag = false;

export function fontsReady(): boolean {
  return fontsReadyFlag;
}

export function loadVexFlow(): Promise<VexFlowModule> {
  if (!promise) {
    promise = (async () => {
      const mod = await import('vexflow/bravura');
      if (typeof document !== 'undefined' && document.fonts?.load) {
        // Bravura draws the music; Academico draws tempo words, D.C. and the like (VexFlow measures them to place them).
        const font = Promise.all([document.fonts.load('30pt Bravura'), document.fonts.load('bold 12pt Academico'), document.fonts.load('12pt Academico')]).then(() => true as const);
        const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), FONT_TIMEOUT_MS));
        const ok = await Promise.race([font, timeout]);
        fontsReadyFlag = ok;
        if (!ok && !warned) {
          warned = true;
          console.warn('Bravura did not load within 3 seconds; drawing the stave anyway.');
        }
      } else {
        fontsReadyFlag = true;
      }
      return mod;
    })();
  }
  return promise;
}

/** Reset the singleton (tests only). */
export function resetVexFlowLoaderForTests(): void {
  promise = null;
  warned = false;
  fontsReadyFlag = false;
}
