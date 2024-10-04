export const SHIPPING_FLAT_CENTS = 599;
export const FREE_SHIPPING_THRESHOLD_CENTS = 7500;

export function shippingFor(subtotalCents: number): number {
  if (subtotalCents === 0) return 0;
  return subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_FLAT_CENTS;
}

export function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

  return Math.round((grossCents * percent) / 100);
}
