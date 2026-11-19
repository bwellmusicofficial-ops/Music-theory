import { describe, expect, it } from 'vitest';
import { listLessons, loadGlossary } from '@/content/load';
import { questionTypes } from '@/lesson/questions';
import { buildLandingDemoContent } from './content';

const lessons = listLessons();
const glossary = loadGlossary('start');

describe('landing demo content', () => {
  const content = buildLandingDemoContent(lessons, glossary);

  it('takes both questions from existing Start here lessons', () => {
    expect(content.sources).toHaveLength(2);
    for (const id of content.sources) {
      const lesson = lessons.find((l) => l.id === id);
      expect(lesson, id).toBeDefined();
      expect(lesson!.grade).toBe('start');
    }
  });

  it('has payloads that pass their question type schema', () => {
    for (const step of content.steps) {
      const mod = questionTypes[step.type];
      expect(mod, step.type).toBeDefined();
      const parsed = mod!.payloadSchema.safeParse(step.payload);
      expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
    }
  });

  it('asks which clip sounds higher (two clips, by ear), then one bar of pulse taps', () => {
    const [higher, pulse] = content.steps;
    expect(higher.type).toBe('by-ear');
    expect(higher.prompt).toBe('Which clip sounds higher?');
    expect((higher.payload as { clips: unknown[] }).clips).toHaveLength(2);
    expect(higher.rightReason).toBe('Yes, that one is higher.');
    expect(pulse.type).toBe('tap-rhythm');
    const payload = pulse.payload as { bars: unknown[]; listenFirst: boolean; showNotation: boolean };
    expect(payload.bars).toHaveLength(1);
    expect(payload.listenFirst).toBe(false);
    expect(payload.showNotation).toBe(true);
  });

  it('is the same every time it is built, and survives JSON (it crosses from server to client)', () => {
    expect(buildLandingDemoContent(lessons, glossary)).toEqual(content);
    expect(JSON.parse(JSON.stringify(content))).toEqual(content);
  });

  it('ships no more glossary than its text links to (none today: the demo wording is the same in UK and US)', () => {
    expect(content.glossary).toEqual([]);
  });

  it('fails loudly when a source question is missing', () => {
    expect(() => buildLandingDemoContent(lessons.filter((l) => l.id !== 'start-rhythm-01-find-the-pulse'))).toThrow(/not found/);
  });
});
