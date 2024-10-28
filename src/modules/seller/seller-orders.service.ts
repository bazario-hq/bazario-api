import { sql } from 'kysely';
import { db } from '../../db/index.js';
import type { OrderItemStatus, ShippingAddress } from '../../db/types.js';
import { conflict, notFound } from '../../lib/errors.js';
import { sendMail } from '../../lib/mailer.js';
import { pageMeta } from '../../lib/pagination.js';
import { iso } from '../common/serializers.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { deriveOrderStatus } from '../orders/orders.service.js';

type Fulfilment = 'pending' | 'partially_shipped' | 'shipped' | 'delivered' | 'cancelled';

function fulfilmentFor(statuses: OrderItemStatus[]): Fulfilment {
  const s = deriveOrderStatus(statuses);
  return s === 'paid' ? 'pending' : s;
}

async function refreshOrderStatus(orderId: number) {
  const items = await db.selectFrom('order_items').select('status').where('order_id', '=', orderId).execute();
  const status = deriveOrderStatus(items.map((i) => i.status));
  await db.updateTable('orders').set({ status, updated_at: new Date() }).where('id', '=', orderId).execute();
  return status;
}

export const sellerOrdersService = {
  async list(sellerId: number, opts: { status?: OrderItemStatus; page: number; pageSize: number }) {
    let q = db
      .selectFrom('order_items')
      .innerJoin('orders', 'orders.id', 'order_items.order_id')
      .innerJoin('users', 'users.id', 'orders.buyer_id')
      .where('order_items.seller_id', '=', sellerId);
    if (opts.status) q = q.where('order_items.status', '=', opts.status);

    const rows = await q
      .select([
        'orders.id as order_id',
        'orders.created_at',
        'users.name as buyer_name',
        sql<number>`sum(order_items.quantity)`.as('item_count'),
        sql<number>`sum(order_items.unit_price_cents * order_items.quantity)`.as('total_cents'),
        sql<OrderItemStatus[]>`array_agg(order_items.status)`.as('statuses'),
      ])
      .groupBy(['orders.id', 'users.name'])
      .orderBy('orders.created_at', 'desc')
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize)
      .execute();

    const { count } = await q
      .select(sql<number>`count(distinct order_items.order_id)`.as('count'))
      .executeTakeFirstOrThrow();

    return {
      items: rows.map((r) => ({
        orderId: r.order_id,
        createdAt: r.created_at.toISOString(),
        buyerName: r.buyer_name,
        itemCount: Number(r.item_count),
        totalCents: Number(r.total_cents),
        fulfilment: fulfilmentFor(r.statuses),
      })),
      meta: pageMeta(opts.page, opts.pageSize, Number(count)),
    };
  },

  async get(sellerId: number, orderId: number) {
    const order = await db
      .selectFrom('orders')
      .innerJoin('users', 'users.id', 'orders.buyer_id')
      .select(['orders.id', 'orders.created_at', 'orders.shipping_address', 'users.name as buyer_name'])
      .where('orders.id', '=', orderId)
      .executeTakeFirst();
    if (!order) throw notFound('Order');

    const items = await db
      .selectFrom('order_items')
      .selectAll()
      .where('order_id', '=', orderId)
      .where('seller_id', '=', sellerId)
      .orderBy('id')
      .execute();
    if (items.length === 0) throw notFound('Order');

    return {
      orderId: order.id,
      createdAt: order.created_at.toISOString(),
      buyerName: order.buyer_name,
      shippingAddress: order.shipping_address as ShippingAddress,
      totalCents: items.reduce((sum, i) => sum + i.unit_price_cents * i.quantity, 0),
      items: items.map((i) => ({
        id: i.id,
        productId: i.product_id,
        productName: i.product_name,
        unitPriceCents: i.unit_price_cents,
        quantity: i.quantity,
        status: i.status,
        trackingNumber: i.tracking_number,
        shippedAt: iso(i.shipped_at),
        deliveredAt: iso(i.delivered_at),
      })),
    };
  },

  async ship(sellerId: number, orderId: number, input: { itemIds?: number[]; trackingNumber: string }) {
    const detail = await this.get(sellerId, orderId);
    const targets = detail.items.filter(
      (i) => i.status === 'pending' && (!input.itemIds || input.itemIds.includes(i.id)),
    );
    if (targets.length === 0) throw conflict('No pending items to ship');

    await db
      .updateTable('order_items')
      .set({ status: 'shipped', tracking_number: input.trackingNumber, shipped_at: new Date() })
      .where('id', 'in', targets.map((t) => t.id))
      .execute();
    await refreshOrderStatus(orderId);

    const order = await db
      .selectFrom('orders')
      .innerJoin('users', 'users.id', 'orders.buyer_id')
      .select(['orders.buyer_id', 'users.email', 'users.name'])
      .where('orders.id', '=', orderId)
      .executeTakeFirstOrThrow();
    await notificationsService.notify(order.buyer_id, {
      type: 'order.shipped',
      title: `Order #${orderId} has shipped`,
      body: `${targets.map((t) => t.productName).join(', ')} is on the way. Tracking: ${input.trackingNumber}`,
      link: `/orders/${orderId}`,
    });
    await sendMail({
      to: order.email,
      subject: `Your Bazario order #${orderId} has shipped`,
      text: `Hi ${order.name},\n\nGood news: ${targets.map((t) => t.productName).join(', ')} is on the way.\nTracking number: ${input.trackingNumber}\n`,
    });

    return this.get(sellerId, orderId);
  },

  async deliver(sellerId: number, orderId: number, itemIds?: number[]) {
    const detail = await this.get(sellerId, orderId);
    const targets = detail.items.filter((i) => i.status === 'shipped' && (!itemIds || itemIds.includes(i.id)));
    if (targets.length === 0) throw conflict('No shipped items to mark as delivered');

    await db
      .updateTable('order_items')
      .set({ status: 'delivered', delivered_at: new Date() })
      .where('id', 'in', targets.map((t) => t.id))
      .execute();
    await refreshOrderStatus(orderId);
    return this.get(sellerId, orderId);
  },
};
