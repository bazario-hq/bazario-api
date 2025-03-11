import { Router } from 'express';
import { route } from '../../lib/route.js';
import { registry } from '../../openapi/registry.js';
import { z } from '../../openapi/zod.js';
import { ShippingAddressSchema } from '../common/schemas.js';
import { OrderSchema } from '../orders/orders.schemas.js';
import { checkoutService } from './checkout.service.js';

export const checkoutRouter = Router();
const mount = '/checkout';
const tags = ['Checkout'];

const QuoteSchema = registry.register(
  'CheckoutQuote',
  z.object({
    quoteId: z.string().uuid(),
    items: z.array(
      z.object({
        productId: z.number().int(),
        sellerId: z.number().int(),
        name: z.string(),
        unitPriceCents: z.number().int(),
        quantity: z.number().int(),
        lineTotalCents: z.number().int(),
      }),
    ),
    shippingAddress: ShippingAddressSchema,
    subtotalCents: z.number().int(),
    shippingCents: z.number().int(),
    totalCents: z.number().int(),
    currency: z.string(),
    expiresAt: z.string(),
  }),
);

route(
  checkoutRouter,
  mount,
  {
    method: 'post',
    path: '/quote',
    summary: 'Price the current cart and start a checkout session',
    tags,
    auth: 'required',
    body: z.object({ shippingAddress: ShippingAddressSchema }),
    status: 201,
    responses: { 201: { description: 'Quote', schema: QuoteSchema }, 422: { description: 'Cart empty or unavailable items' } },
  },
  ({ user, body }) => checkoutService.quote(user.id, body.shippingAddress),
);

route(
  checkoutRouter,
  mount,
  {
    method: 'post',
    path: '/confirm',
    summary: 'Pay for a quote and place the order',
    tags,
    auth: 'required',
    body: z.object({
      quoteId: z.string().uuid(),
      payment: z.object({
        cardNumber: z.string().regex(/^[\d ]{12,23}$/),
        expMonth: z.number().int().min(1).max(12),
        expYear: z.number().int().min(2000).max(2100),
        cvc: z.string().regex(/^\d{3,4}$/),
      }),
    }),
    status: 201,
    responses: {
      201: { description: 'Order placed', schema: OrderSchema },
      402: { description: 'Payment declined' },
      409: { description: 'Stock or price changed' },
      410: { description: 'Quote expired' },
    },
  },
  ({ user, body }) =>
    checkoutService.confirm(user.id, body.quoteId, {
      number: body.payment.cardNumber,
      expMonth: body.payment.expMonth,
      expYear: body.payment.expYear,
      cvc: body.payment.cvc,
    }),
);
