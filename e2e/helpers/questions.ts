import { expect, type Locator, type Page } from '@playwright/test';
import { pitch } from '@/engine/pitch';
import type { Passage, Pitch } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { mark as markCompleteBar } from '@/lesson/questions/complete-bar/mark';
import { mark as markFindInPassage } from '@/lesson/questions/find-in-passage/mark';
import { beamGaps, groupsOf, joinsOf } from '@/lesson/questions/fix-beaming/beams';
import { mark as markFixBeaming } from '@/lesson/questions/fix-beaming/mark';
import { mark as markByEar } from '@/lesson/questions/by-ear/mark';
import { mark as markMatchUp } from '@/lesson/questions/match-up/mark';
import { mark as markMultipleChoice } from '@/lesson/questions/multiple-choice/mark';
import { mark as markNoteOnStave } from '@/lesson/questions/note-on-stave/mark';
import { mark as markOrdering } from '@/lesson/questions/ordering/mark';
import { mark as markPlaceBarLines } from '@/lesson/questions/place-bar-lines/mark';
import { mark as markPlayKeyboard } from '@/lesson/questions/play-keyboard/mark';
import { mark as markSpotMistake } from '@/lesson/questions/spot-mistake/mark';
import { mark as markWriteKeySignature } from '@/lesson/questions/write-key-signature/mark';
import { rhythm } from '@/engine/rhythm';
import { stripRichText } from '@/lesson/player/rich-text';
import { expectGlyphDrawn, expectKeyboardDrawn, expectNotationDrawn } from './notation';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Payload = any;

export const QUESTION_TYPES = ['note-on-stave', 'play-keyboard', 'tap-rhythm', 'by-ear', 'complete-bar', 'spot-mistake', 'ordering', 'multiple-choice', 'match-up', 'place-bar-lines', 'fix-beaming', 'write-key-signature', 'find-in-passage'] as const;
/** Types whose correct and wrong answers can be derived from the payload and driven through the UI. */
export const ANSWERABLE = new Set(['multiple-choice', 'match-up', 'ordering', 'play-keyboard', 'spot-mistake', 'note-on-stave', 'place-bar-lines', 'fix-beaming', 'write-key-signature', 'find-in-passage']);

interface Face {
  kind: 'text' | 'glyph' | 'passage';
}

/** Every Face that the payload puts on screen (options, items, pairs). */
export function facesOf(type: string, p: Payload): Face[] {
  switch (type) {
    case 'multiple-choice':
    case 'by-ear':
      return p.options.map((o: { face: Face }) => o.face);
    case 'ordering':
      return p.items.map((o: { face: Face }) => o.face);
    case 'match-up':
      return [...p.left.map((o: { face: Face }) => o.face), ...p.right.map((o: { face: Face }) => o.face)];
    default:
      return [];
  }
}

/** How many staves the payload should put on screen. */
export function expectedStaves(type: string, p: Payload): number {
  const faces = facesOf(type, p).filter((f) => f.kind === 'passage').length;
  switch (type) {
    case 'multiple-choice':
      return faces + (p.exhibit?.kind === 'passage' ? 1 : 0);
    case 'play-keyboard':
      return p.passage ? 1 : 0;
    case 'tap-rhythm':
      return p.showNotation ? 1 : 0;
    case 'complete-bar':
    case 'spot-mistake':
    case 'note-on-stave':
    case 'place-bar-lines':
    case 'fix-beaming':
    case 'write-key-signature':
    case 'find-in-passage':
      return 1;
    default:
      return faces;
  }
}

/** Asserts everything the payload promises to show has been drawn. `root` holds one question. */
export async function expectQuestionRendered(root: Locator, type: string, p: Payload, prompt?: string): Promise<void> {
  await expect(root.locator('[data-testid="question-error"]'), 'the developer error card is showing').toHaveCount(0);
  await expect(root.getByText('Developer error')).toHaveCount(0);
  if (prompt) {
    const heading = root.locator('h1, h2').first();
    await expect(heading).toBeVisible();
    const text = (await heading.innerText()).replace(/\s+/g, ' ').trim();
    expect(text.length, 'prompt is empty').toBeGreaterThan(0);
    // The shown prompt is the authored text minus markers (UK terms: the harness and the tests use the default).
    expect(text.replace(/^.*?\n/, '')).toContain(stripRichText(prompt).replace(/\s+/g, ' ').trim().slice(0, 25));
  }
  const staves = expectedStaves(type, p);
  if (staves > 0) await expectNotationDrawn(root, staves);
  if (p.exhibit?.kind === 'keyboard') await expectKeyboardDrawn(root.locator('[data-question-exhibit]'));
  const faces = facesOf(type, p);
  const passageFaces = root.locator('[data-face="passage"]');
  await expect(passageFaces, 'passage faces drawn').toHaveCount(faces.filter((f) => f.kind === 'passage').length);
  const glyphFaces = root.locator('[data-face="glyph"]');
  const glyphCount = faces.filter((f) => f.kind === 'glyph').length;
  await expect(glyphFaces, 'glyph faces drawn').toHaveCount(glyphCount);
  for (let i = 0; i < glyphCount; i++) await expectGlyphDrawn(glyphFaces.nth(i));
  if (type === 'play-keyboard') await expectKeyboardDrawn(root);
}

// --- deriving answers ---------------------------------------------------------------------

export type How = 'correct' | 'wrong';

interface Plan {
  answer: unknown;
  mark: MarkResult;
  /** Drives the UI to produce the answer. */
  perform: (page: Page, root: Locator) => Promise<void>;
}

const midi = (p: Pitch) => pitch.toMidi(p);

const SHARP_NAMES: [Pitch['letter'], 0 | 1][] = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]];
/** The pitch a keyboard key reports: black keys as sharps. */
function fromMidi(m: number): Pitch {
  const [letter, accidental] = SHARP_NAMES[((m % 12) + 12) % 12];
  return { letter, accidental, octave: Math.floor(m / 12) - 1 };
}

function keyButton(root: Locator, p: Pitch | number): Locator {
  return root.locator(`button[data-midi="${typeof p === 'number' ? p : midi(p)}"]`);
}

async function pressKey(root: Locator, m: number): Promise<void> {
  const key = keyButton(root, m);
  await key.scrollIntoViewIfNeeded();
  await key.click();
}

/** Presses Check when the question has one (a mock test saves answers as they change and hides it). */
async function clickCheck(root: Locator): Promise<void> {
  const check = root.getByRole('button', { name: 'Check', exact: true });
  if ((await check.count()) > 0) await check.click();
}

type Glyph = import('@/lesson/questions/shared').Glyph;

/** Finds symbols from the palette that fill the bar, by trying combinations against the real marking. */
export function findFill(p: Payload): Glyph[] | null {
  const palette: Glyph[] = p.palette;
  const lengths = p.count !== undefined ? [p.count as number] : [1, 2, 3, 4, 5, 6];
  const search = (prefix: Glyph[], left: number): Glyph[] | null => {
    if (left === 0) {
      try {
        return markCompleteBar(p, { added: prefix }).correct ? prefix : null;
      } catch {
        return null;
      }
    }
    for (const g of palette) {
      const found = search([...prefix, g], left - 1);
      if (found) return found;
    }
    return null;
  };
  for (const n of lengths) {
    const found = search([], n);
    if (found) return found;
  }
  return null;
}

/** Adds symbols to the bar with the palette: choose the value (and rest or dot), then "Add note". */
export async function fillBar(root: Locator, glyphs: Glyph[]): Promise<void> {
  for (const g of glyphs) {
    const rest = root.getByRole('button', { name: 'Rest', exact: true });
    if ((await rest.count()) > 0 && ((await rest.getAttribute('aria-pressed')) === 'true') !== (g.kind === 'rest')) await rest.click();
    await root.locator('.mtn-stave__palette').getByRole('button', { name: new RegExp(`^${g.duration.value}`, 'i') }).first().click();
    const dot = root.getByRole('button', { name: 'Dot', exact: true });
    if ((await dot.count()) > 0 && ((await dot.getAttribute('aria-pressed')) === 'true') !== g.duration.dots > 0) await dot.click();
    await root.getByRole('button', { name: 'Add note', exact: true }).click();
  }
}

/** Taps a key-signature stave at a stave position (0 = bottom line), using where the staff lines are drawn. */
export async function tapStavePosition(page: Page, root: Locator, position: number): Promise<void> {
  const stave = root.locator('.mtn-stave').first();
  const ys = await stave.locator('.mtn-stave__notation .vf-stave path').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2));
  const bottom = Math.max(...ys);
  const top = Math.min(...ys);
  const box = (await stave.locator('.mtn-stave__notation svg').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.55, bottom - (position * (bottom - top)) / 8);
}

/** The answer for `how`, with its expected marking, or null when the payload has no wrong answer to give. */
export function plan(type: string, p: Payload, how: How): Plan | null {
  switch (type) {
    case 'multiple-choice':
    case 'by-ear': {
      const index = how === 'correct' ? p.options.findIndex((o: any) => o.id === p.correct) : p.options.findIndex((o: any) => o.id !== p.correct);
      if (index < 0) return null;
      const answer = { optionId: p.options[index].id };
      return {
        answer,
        mark: (type === 'by-ear' ? markByEar : markMultipleChoice)(p, answer),
        perform: async (_page, root) => {
          await root.locator('ul[aria-label="Answer options"] > li').nth(index).locator('button').click();
        },
      };
    }
    case 'match-up': {
      const pairs: Record<string, string> = Object.fromEntries(p.left.map((l: any) => [l.id, l.match]));
      if (how === 'wrong') {
        if (p.left.length < 2 || p.left[0].match === p.left[1].match) return null;
        pairs[p.left[0].id] = p.left[1].match;
        pairs[p.left[1].id] = p.left[0].match;
      }
      const answer = { pairs };
      return {
        answer,
        mark: markMatchUp(p, answer),
        perform: async (_page, root) => {
          for (let i = 0; i < p.left.length; i++) {
            const rightIndex = p.right.findIndex((r: any) => r.id === pairs[p.left[i].id]);
            await root.locator('ul[aria-label="Left items"] > li').nth(i).locator('button').click();
            await root.locator('ul[aria-label="Right items"] > li').nth(rightIndex).locator('button').click();
          }
          await clickCheck(root);
        },
      };
    }
    case 'ordering': {
      const target: string[] = [...p.correctOrder];
      if (how === 'wrong') {
        if (target.length < 2) return null;
        [target[0], target[1]] = [target[1], target[0]];
      }
      const answer = { order: target };
      return {
        answer,
        mark: markOrdering(p, answer),
        perform: async (_page, root) => {
          const current: string[] = p.items.map((i: any) => i.id);
          const rows = root.locator('ol[aria-label="Items to put in order"] > li');
          for (let t = 0; t < target.length; t++) {
            let at = current.indexOf(target[t]);
            while (at > t) {
              await rows.nth(at).getByRole('button', { name: /^Move .* up$/ }).click();
              [current[at - 1], current[at]] = [current[at], current[at - 1]];
              at -= 1;
            }
          }
          if (JSON.stringify(current) === JSON.stringify(p.items.map((i: any) => i.id))) {
            // Nothing moved: the learner says the starting order is right. In a lesson this
            // answers at once; in a mock test it saves the order as the answer.
            await root.getByRole('button', { name: 'This order is correct', exact: true }).click();
            return;
          }
          await clickCheck(root);
        },
      };
    }
    case 'spot-mistake': {
      const passage: Passage = p.passage;
      const m = p.mistake as { bar: number; event?: number };
      let target: { bar: number; event: number };
      if (how === 'correct') target = { bar: m.bar, event: m.event ?? 0 };
      else {
        const other = passage.bars.flatMap((b, bar) => b.events.map((_, event) => ({ bar, event }))).find((e) => (p.select === 'bar' ? e.bar !== m.bar : e.bar !== m.bar || e.event !== m.event));
        if (!other) return null;
        target = other;
      }
      const answer = p.select === 'bar' ? { bar: target.bar } : { bar: target.bar, event: target.event };
      const flat = passage.bars.flatMap((b, bar) => b.events.map((_, event) => ({ bar, event })));
      const index = flat.findIndex((e) => e.bar === target.bar && e.event === target.event);
      return {
        answer,
        mark: markSpotMistake(p, answer),
        perform: async (_page, root) => {
          await root.locator('.mtn-stave__event-button').nth(index).click();
          await clickCheck(root);
        },
      };
    }
    case 'play-keyboard': {
      const targets: Pitch[] = p.targets;
      let played: Pitch[] = targets;
      if (how === 'wrong') {
        const lowM = midi(p.low);
        const highM = midi(p.high);
        const targetMidis = new Set(targets.map(midi));
        if (p.mode === 'sequence') {
          // Every key is one semitone off, so the first note is already wrong.
          played = targets.map((t) => fromMidi(midi(t) + (midi(t) + 1 <= highM ? 1 : -1)));
        } else {
          let found: number | null = null;
          for (let m = lowM; m <= highM; m++) if (!targetMidis.has(m) && !targets.some((t) => pitch.chroma(t) === ((m % 12) + 12) % 12)) found = m;
          if (found === null) return null;
          played = [fromMidi(found)];
        }
      }
      const answer = { played };
      return {
        answer,
        mark: markPlayKeyboard(p, answer),
        perform: async (_page, root) => {
          for (const note of played) await pressKey(root, midi(note));
          if (p.mode === 'together') await clickCheck(root);
        },
      };
    }
    case 'complete-bar': {
      const glyphs = how === 'correct' ? findFill(p) : null;
      if (!glyphs) return null;
      const answer = { added: glyphs };
      return {
        answer,
        mark: markCompleteBar(p, answer),
        perform: async (_page, root) => {
          await fillBar(root, glyphs);
          await clickCheck(root);
        },
      };
    }
    case 'note-on-stave': {
      if (p.mode !== 'identify') return null;
      const shown = p.pitch as Pitch;
      const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
      const name = how === 'correct' ? { letter: shown.letter, accidental: shown.accidental } : { letter: letters[(letters.indexOf(shown.letter) + 1) % 7], accidental: 0 };
      const answer = { mode: 'identify', name };
      return {
        answer,
        mark: markNoteOnStave(p, answer as never),
        perform: async (_page, root) => {
          if (p.accidentals) {
            const label = { [-1]: 'Flat', 0: 'Natural', 1: 'Sharp' }[name.accidental as -1 | 0 | 1];
            await root.getByRole('group', { name: 'Sign' }).getByRole('button', { name: label, exact: true }).click();
          }
          await root.getByRole('group', { name: 'Note name' }).getByRole('button', { name: name.letter, exact: true }).click();
        },
      };
    }
    case 'place-bar-lines': {
      const passage: Passage = p.passage;
      const sizes = passage.bars.map((b) => b.events.length);
      const total = sizes.reduce((a, b) => a + b, 0);
      const rightAfter = sizes.slice(0, -1).map((_, i) => sizes.slice(0, i + 1).reduce((a, b) => a + b, 0) - 1);
      let after = rightAfter;
      if (how === 'wrong') {
        const tries = [[0], [1], [total - 2], [0, 1], rightAfter.map((x) => x + 1), rightAfter.map((x) => x - 1)];
        const found = tries.find((t) => t.every((x) => x >= 0 && x <= total - 2) && t.length > 0 && !markPlaceBarLines(p, { after: t }).correct);
        if (!found) return null;
        after = found;
      }
      const answer = { after };
      return {
        answer,
        mark: markPlaceBarLines(p, answer),
        perform: async (_page, root) => {
          // The passage is drawn again after each bar line, so each gap button is looked up afresh.
          for (const i of after) {
            await root.getByRole('button', { name: new RegExp(`^Bar line after (note|rest) ${i + 1}$`) }).click();
            await expect(root.getByRole('button', { name: new RegExp(`^Bar line after (note|rest) ${i + 1}$`) })).toHaveAttribute('aria-pressed', 'true');
          }
          await clickCheck(root);
        },
      };
    }
    case 'fix-beaming': {
      const passage: Passage = p.passage;
      const bar = passage.bars[p.barIndex];
      const standard = groupsOf(joinsOf(bar, rhythm.beamGroups(bar, passage.time)));
      const gaps = beamGaps(bar);
      let beams = standard;
      if (how === 'wrong') {
        const flipped = joinsOf(bar, standard).map((j, i) => (i === gaps[0] ? !j : j));
        beams = groupsOf(flipped);
      }
      const answer = { beams };
      const want = joinsOf(bar, beams);
      const start = joinsOf(bar, bar.beams ?? []);
      return {
        answer,
        mark: markFixBeaming(p, answer),
        perform: async (_page, root) => {
          for (const i of gaps) {
            if (want[i] === start[i]) continue;
            const gap = root.getByRole('button', { name: `Join note ${i + 1} and note ${i + 2}`, exact: true });
            await gap.click();
            await expect(gap).toHaveAttribute('aria-pressed', String(want[i]));
          }
          await clickCheck(root);
        },
      };
    }
    case 'write-key-signature': {
      const signature = pitch.keySignature(p.key);
      const kind = signature > 0 ? 1 : -1;
      const positions = pitch.keySignaturePositions(signature, p.clef);
      const placed = how === 'correct' ? kind : -kind;
      const answer = { signs: positions.map((position) => ({ sign: placed, position })) };
      return {
        answer,
        mark: markWriteKeySignature(p, answer as never),
        perform: async (page, root) => {
          const palette = root.getByRole('group', { name: 'Sign to place' });
          await palette.getByRole('button', { name: placed === 1 ? 'Sharp' : 'Flat', exact: true }).click();
          for (const position of positions) await tapStavePosition(page, root, position);
          await expect(root.locator('.vf-keysignature text')).toHaveCount(positions.length);
          await clickCheck(root);
        },
      };
    }
    case 'find-in-passage': {
      const passage: Passage = p.passage;
      const targets: { bar: number; event?: number }[] = p.targets;
      const flat = passage.bars.flatMap((b, bar) => b.events.map((_, event) => ({ bar, event })));
      const isTarget = (x: { bar: number; event: number }) => targets.some((t) => t.bar === x.bar && (p.select === 'bar' || t.event === x.event));
      let chosen: { bar: number; event?: number }[] = targets;
      if (how === 'wrong') {
        const others = p.select === 'bar' ? [...new Set(flat.filter((x) => !isTarget(x)).map((x) => x.bar))].map((bar) => ({ bar })) : flat.filter((x) => !isTarget(x));
        if (others.length < targets.length) return null;
        chosen = others.slice(0, targets.length);
      }
      const answer = { chosen };
      return {
        answer,
        mark: markFindInPassage(p, answer),
        perform: async (_page, root) => {
          for (const c of chosen) {
            const index = flat.findIndex((x) => x.bar === c.bar && (p.select === 'bar' || x.event === c.event));
            await root.locator('.mtn-stave__event-button').nth(index).click();
          }
          await clickCheck(root);
        },
      };
    }
    default:
      return null;
  }
}

/** The text a learner reads in the feedback banner. */
export function feedback(root: Locator): Locator {
  return root.locator('[role="status"][data-kind]');
}

/** Answers per `how` and asserts the banner: "correct" for a right answer, the specific reason for a wrong one. */
export async function answerAndExpect(page: Page, root: Locator, type: string, p: Payload, how: How): Promise<'done' | 'no-plan'> {
  const pl = plan(type, p, how);
  if (!pl) return 'no-plan';
  await pl.perform(page, root);
  const banner = feedback(root);
  if (how === 'correct') {
    await expect(banner, `a correct ${type} answer was not accepted (mark() says: ${JSON.stringify(pl.mark)})`).toHaveAttribute('data-kind', 'correct');
    await expect(banner).toContainText('Correct');
    expect(pl.mark.correct, 'mark() disagrees with the payload about which answer is right').toBe(true);
  } else {
    await expect(banner, `a wrong ${type} answer was accepted`).toHaveAttribute('data-kind', 'wrong');
    expect(pl.mark.correct).toBe(false);
    const reason = stripRichText(pl.mark.reason ?? '').replace(/\s+/g, ' ').trim();
    expect(reason.length, 'a wrong answer has no reason').toBeGreaterThan(10);
    expect(reason, 'the reason is a generic one').not.toMatch(/^(not quite|incorrect|wrong)\.?$/i);
    await expect(banner.locator('p').nth(1)).toHaveText(reason);
  }
  return 'done';
}
