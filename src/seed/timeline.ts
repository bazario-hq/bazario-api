import { Rng, WeightedSampler } from './random.js';

export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// Share of orders per local hour in Colombo (UTC+05:30): quiet nights, a lunch
// bump and a long evening peak, plus overseas buyers keeping nights non-zero.
const LOCAL_HOUR_WEIGHTS = [
  1.2, 0.8, 0.5, 0.4, 0.4, 0.6, 1.2, 2.2, 3.2, 3.8, 4.2, 4.8, 6.0, 6.2, 4.8, 4.2, 4.0, 4.4, 5.2, 6.4, 7.2, 7.0, 5.4, 2.6,
];
const UTC_OFFSET_MS = 5.5 * HOUR_MS;

/** Fourth Friday of November (Black Friday) for a given year, as a UTC date. */
function blackFriday(year: number) {
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const firstFriday = 1 + ((5 - nov1.getUTCDay() + 7) % 7);
  return Date.UTC(year, 10, firstFriday + 21);
}

/** Relative order volume for a calendar day (UTC midnight timestamp). */
export function seasonalFactor(dayStart: number) {
  const d = new Date(dayStart);
  const month = d.getUTCMonth();
  const date = d.getUTCDate();
  let f = 1;
  const weekday = d.getUTCDay();
  if (weekday === 0 || weekday === 6) f *= 1.15;
  if (date >= 25) f *= 1.08; // payday
  if (month === 0 && date <= 20) f *= 0.8;
  if ((month === 10 && date >= 15) || (month === 11 && date <= 24)) f *= 1.6;
  const bf = blackFriday(d.getUTCFullYear());
  if (dayStart >= bf && dayStart <= bf + 3 * DAY_MS) f *= 3;
  return f;
}

/**
 * Samples timestamps between `start` and `end` with exponential business growth
 * (`growthPerYear` x per 365 days), seasonality and a daily traffic curve.
 */
export class Timeline {
  private readonly days: number[] = [];
  private readonly daySampler: WeightedSampler;
  private readonly hourSampler = new WeightedSampler(LOCAL_HOUR_WEIGHTS);

  constructor(
    readonly start: number,
    readonly end: number,
    growthPerYear: number,
  ) {
    const k = Math.log(growthPerYear) / 365;
    const firstDay = Math.floor(start / DAY_MS) * DAY_MS;
    const weights: number[] = [];
    for (let day = firstDay; day < end; day += DAY_MS) {
      const age = (end - day) / DAY_MS;
      let w = Math.exp(-k * age) * seasonalFactor(day);
      if (day + DAY_MS > end) w *= (end - day) / DAY_MS;
      if (day < start) w *= (day + DAY_MS - start) / DAY_MS;
      this.days.push(day);
      weights.push(w);
    }
    this.daySampler = new WeightedSampler(weights);
  }

  sample(rng: Rng): number {
    for (;;) {
      const day = this.days[this.daySampler.sample(rng)];
      const localHour = this.hourSampler.sample(rng);
      const t = day + localHour * HOUR_MS - UTC_OFFSET_MS + Math.floor(rng.next() * HOUR_MS);
      if (t >= this.start && t <= this.end) return t;
    }
  }

  /** Sorted sample of `n` timestamps. */
  sampleSorted(rng: Rng, n: number): Float64Array {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = this.sample(rng);
    return out.sort();
  }
}
