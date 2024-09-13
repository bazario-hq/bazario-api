import { describe, expect, it } from 'vitest';
import { offsetFor, pageMeta } from '../../src/lib/pagination.js';

describe('pagination helpers', () => {
  it('computes page counts', () => {
    expect(pageMeta(1, 20, 0)).toEqual({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
    expect(pageMeta(2, 20, 41)).toEqual({ page: 2, pageSize: 20, total: 41, totalPages: 3 });
  });

  it('computes offsets', () => {
    expect(offsetFor(1, 20)).toBe(0);
    expect(offsetFor(3, 25)).toBe(50);
  });
});
