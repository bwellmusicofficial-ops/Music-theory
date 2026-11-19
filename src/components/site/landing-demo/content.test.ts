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

  it('asks which note sounds higher with a correct option that sits higher, and one bar of pulse taps', () => {
    const [higher, pulse] = content.steps;
    expect(higher.type).toBe('multiple-choice');
    expect(higher.prompt).toMatch(/higher/);
    expect(higher.rightReason.length).toBeGreaterThan(0);
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

  it('ships only the glossary entries its text links to, including stave for the US switch', () => {
    expect(content.glossary.map((g) => g.id)).toContain('stave');
    expect(content.glossary.length).toBeLessThan(5);
    expect(content.glossary.find((g) => g.id === 'stave')?.us).toBe('staff');
  });

  it('fails loudly when a source question is missing', () => {
    expect(() => buildLandingDemoContent(lessons.filter((l) => l.id !== 'start-rhythm-01-find-the-pulse'))).toThrow(/not found/);
  });
});
