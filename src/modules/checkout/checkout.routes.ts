import { Router } from 'express';
import { route } from '../../lib/route.js';
import { registry } from '../../openapi/registry.js';
import { z } from '../../openapi/zod.js';
import { ShippingAddressSchema } from '../common/schemas.js';
import { OrderSchema } from '../orders/orders.schemas.js';
import { sql } from 'kysely';
import { db } from '../../db/index.js';
import type { ShippingAddress } from '../../db/types.js';
import { conflict, HttpError, unprocessable } from '../../lib/errors.js';
import { sendMail } from '../../lib/mailer.js';
import { formatCents, shippingFor } from '../../lib/money.js';
import { chargeCard, type CardDetails } from '../../lib/payments.js';
import { loadCartRows } from '../cart/cart.service.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { ordersService } from '../orders/orders.service.js';
import { quoteStore } from './quote-store.js';

function toQuoteResponse(quote: ReturnType<typeof quoteStore.create>) {
  return {
    quoteId: quote.id,
    items: quote.items.map((i) => ({ ...i, lineTotalCents: i.unitPriceCents * i.quantity })),
    shippingAddress: quote.shippingAddress,
    subtotalCents: quote.subtotalCents,
    shippingCents: quote.shippingCents,
    totalCents: quote.totalCents,
    currency: 'USD',
    expiresAt: new Date(quote.expiresAt).toISOString(),
  };
}

const checkoutService = {
  async quote(userId: number, shippingAddress: ShippingAddress) {
    const rows = await loadCartRows(userId);
    if (rows.length === 0) throw unprocessable('Your cart is empty');

    const problems = rows.filter(
      (r) => r.status !== 'active' || r.seller_status !== 'active' || r.stock < r.quantity,
    );
    if (problems.length > 0) {
      throw unprocessable(
        'Some items in your cart are unavailable',
        problems.map((p) => ({ productId: p.product_id, name: p.name, available: p.status === 'active' ? p.stock : 0 })),
      );
    }

    const items = rows.map((r) => ({
      productId: r.product_id,
      sellerId: r.seller_id,
      name: r.name,
      unitPriceCents: r.price_cents,
      quantity: r.quantity,
    }));
    const subtotalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
    const shippingCents = shippingFor(subtotalCents);

    const quote = quoteStore.create({
      userId,
      items,
      shippingAddress,
      subtotalCents,
      shippingCents,
      totalCents: subtotalCents + shippingCents,
    });
    return toQuoteResponse(quote);
  },

  async confirm(userId: number, quoteId: string, card: CardDetails) {
    const quote = quoteStore.get(quoteId);
    if (!quote || quote.userId !== userId) {
      throw new HttpError(410, 'quote_expired', 'Your checkout session expired. Please review your cart again.');
    }

    const order = await db.transaction().execute(async (trx) => {
      for (const item of quote.items) {
        const product = await trx
          .selectFrom('products')
          .select(['id', 'name', 'price_cents', 'stock', 'status'])
          .where('id', '=', item.productId)
          .forUpdate()
          .executeTakeFirst();
        if (!product || product.status !== 'active') throw conflict(`${item.name} is no longer available`);
        if (product.stock < item.quantity) throw conflict(`Only ${product.stock} left of ${product.name}`);
        if (product.price_cents !== item.unitPriceCents) {
          throw conflict('Prices changed since you started checkout. Please review your cart.');
        }
      }

      const charge = await chargeCard(quote.totalCents, card);

      const created = await trx
        .insertInto('orders')
        .values({
          buyer_id: userId,
          subtotal_cents: quote.subtotalCents,
          shipping_cents: quote.shippingCents,
          total_cents: quote.totalCents,
          shipping_address: JSON.stringify(quote.shippingAddress),
          payment_ref: charge.ref,
          payment_last4: charge.last4,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      for (const item of quote.items) {
        await trx
          .insertInto('order_items')
          .values({
            order_id: created.id,
            product_id: item.productId,
            seller_id: item.sellerId,
            product_name: item.name,
            unit_price_cents: item.unitPriceCents,
            quantity: item.quantity,
          })
          .execute();
        const { stock } = await trx
          .updateTable('products')
          .set({
            stock: sql`stock - ${item.quantity}`,
            sales_count: sql`sales_count + ${item.quantity}`,
          })
          .where('id', '=', item.productId)
          .returning('stock')
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('inventory_adjustments')
          .values({
            product_id: item.productId,
            delta: -item.quantity,
            stock_after: stock,
            reason: `order #${created.id}`,
            actor_id: userId,
          })
          .execute();
      }

      await trx.deleteFrom('cart_items').where('user_id', '=', userId).execute();
      return created;
    });

    quoteStore.delete(quoteId);

    const buyer = await db.selectFrom('users').select(['email', 'name']).where('id', '=', userId).executeTakeFirstOrThrow();
    const lines = quote.items.map((i) => `  ${i.quantity} x ${i.name}  ${formatCents(i.unitPriceCents * i.quantity)}`);
    await sendMail({
      to: buyer.email,
      subject: `Your Bazario order #${order.id}`,
      text: `Hi ${buyer.name},\n\nThanks for your order!\n\n${lines.join('\n')}\n\nTotal: ${formatCents(order.total_cents)}\n`,
    });

    const sellerIds = [...new Set(quote.items.map((i) => i.sellerId))];
    for (const sellerId of sellerIds) {
      const seller = await db
        .selectFrom('sellers')
        .innerJoin('users', 'users.id', 'sellers.user_id')
        .select(['sellers.user_id', 'users.email', 'sellers.store_name', 'sellers.support_email'])
        .where('sellers.id', '=', sellerId)
        .executeTakeFirstOrThrow();
      const sellerItems = quote.items.filter((i) => i.sellerId === sellerId);
      await notificationsService.notify(seller.user_id, {
        type: 'order.created',
        title: `New order #${order.id}`,
        body: `${sellerItems.reduce((n, i) => n + i.quantity, 0)} item(s) to ship`,
        link: `/seller/orders/${order.id}`,
      });
      await sendMail({
        to: seller.support_email ?? seller.email,
        subject: `New order #${order.id} for ${seller.store_name}`,
        text: `You have a new order to fulfil:\n\n${sellerItems.map((i) => `  ${i.quantity} x ${i.name}`).join('\n')}\n`,
      });
    }

    return ordersService.get(userId, order.id);
  },
};

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
