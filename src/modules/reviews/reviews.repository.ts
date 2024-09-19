import { sql } from 'kysely';
import { db } from '../../db/index.js';
import type { ReviewStatus } from '../../db/types.js';

const reviewColumns = [
  'reviews.id',
  'reviews.product_id',
  'reviews.user_id',
  'reviews.rating',
  'reviews.title',
  'reviews.body',
  'reviews.status',
  'reviews.created_at',
  'reviews.updated_at',
  'users.name as author_name',
] as const;

export const reviewsRepository = {
  listForProduct(productId: number, sort: 'newest' | 'highest' | 'lowest', limit: number, offset: number) {
    let q = db
      .selectFrom('reviews')
      .innerJoin('users', 'users.id', 'reviews.user_id')
      .select(reviewColumns)
      .where('reviews.product_id', '=', productId)
      .where('reviews.status', '=', 'published');
    if (sort === 'highest') q = q.orderBy('reviews.rating', 'desc');
    if (sort === 'lowest') q = q.orderBy('reviews.rating', 'asc');
    return q.orderBy('reviews.created_at', 'desc').orderBy('reviews.id', 'desc').limit(limit).offset(offset).execute();
  },

  async countForProduct(productId: number) {
    const row = await db
      .selectFrom('reviews')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('product_id', '=', productId)
      .where('status', '=', 'published')
      .executeTakeFirstOrThrow();
    return Number(row.count);
  },

  findById(id: number) {
    return db
      .selectFrom('reviews')
      .innerJoin('users', 'users.id', 'reviews.user_id')
      .select(reviewColumns)
      .where('reviews.id', '=', id)
      .executeTakeFirst();
  },

  findByProductAndUser(productId: number, userId: number) {
    return db
      .selectFrom('reviews')
      .select('id')
      .where('product_id', '=', productId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
  },

  create(values: { product_id: number; user_id: number; rating: number; title: string; body: string; status: ReviewStatus }) {
    return db.insertInto('reviews').values(values).returning('id').executeTakeFirstOrThrow();
  },

  update(id: number, values: { rating?: number; title?: string; body?: string; status?: ReviewStatus }) {
    return db
      .updateTable('reviews')
      .set({ ...values, updated_at: new Date() })
      .where('id', '=', id)
      .execute();
  },

  delete(id: number) {
    return db.deleteFrom('reviews').where('id', '=', id).execute();
  },

  /** Recalculates the cached rating columns on the product. */
  refreshProductRating(productId: number) {
    return sql`
      update products set
        rating_avg = coalesce((select round(avg(rating), 2) from reviews where product_id = ${productId} and status = 'published'), 0),
        rating_count = (select count(*) from reviews where product_id = ${productId} and status = 'published')
      where id = ${productId}
    `.execute(db);
  },
};

export type ReviewRow = NonNullable<Awaited<ReturnType<typeof reviewsRepository.findById>>>;
