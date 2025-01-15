import { pool, db } from '../../db/index.js';
import { notFound } from '../../lib/errors.js';
import { pageMeta } from '../../lib/pagination.js';

export const sellerInventoryService = {
  async list(sellerId: number, opts: { lowStock: boolean; page: number; pageSize: number }) {
    let q = db.selectFrom('products').where('seller_id', '=', sellerId).where('status', '!=', 'archived');
    if (opts.lowStock) q = q.whereRef('stock', '<=', 'low_stock_threshold');

    const rows = await q
      .select(['id', 'name', 'status', 'stock', 'low_stock_threshold', 'updated_at'])
      .orderBy('stock', 'asc')
      .orderBy('id')
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize)
      .execute();
    const { count } = await q.select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirstOrThrow();

    return {
      items: rows.map((r) => ({
        productId: r.id,
        name: r.name,
        status: r.status,
        stock: r.stock,
        lowStockThreshold: r.low_stock_threshold,
        lowStock: r.stock <= r.low_stock_threshold,
        updatedAt: r.updated_at.toISOString(),
      })),
      meta: pageMeta(opts.page, opts.pageSize, Number(count)),
    };
  },

  /** Sets absolute stock levels, e.g. from a spreadsheet after a stock take. */
  async bulkSet(sellerId: number, actorId: number, items: { productId: number; stock: number }[], reason: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const item of items) {
        const { rows } = await client.query<{ id: number; stock: number }>(
          'SELECT id, stock FROM products WHERE id = $1 AND seller_id = $2 FOR UPDATE',
          [item.productId, sellerId],
        );
        if (rows.length === 0) throw notFound(`Product ${item.productId}`);

        const previous = rows[0].stock;
        await client.query('UPDATE products SET stock = $1, updated_at = now() WHERE id = $2', [item.stock, item.productId]);
        if (item.stock !== previous) {
          await client.query(
            'INSERT INTO inventory_adjustments (product_id, delta, stock_after, reason, actor_id) VALUES ($1, $2, $3, $4, $5)',
            [item.productId, item.stock - previous, item.stock, reason, actorId],
          );
        }
        results.push({ productId: item.productId, previousStock: previous, stock: item.stock });
      }
      await client.query('COMMIT');
      client.release();
      return { updated: results.length, items: results };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  },

  async history(sellerId: number, productId: number) {
    const product = await db
      .selectFrom('products')
      .select('id')
      .where('id', '=', productId)
      .where('seller_id', '=', sellerId)
      .executeTakeFirst();
    if (!product) throw notFound('Product');
    const rows = await db
      .selectFrom('inventory_adjustments')
      .select(['id', 'delta', 'stock_after', 'reason', 'created_at'])
      .where('product_id', '=', productId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(100)
      .execute();
    return {
      items: rows.map((r) => ({
        id: r.id,
        delta: r.delta,
        stockAfter: r.stock_after,
        reason: r.reason,
        createdAt: r.created_at.toISOString(),
      })),
    };
  },
};
