import { sql } from 'kysely';
import { db } from '../../db/index.js';

type Range = '7d' | '30d' | '90d' | 'mtd';

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function rangeFor(range: Range, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let from: Date;
  if (range === 'mtd') from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  else from = new Date(today.getTime() - (Number.parseInt(range, 10) - 1) * DAY_MS);

  const days = Math.round((today.getTime() - from.getTime()) / DAY_MS) + 1;
  const prevTo = new Date(from.getTime() - DAY_MS);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * DAY_MS);
  return { from: isoDate(from), to: isoDate(today), prevFrom: isoDate(prevFrom), prevTo: isoDate(prevTo), days };
}

function sellerItems(sellerId: number, from: string, to: string) {
  return db
    .selectFrom('order_items')
    .where('order_items.seller_id', '=', sellerId)
    .where('order_items.status', '!=', 'cancelled')
    .where(sql<string>`order_items.created_at::date`, '>=', from)
    .where(sql<string>`order_items.created_at::date`, '<=', to);
}

async function kpis(sellerId: number, from: string, to: string) {
  const totals = await sellerItems(sellerId, from, to)
    .select([
      sql<number>`coalesce(sum(order_items.unit_price_cents * order_items.quantity), 0)`.as('revenue'),
      sql<number>`count(distinct order_items.order_id)`.as('orders'),
      sql<number>`coalesce(sum(order_items.quantity), 0)`.as('units'),
    ])
    .executeTakeFirstOrThrow();

  const customers = await sellerItems(sellerId, from, to)
    .innerJoin('orders', 'orders.id', 'order_items.order_id')
    .select(sql<number>`count(distinct orders.buyer_id)`.as('count'))
    .executeTakeFirstOrThrow();

  const revenueCents = Number(totals.revenue);
  const orders = Number(totals.orders);
  return {
    revenueCents,
    orders,
    units: Number(totals.units),
    averageOrderCents: orders === 0 ? 0 : Math.round(revenueCents / orders),
    customers: Number(customers.count),
  };
}

export const sellerDashboardService = {
  async get(sellerId: number, range: Range) {
    const r = rangeFor(range);

    const current = await kpis(sellerId, r.from, r.to);
    const previous = await kpis(sellerId, r.prevFrom, r.prevTo);

    const daily = await sellerItems(sellerId, r.from, r.to)
      .select([
        sql<string>`to_char(order_items.created_at::date, 'YYYY-MM-DD')`.as('day'),
        sql<number>`sum(order_items.unit_price_cents * order_items.quantity)`.as('revenue'),
        sql<number>`count(distinct order_items.order_id)`.as('orders'),
      ])
      .groupBy(sql`order_items.created_at::date`)
      .execute();
    const byDay = new Map(daily.map((d) => [d.day, d]));
    const salesByDay = [];
    for (let i = 0; i < r.days; i++) {
      const date = isoDate(new Date(Date.parse(r.from) + i * DAY_MS));
      const row = byDay.get(date);
      salesByDay.push({ date, revenueCents: Number(row?.revenue ?? 0), orders: Number(row?.orders ?? 0) });
    }

    const top = await sellerItems(sellerId, r.from, r.to)
      .select([
        'order_items.product_id',
        sql<string>`max(order_items.product_name)`.as('name'),
        sql<number>`sum(order_items.quantity)`.as('units'),
        sql<number>`sum(order_items.unit_price_cents * order_items.quantity)`.as('revenue'),
      ])
      .groupBy('order_items.product_id')
      .orderBy('revenue', 'desc')
      .limit(5)
      .execute();

    const lowStockQuery = db
      .selectFrom('products')
      .where('seller_id', '=', sellerId)
      .where('status', '=', 'active')
      .whereRef('stock', '<=', 'low_stock_threshold');
    const lowStockItems = await lowStockQuery.select(['id', 'name', 'stock']).orderBy('stock').limit(10).execute();
    const lowStockCount = await lowStockQuery.select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirstOrThrow();

    const pending = await db
      .selectFrom('order_items')
      .select(sql<number>`count(distinct order_id)`.as('count'))
      .where('seller_id', '=', sellerId)
      .where('status', '=', 'pending')
      .executeTakeFirstOrThrow();

    return {
      range: { from: r.from, to: r.to },
      kpis: current,
      previous,
      salesByDay,
      topProducts: top.map((t) => ({
        productId: t.product_id,
        name: t.name,
        units: Number(t.units),
        revenueCents: Number(t.revenue),
      })),
      lowStock: {
        count: Number(lowStockCount.count),
        items: lowStockItems.map((p) => ({ productId: p.id, name: p.name, stock: p.stock })),
      },
      pendingShipments: Number(pending.count),
    };
  },
};
