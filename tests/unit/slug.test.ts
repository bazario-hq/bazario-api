import { describe, expect, it } from 'vitest';
import { slugify, uniqueSuffix } from '../../src/lib/slug.js';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Handwoven Rug — Large (Blue)')).toBe('handwoven-rug-large-blue');
  });

  it('trims leading and trailing separators and limits length', () => {
    expect(slugify('  --hello--  ')).toBe('hello');
    expect(slugify('x'.repeat(200))).toHaveLength(80);
  });

  it('generates short random suffixes', () => {
    expect(uniqueSuffix()).toMatch(/^[a-z0-9]{1,6}$/);
  });
});
