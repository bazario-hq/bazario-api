import { db } from '../../db/index.js';

export const sellersRepository = {
  findById(id: number) {
    return db.selectFrom('sellers').selectAll().where('id', '=', id).executeTakeFirst();
  },

  findBySlug(slug: string) {
    return db.selectFrom('sellers').selectAll().where('slug', '=', slug).executeTakeFirst();
  },

  findByUserId(userId: number) {
    return db.selectFrom('sellers').selectAll().where('user_id', '=', userId).executeTakeFirst();
  },

  slugExists(slug: string) {
    return db.selectFrom('sellers').select('id').where('slug', '=', slug).executeTakeFirst();
  },

  create(values: { user_id: number; store_name: string; slug: string; description: string | null; support_email: string | null }) {
    return db.insertInto('sellers').values(values).returningAll().executeTakeFirstOrThrow();
  },

  update(id: number, values: { store_name?: string; description?: string | null; support_email?: string | null; logo_key?: string | null }) {
    return db
      .updateTable('sellers')
      .set({ ...values, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  async storefrontStats(sellerId: number) {
    const row = await db
      .selectFrom('products')
      .select((eb) => [
        eb.fn.countAll<number>().as('product_count'),
        eb.fn.sum<number>('sales_count').as('units_sold'),
      ])
      .where('seller_id', '=', sellerId)
      .where('status', '=', 'active')
      .executeTakeFirstOrThrow();
    const rating = await db
      .selectFrom('reviews')
      .innerJoin('products', 'products.id', 'reviews.product_id')
      .select((eb) => [eb.fn.avg<number>('reviews.rating').as('avg'), eb.fn.countAll<number>().as('count')])
      .where('products.seller_id', '=', sellerId)
      .where('reviews.status', '=', 'published')
      .executeTakeFirstOrThrow();
    return {
      productCount: Number(row.product_count),
      unitsSold: Number(row.units_sold ?? 0),
      ratingAvg: rating.avg == null ? null : Math.round(Number(rating.avg) * 100) / 100,
      reviewCount: Number(rating.count),
    };
  },
};
