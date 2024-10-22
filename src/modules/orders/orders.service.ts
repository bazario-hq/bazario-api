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
};
