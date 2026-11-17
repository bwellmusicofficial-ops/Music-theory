// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { engines } from '../fixtures';
import { installStaveStubs } from '../test-utils';
import { loadVexFlow } from '../vexflow-loader';
import { handPassages, lessonPassages } from './baseline-passages';
import { draw } from './draw';

beforeAll(() => installStaveStubs());

const FILE = join(__dirname, 'layout-baseline.json');
const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);

const cases = [...handPassages(), ...lessonPassages(24)];
const configs = [
  { name: 'md-340', scale: 1.25, availablePx: 340, edit: false },
  { name: 'md-700', scale: 1.25, availablePx: 700, edit: false },
  { name: 'lg-edit-400', scale: 1.5, availablePx: 400, edit: true },
] as const;

async function snapshot() {
  const vf = await loadVexFlow();
  const out: Record<string, { w: number; h: number; systems: string; model: string; svg: string }> = {};
  for (const c of cases) {
    for (const cfg of configs) {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const r = draw({
        vf, host, engines, passage: c.passage, uid: 'b1', scale: cfg.scale, availablePx: cfg.availablePx, edit: cfg.edit,
        editableBars: c.passage.bars.map(() => cfg.edit), range: { min: -6, max: 14 },
        show: { clef: true, keySignature: true, timeSignature: true, finalBarline: true },
      });
      out[`${c.id} @ ${cfg.name}`] = {
        w: r.model.width,
        h: r.model.height,
        systems: r.model.systems.map((s) => `${s.top}/${s.height}`).join(','),
        model: sha(JSON.stringify(r.model)),
        svg: sha(host.innerHTML),
      };
      host.remove();
    }
  }
  return out;
}

describe('layout without expression is unchanged', () => {
  it('has real lesson passages in the set', () => {
    expect(lessonPassages(24).length).toBeGreaterThanOrEqual(20);
  });
  it('matches the baseline recorded before expression drawing existed (height, layout model and SVG markup)', async () => {
    const now = await snapshot();
    if (process.env.RECORD_LAYOUT_BASELINE === '1' || !existsSync(FILE)) {
      writeFileSync(FILE, JSON.stringify(now, null, 1) + '\n');
      return;
    }
    const before = JSON.parse(readFileSync(FILE, 'utf8')) as typeof now;
    expect(Object.keys(now)).toEqual(Object.keys(before));
    for (const k of Object.keys(before)) expect(now[k], k).toEqual(before[k]);
  }, 120_000);
});
