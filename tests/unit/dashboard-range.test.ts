import { describe, expect, it } from 'vitest';
import { rangeFor } from '../../src/modules/seller/seller-dashboard.service.js';

describe('dashboard ranges', () => {
  const now = new Date('2026-03-15T18:30:00Z');

  it('covers the last N days including today, with an equal previous period', () => {
    expect(rangeFor('7d', now)).toEqual({ from: '2026-03-09', to: '2026-03-15', prevFrom: '2026-03-02', prevTo: '2026-03-08', days: 7 });
  });

  it('handles month to date', () => {
    expect(rangeFor('mtd', now)).toEqual({ from: '2026-03-01', to: '2026-03-15', prevFrom: '2026-02-14', prevTo: '2026-02-28', days: 15 });
  });

  it('crosses month boundaries', () => {
    expect(rangeFor('30d', now).from).toBe('2026-02-14');
  });
});
