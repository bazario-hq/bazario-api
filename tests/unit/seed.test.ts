import { describe, expect, it } from 'vitest';
import { needsModeration } from '../../src/lib/moderation.js';
import { imagePool } from '../../src/seed/images.js';
import { Rng, WeightedSampler } from '../../src/seed/random.js';
import { ALL_HELD_SENTENCES, ALL_REVIEW_SENTENCES, productDescription, reviewText } from '../../src/seed/text.js';
import { DAY_MS, seasonalFactor, Timeline } from '../../src/seed/timeline.js';

describe('seed generator', () => {
  it('is deterministic per seed and stream', () => {
    const a = new Rng(42, 'orders');
    const b = new Rng(42, 'orders');
    const c = new Rng(42, 'reviews');
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(seqA);
  });

  it('samples in proportion to weights', () => {
    const rng = new Rng(1, 'weights');
    const sampler = new WeightedSampler([1, 0, 3]);
    const counts = [0, 0, 0];
    for (let i = 0; i < 20_000; i++) counts[sampler.sample(rng)]++;
    expect(counts[1]).toBe(0);
    expect(counts[2] / counts[0]).toBeGreaterThan(2.7);
    expect(counts[2] / counts[0]).toBeLessThan(3.3);
  });

  it('samples order times inside the window, with more recent days busier', () => {
    const end = Date.UTC(2026, 5, 30);
    const start = end - 365 * DAY_MS;
    const timeline = new Timeline(start, end, 10);
    const times = timeline.sampleSorted(new Rng(5, 'timeline'), 5_000);
    expect(times[0]).toBeGreaterThanOrEqual(start);
    expect(times[times.length - 1]).toBeLessThanOrEqual(end);
    const lastQuarter = times.filter((t) => t > end - 91 * DAY_MS).length;
    expect(lastQuarter / times.length).toBeGreaterThan(0.4);
  });

  it('boosts the holiday season and Black Friday', () => {
    expect(seasonalFactor(Date.UTC(2025, 10, 28))).toBeGreaterThan(4);
    expect(seasonalFactor(Date.UTC(2025, 5, 11))).toBeLessThan(1.2);
  });
});
