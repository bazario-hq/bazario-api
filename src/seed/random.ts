/**
 * Small deterministic PRNG (sfc32) plus the distributions the generator needs.
 * Every table gets its own stream derived from the run seed, so changing how
 * one table is generated does not reshuffle the others.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number, stream: string) {
    let h = 1779033703 ^ stream.length;
    for (let i = 0; i < stream.length; i++) {
      h = Math.imul(h ^ stream.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    this.a = seed >>> 0;
    this.b = h >>> 0;
    this.c = (seed * 2654435761) >>> 0;
    this.d = (h ^ 0x9e3779b9) >>> 0;
    for (let i = 0; i < 16; i++) this.next();
  }

  /** Uniform float in [0, 1). */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Standard normal via Box-Muller. */
  normal(mean = 0, sd = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  logNormal(mu: number, sigma: number): number {
    return Math.exp(this.normal(mu, sigma));
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  hex(bytes: number): string {
    let s = '';
    for (let i = 0; i < bytes; i++) s += this.int(0, 255).toString(16).padStart(2, '0');
    return s;
  }
}

/** Samples indexes in proportion to a weight array (cumulative sums + binary search). */
export class WeightedSampler {
  private readonly cumulative: Float64Array;
  readonly total: number;

  constructor(weights: ArrayLike<number>) {
    this.cumulative = new Float64Array(weights.length);
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += weights[i];
      this.cumulative[i] = sum;
    }
    this.total = sum;
  }

  sample(rng: Rng): number {
    const target = rng.next() * this.total;
    let lo = 0;
    let hi = this.cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.cumulative[mid] > target) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }
}

/** Zipf-like weights for ranks 1..n: weight(rank) = 1 / rank^s. */
export function zipfWeights(n: number, s: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 1 / Math.pow(i + 1, s);
  return w;
}
