// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { engines } from '../fixtures';
import { installStaveStubs } from '../test-utils';
import { loadVexFlow } from '../vexflow-loader';
import { allLessonPassages, handPassages, lessonPassages } from './baseline-passages';
import { draw } from './draw';

beforeAll(() => installStaveStubs());

const FILE = join(__dirname, 'layout-baseline.json');
const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);

const RECORD = process.env.RECORD_LAYOUT_BASELINE === '1' || !existsSync(FILE);
const recorded: Record<string, unknown> = RECORD ? {} : JSON.parse(readFileSync(FILE, 'utf8'));
const recordedIds = new Set(Object.keys(recorded).map((k) => k.split(' @ ')[0]));
// When checking, render exactly the lesson passages the baseline recorded (by id), so adding or removing
// content elsewhere does not shift the sample. A recorded passage whose lesson was since deleted or rewritten
// is skipped; the test still requires at least 20 real lesson passages to be compared.
const lessonCases = RECORD
  ? lessonPassages(24)
  : allLessonPassages().filter((c) => recordedIds.has(c.id) && sameSource(c.id, c.passage));
const cases = [...handPassages(), ...lessonCases];

/** A recorded lesson passage still counts only if the passage itself is unchanged since recording. */
function sameSource(id: string, passage: unknown): boolean {
  const entry = recorded[`${id} @ md-340`] as { src?: string } | undefined;
  return entry?.src === undefined || entry.src === sha(JSON.stringify(passage));
}
const configs = [
  { name: 'md-340', scale: 1.25, availablePx: 340, edit: false },
  { name: 'md-700', scale: 1.25, availablePx: 700, edit: false },
  { name: 'lg-edit-400', scale: 1.5, availablePx: 400, edit: true },
] as const;

async function snapshot() {
  const vf = await loadVexFlow();
  const out: Record<string, { src: string; w: number; h: number; systems: string; model: string; svg: string }> = {};
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
        src: sha(JSON.stringify(c.passage)),
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
    expect(lessonCases.length).toBeGreaterThanOrEqual(20);
  });
  it('matches the baseline recorded before expression drawing existed (height, layout model and SVG markup)', async () => {
    const now = await snapshot();
    if (process.env.RECORD_LAYOUT_BASELINE === '1' || !existsSync(FILE)) {
      writeFileSync(FILE, JSON.stringify(now, null, 1) + '\n');
      return;
    }
    const before = recorded as typeof now;
    for (const k of Object.keys(now)) {
      expect(before[k], `${k} missing from baseline`).toBeDefined();
      expect({ ...now[k], src: undefined }, k).toEqual({ ...before[k], src: undefined });
    }
  }, 120_000);
});
