import { describe, expect, it } from 'vitest';
import { feeFor, formatCents, shippingFor } from '../../src/lib/money.js';

describe('money', () => {
  it('charges flat shipping below the free shipping threshold', () => {
    expect(shippingFor(0)).toBe(0);
    expect(shippingFor(7499)).toBe(599);
    expect(shippingFor(7500)).toBe(0);
  });

  it('formats cents as dollars', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(5)).toBe('$0.05');
  });

  it('rounds platform fees to the nearest cent', () => {
    expect(feeFor(10000, 10)).toBe(1000);
    expect(feeFor(1255, 10)).toBe(126);
    expect(feeFor(0, 10)).toBe(0);
  });
});
