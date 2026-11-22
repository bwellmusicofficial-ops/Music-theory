import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUESTION_TYPES } from '@/lesson/schema';
import { createHarness, QUESTION_TYPES_MIGRATION_PATH, type Harness } from './test-harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 60_000);
afterAll(async () => {
  await h?.db.close();
});

describe('0003_question_types', () => {
  it('adds every app question type to the database enum, and is safe to run twice', async () => {
    const sql = readFileSync(QUESTION_TYPES_MIGRATION_PATH, 'utf8');
    await h.db.exec(sql);
    await h.db.exec(sql);
    const r = await h.db.query<{ v: string }>('select unnest(enum_range(null::public.question_type))::text as v');
    expect(new Set(r.rows.map((x) => x.v))).toEqual(new Set(QUESTION_TYPES));
  });
});
