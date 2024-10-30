import { sql } from 'kysely';
import { db } from '../../db/index.js';
import type { ImageVariants, OrderItemStatus, OrderStatus, ShippingAddress } from '../../db/types.js';
import { recordAudit } from '../../lib/audit.js';
import { conflict, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { pageMeta } from '../../lib/pagination.js';
import { refundCharge } from '../../lib/payments.js';
import { iso, serializeImage } from '../common/serializers.js';
import { productImagesRepository } from '../catalog/images.repository.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { ordersRepository, type OrderItemRow, type OrderRow } from './orders.repository.js';
import type { Request } from 'express';

type ImageRow = Awaited<ReturnType<typeof productImagesRepository.primaryImage>>;

export function toOrderItem(item: OrderItemRow, image: ImageRow | null | undefined) {
  return {
    id: item.id,
    productId: item.product_id,
    productName: item.product_name,
    unitPriceCents: item.unit_price_cents,
    quantity: item.quantity,
    lineTotalCents: item.unit_price_cents * item.quantity,
    status: item.status,
    trackingNumber: item.tracking_number,
    shippedAt: iso(item.shipped_at),
    deliveredAt: iso(item.delivered_at),
    image: image ? serializeImage({ ...image, variants: image.variants as ImageVariants }) : null,
    seller: { id: item.seller_id, storeName: item.seller_store_name, slug: item.seller_slug },
  };
}

export function toOrder(order: OrderRow, items: ReturnType<typeof toOrderItem>[]) {
  return {
    id: order.id,
    status: order.status,
    subtotalCents: order.subtotal_cents,
    shippingCents: order.shipping_cents,
    totalCents: order.total_cents,
    currency: order.currency,
    shippingAddress: order.shipping_address as ShippingAddress,
    paymentLast4: order.payment_last4,
    createdAt: order.created_at.toISOString(),
    cancelledAt: iso(order.cancelled_at),
    items,
  };
}

/** Order status as seen by the buyer, derived from the status of its items. */
export function deriveOrderStatus(statuses: OrderItemStatus[]): OrderStatus {
  const live = statuses.filter((s) => s !== 'cancelled');
  if (live.length === 0) return 'cancelled';
  if (live.every((s) => s === 'delivered')) return 'delivered';
  if (live.every((s) => s === 'shipped' || s === 'delivered')) return 'shipped';
  if (live.some((s) => s === 'shipped' || s === 'delivered')) return 'partially_shipped';
  return 'paid';
}

async function loadItems(orderId: number) {
  const rows = await ordersRepository.items(orderId);
  const items = [];
  for (const row of rows) {
    const image = await productImagesRepository.primaryImage(row.product_id);
    items.push(toOrderItem(row, image));
  }
  return items;
}

export const ordersService = {
  async list(buyerId: number, page: number, pageSize: number) {
    const orders = await ordersRepository.listForBuyer(buyerId, pageSize, (page - 1) * pageSize);
    const total = await ordersRepository.countForBuyer(buyerId);

    const result = [];
    for (const order of orders) {
      result.push(toOrder(order, await loadItems(order.id)));
    }
    return { items: result, meta: pageMeta(page, pageSize, total) };
  },

  async get(buyerId: number, orderId: number) {
    const order = await ordersRepository.findById(orderId);
    if (!order || order.buyer_id !== buyerId) throw notFound('Order');
    return toOrder(order, await loadItems(order.id));
  },

  async cancel(req: Request, buyerId: number, orderId: number) {
    const order = await ordersRepository.findById(orderId);
    if (!order || order.buyer_id !== buyerId) throw notFound('Order');
    if (order.status === 'cancelled') throw conflict('Order is already cancelled');

    const items = await ordersRepository.items(orderId);
    if (items.some((i) => i.status !== 'pending' && i.status !== 'cancelled')) {
      throw conflict('Orders can only be cancelled before anything has shipped');
    }

    await db.transaction().execute(async (trx) => {
      for (const item of items.filter((i) => i.status === 'pending')) {
        const { stock } = await trx
          .updateTable('products')
          .set({ stock: sql`stock + ${item.quantity}`, sales_count: sql`greatest(sales_count - ${item.quantity}, 0)` })
          .where('id', '=', item.product_id)
          .returning('stock')
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('inventory_adjustments')
          .values({
            product_id: item.product_id,
            delta: item.quantity,
            stock_after: stock,
            reason: `order #${orderId} cancelled`,
            actor_id: buyerId,
          })
          .execute();
      }
      await trx.updateTable('order_items').set({ status: 'cancelled' }).where('order_id', '=', orderId).execute();
      await trx
        .updateTable('orders')
        .set({ status: 'cancelled', cancelled_at: new Date(), updated_at: new Date() })
        .where('id', '=', orderId)
        .execute();
    });

    try {
      await refundCharge(order.payment_ref, order.total_cents);
    } catch (err) {
      logger.error({ err, orderId }, 'refund failed; needs manual follow-up');
    }

    const sellerUserIds = await db
      .selectFrom('sellers')
      .select('user_id')
      .where('id', 'in', [...new Set(items.map((i) => i.seller_id))])
      .execute();
    for (const { user_id } of sellerUserIds) {
      await notificationsService.notify(user_id, {
        type: 'order.cancelled',
        title: `Order #${orderId} was cancelled`,
        body: 'The buyer cancelled this order before it shipped. Stock has been restored.',
        link: `/seller/orders/${orderId}`,
      });
    }
    await recordAudit(req, { action: 'order.cancel', entityType: 'order', entityId: orderId });

    return this.get(buyerId, orderId);
  },
};
