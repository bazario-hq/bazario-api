import { describe, expect, it } from 'vitest';
import { maskBlockedTerms, needsModeration } from '../../src/lib/moderation.js';

describe('moderation', () => {
  it('flags off-platform contact attempts, including spaced-out spellings', () => {
    expect(needsModeration('Message me on WhatsApp')).toBe(true);
    expect(needsModeration('t.e.l.e.g.r.a.m is faster')).toBe(true);
    expect(needsModeration('Lovely colours, fast delivery')).toBe(false);
  });

  it('does not flag terms inside longer words', () => {
    expect(needsModeration('A fakery-free review of this scampi bowl')).toBe(false);
  });

  it('masks blocked terms but keeps the rest of the text', () => {
    expect(maskBlockedTerms('Great! Visit www.example.test for more')).toBe('Great! Visit ***.example.test for more');
    expect(maskBlockedTerms('Nothing to hide here')).toBe('Nothing to hide here');
  });
});
