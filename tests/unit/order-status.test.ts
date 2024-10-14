import { describe, expect, it } from 'vitest';
import { deriveOrderStatus } from '../../src/modules/orders/orders.service.js';

describe('deriveOrderStatus', () => {
  it.each([
    [['pending', 'pending'], 'paid'],
    [['shipped', 'pending'], 'partially_shipped'],
    [['shipped', 'delivered'], 'shipped'],
    [['delivered', 'delivered'], 'delivered'],
    [['delivered', 'cancelled'], 'delivered'],
    [['cancelled', 'cancelled'], 'cancelled'],
    [['pending', 'cancelled'], 'paid'],
  ] as const)('%j -> %s', (items, expected) => {
    expect(deriveOrderStatus([...items])).toBe(expected);
  });
});
