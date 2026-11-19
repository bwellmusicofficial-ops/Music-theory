// @vitest-environment jsdom
/**
 * Cross-check of `pitch.keySignaturePositions` (the engine's table) against where VexFlow actually
 * draws each sign of a key signature, in every clef the engine supports (docs/question-types-2.md 1.2).
 * The engine may not import VexFlow, so the check lives here on the stave side.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { engines } from '../fixtures';
import { keySpec } from '../notation/to-vexflow';
import { installStaveStubs } from '../test-utils';
import { loadVexFlow } from '../vexflow-loader';
import type { Clef, Key } from '@/engine/types';

beforeAll(() => installStaveStubs());

const CLEFS: Clef[] = ['treble', 'bass', 'alto', 'tenor'];
const SHARP = 0xe262;
const FLAT = 0xe260;

/** Draw clef and key signature and read back each sign: kind, and stave position from its baseline y. */
async function drawnSigns(clef: Clef, signature: number): Promise<{ sign: 1 | -1 | 0; position: number; x: number }[]> {
  const vf = await loadVexFlow();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const renderer = new vf.Renderer(host as HTMLDivElement, vf.Renderer.Backends.SVG);
  renderer.resize(500, 200);
  const stave = new vf.Stave(0, 0, 400);
  const key: Key = engines.pitch.keyFromSignature(signature, 'major');
  stave.addClef(clef).addKeySignature(keySpec(engines, key));
  stave.setContext(renderer.getContext()).draw();
  const bottom = stave.getYForLine(4);
  const texts = Array.from(host.querySelectorAll('.vf-keysignature text'));
  const out = texts.map((t) => {
    const code = (t.textContent ?? '').codePointAt(0);
    return {
      sign: (code === SHARP ? 1 : code === FLAT ? -1 : 0) as 1 | -1 | 0,
      position: (bottom - Number(t.getAttribute('y'))) / 5,
      x: Number(t.getAttribute('x')),
    };
  });
  host.remove();
  return out;
}

describe('pitch.keySignaturePositions against VexFlow', () => {
  for (const clef of CLEFS) {
    for (let signature = -7; signature <= 7; signature++) {
      it(`${clef}, ${signature} (${signature === 0 ? 'none' : signature > 0 ? 'sharps' : 'flats'})`, async () => {
        const want = engines.pitch.keySignaturePositions(signature, clef);
        const drawn = await drawnSigns(clef, signature);
        expect(want).toHaveLength(Math.abs(signature));
        expect(drawn.map((d) => d.position)).toEqual(want);
        // Kind of sign (when the stubbed glyph text carries it) and left-to-right order.
        if (signature !== 0) expect(drawn.every((d) => d.sign === (signature > 0 ? 1 : -1))).toBe(true);
        for (const d of drawn) if (d.sign !== 0) expect(d.sign).toBe(signature > 0 ? 1 : -1);
        expect(drawn.map((d) => d.x)).toEqual([...drawn.map((d) => d.x)].sort((a, b) => a - b));
      });
    }
  }
});
