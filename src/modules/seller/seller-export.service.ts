import { db } from '../../db/index.js';
import type { ShippingAddress } from '../../db/types.js';

const HEADER = [
  'order_id',
  'order_date',
  'product_id',
  'product_name',
  'quantity',
  'unit_price',
  'line_total',
  'status',
  'buyer_name',
  'ship_city',
  'ship_country',
];

function csvField(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const money = (cents: number) => (cents / 100).toFixed(2);

export const sellerExportService = {
  async salesCsv(sellerId: number, range: { from?: string; to?: string }) {
    let q = db
      .selectFrom('order_items')
      .innerJoin('orders', 'orders.id', 'order_items.order_id')
      .innerJoin('users', 'users.id', 'orders.buyer_id')
      .select([
        'order_items.order_id',
        'order_items.created_at',
        'order_items.product_id',
        'order_items.product_name',
        'order_items.quantity',
        'order_items.unit_price_cents',
        'order_items.status',
        'users.name as buyer_name',
        'orders.shipping_address',
      ])
      .where('order_items.seller_id', '=', sellerId);
    if (range.from) q = q.where('order_items.created_at', '>=', new Date(`${range.from}T00:00:00Z`));
    if (range.to) q = q.where('order_items.created_at', '<', new Date(Date.parse(`${range.to}T00:00:00Z`) + 86_400_000));

    const rows = await q.orderBy('order_items.created_at').orderBy('order_items.id').execute();

    let csv = HEADER.join(',') + '\n';
    let total = 0;
    for (const r of rows) {
      const lineTotal = r.unit_price_cents * r.quantity;
      if (r.status !== 'cancelled') total += lineTotal;
      const address = r.shipping_address as ShippingAddress;
      csv +=
        [
          r.order_id,
          r.created_at.toISOString(),
          r.product_id,
          r.product_name,
          r.quantity,
          money(r.unit_price_cents),
          money(lineTotal),
          r.status,
          r.buyer_name,
          address.city,
          address.country,
        ]
          .map(csvField)
          .join(',') + '\n';
    }
    csv += ['TOTAL', '', '', '', '', '', money(total), '', '', '', ''].join(',') + '\n';
    return csv;
  },
};
