import { config } from '../../config.js';
import { db } from '../../db/index.js';
import { feeFor } from '../../lib/money.js';

function lastMonths(count: number, now = new Date()) {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}

export const sellerPayoutsService = {
  async summary(sellerId: number) {
    const items = await db
      .selectFrom('order_items')
      .select(['created_at', 'unit_price_cents', 'quantity', 'status'])
      .where('seller_id', '=', sellerId)
      .where('status', 'in', ['shipped', 'delivered'])
      .execute();

    const payouts = await db
      .selectFrom('payouts')
      .select(['period_month', 'status', 'paid_at'])
      .where('seller_id', '=', sellerId)
      .execute();

    const months = lastMonths(12).map((month) => ({ month, grossCents: 0 }));
    for (const item of items) {
      const key = item.created_at.toISOString().slice(0, 7);
      const bucket = months.find((m) => m.month === key);
      if (bucket) bucket.grossCents += item.unit_price_cents * item.quantity;
    }

    const currentMonth = months[months.length - 1].month;
    const rows = months.reverse().map(({ month, grossCents }) => {
      const payout = payouts.find((p) => String(p.period_month).slice(0, 7) === month);
      const feeCents = feeFor(grossCents, config.PLATFORM_FEE_PERCENT);
      const status: 'open' | 'scheduled' | 'paid' =
        month === currentMonth ? 'open' : payout?.status === 'paid' ? 'paid' : 'scheduled';
      return {
        month,
        grossCents,
        feeCents,
        netCents: grossCents - feeCents,
        status,
        paidAt: payout?.paid_at ? payout.paid_at.toISOString() : null,
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        grossCents: acc.grossCents + r.grossCents,
        feeCents: acc.feeCents + r.feeCents,
        netCents: acc.netCents + r.netCents,
      }),
      { grossCents: 0, feeCents: 0, netCents: 0 },
    );

    return { feePercent: config.PLATFORM_FEE_PERCENT, months: rows, totals };
  },
};
