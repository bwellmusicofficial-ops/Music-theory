import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { questionTypes } from '@/lesson/questions';
import { generators } from './index';
import { quickReferenceRows } from './shared/quick-reference';
import { collectTexts, wrongAnswers } from './shared/test-kit';

/**
 * A UK term with a US equivalent must be a glossary link (`[[stave|stave]]`) so the
 * renderer can swap it for US learners. Written as plain text it never swaps.
 */
const UK_WORDS = /\b(stave|staves|bars?|crotchets?|minims?|semibreves?|quavers?|semiquavers?|tones?|semitones?)\b/i;

/** Text with glossary links removed ("bar line" is the same in both terminologies, so it is allowed). */
function unlinkedUkWords(text: string): string | null {
  const bare = text
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .replace(/\bbar[- ]lines?\b/gi, ' ');
  return UK_WORDS.exec(bare)?.[0] ?? null;
}

describe('unlinked UK terms: generated text', () => {
  it('finds the word when it is plain and not when it is linked', () => {
    expect(unlinkedUkWords('Notes on the stave')).toBe('stave');
    expect(unlinkedUkWords('Notes on the [[stave|stave]] and a [[bar-line|bar line]]')).toBeNull();
    expect(unlinkedUkWords('A [[tone|tone]] is a step, a semitone is half')).toBe('semitone');
  });

  for (const row of quickReferenceRows()) {
    it(`${row.example.id} ${JSON.stringify(row.example.params).slice(0, 50)}: prompts, texts and marking reasons`, () => {
      const generator = generators[row.example.id]!;
      const params = generator.paramsSchema.parse(row.example.params);
      const found: string[] = [];
      for (let seed = 0; seed < 12; seed += 1) {
        for (const terminology of ['uk', 'us'] as const) {
          const out = generator.generate(params, createRng(seed), terminology);
          const texts = collectTexts(out);
          const payload = out.payload as Record<string, unknown>;
          const mod = questionTypes[out.type as keyof typeof questionTypes]!;
          for (const w of wrongAnswers(out.type, payload)) {
            const reason = mod.mark(payload as never, w.answer as never).reason;
            if (reason) texts.push(reason);
          }
          for (const text of texts) {
            const word = unlinkedUkWords(text);
            if (word) found.push(`${row.example.id}#${seed}/${terminology}: "${word}" in "${text}"`);
          }
        }
      }
      expect([...new Set(found)].slice(0, 5)).toEqual([]);
    });
  }
});

/** Source files that hold marking reason templates. */
function reasonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return reasonFiles(path);
    const isTemplate = /^(mark|reason|reason-helpers|position-reason)\.ts$/.test(name);
    return isTemplate ? [path] : [];
  });
}

describe('unlinked UK terms: reason templates', () => {
  const root = join(process.cwd(), 'src/lesson/questions');
  const files = reasonFiles(root);

  it('finds the template files', () => {
    expect(files.length).toBeGreaterThan(8);
  });

  for (const file of files) {
    it(`${file.slice(root.length + 1)} writes UK terms as glossary links`, () => {
      const found: string[] = [];
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          const code = line.trim();
          // Comments, thrown developer errors and test-only text are not shown to learners.
          if (/^(\/\/|\*|\/\*)/.test(code) || /\b(TheoryError|new Error|throw )/.test(code)) return;
          for (const literal of code.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)) {
            const text = literal[2]!.replace(/\$\{[^}]*\}/g, ' ');
            // A single word is a code value ('bar' in `select === 'bar'`), not a sentence.
            if (!/\s/.test(text.trim())) continue;
            const word = unlinkedUkWords(text);
            if (word) found.push(`line ${index + 1}: "${word}" in ${literal[0]}`);
          }
        });
      expect(found).toEqual([]);
    });
  }
});
