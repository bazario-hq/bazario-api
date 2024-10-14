import crypto from 'node:crypto';
import type { ShippingAddress } from '../../db/types.js';

export interface QuoteItem {
  productId: number;
  sellerId: number;
  name: string;
  unitPriceCents: number;
  quantity: number;
}

export interface Quote {
  id: string;
  userId: number;
  items: QuoteItem[];
  shippingAddress: ShippingAddress;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  expiresAt: number;
}

const QUOTE_TTL_MS = 15 * 60 * 1000;
const quotes = new Map<string, Quote>();

function purgeExpired() {
  const now = Date.now();
  for (const [id, quote] of quotes) {
    if (quote.expiresAt <= now) quotes.delete(id);
  }
}

export const quoteStore = {
  create(data: Omit<Quote, 'id' | 'expiresAt'>): Quote {
    purgeExpired();
    const quote = { ...data, id: crypto.randomUUID(), expiresAt: Date.now() + QUOTE_TTL_MS };
    quotes.set(quote.id, quote);
    return quote;
  },

  get(id: string): Quote | undefined {
    const quote = quotes.get(id);
    if (quote && quote.expiresAt <= Date.now()) {
      quotes.delete(id);
      return undefined;
    }
    return quote;
  },

  delete(id: string) {
    quotes.delete(id);
  },
};
