import { describe, expect, it } from 'vitest';
import { validateExpression } from '@/engine/expression/validate';
import { GALLERY } from './gallery';

describe('expression harness passages', () => {
  it('has unique ids and every passage passes validateExpression', () => {
    expect(new Set(GALLERY.map((g) => g.id)).size).toBe(GALLERY.length);
    for (const g of GALLERY) expect(validateExpression(g.passage), g.id).toEqual([]);
  });
});
