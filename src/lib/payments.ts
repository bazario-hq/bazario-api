import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from '../config.js';
import { HttpError } from './errors.js';

// Mock payment provider. Behaves like a hosted card API: one network round trip
// per call, test card numbers decide the outcome.
export const DECLINED_CARD = '4000000000000002';

export interface CardDetails {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
}

export interface Charge {
  ref: string;
  last4: string;
  amountCents: number;
}

export async function chargeCard(amountCents: number, card: CardDetails): Promise<Charge> {
  await sleep(config.PAYMENT_LATENCY_MS);
  const number = card.number.replace(/\s+/g, '');
  if (number === DECLINED_CARD) {
    throw new HttpError(402, 'payment_declined', 'Your card was declined');
  }
  return { ref: `ch_${crypto.randomBytes(12).toString('hex')}`, last4: number.slice(-4), amountCents };
}
