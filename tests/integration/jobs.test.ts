import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import { reconcileRatings } from '../../src/jobs/reconcile-ratings.js';
import { useTestDb } from '../support/app.js';
import { createCategory, createProduct, createReview, createSeller, createUser } from '../support/factories.js';

describe('reconcile ratings job', () => {
  useTestDb();

  it('repairs product ratings that drifted from published reviews', async () => {
    const cat = await createCategory();
    const { seller } = await createSeller();
    const product = await createProduct(seller.id, cat.id, { ratingAvg: 1, ratingCount: 9 });
    const a = await createUser();
    const b = await createUser();
    const c = await createUser();
    await createReview(product.id, a.id, 5);
    await createReview(product.id, b.id, 4);
    await createReview(product.id, c.id, 1, { status: 'rejected' });

    const result = await reconcileRatings();
    expect(result.updated).toBe(1);

    const row = await db.selectFrom('products').select(['rating_avg', 'rating_count']).where('id', '=', product.id).executeTakeFirstOrThrow();
    expect(row).toEqual({ rating_avg: 4.5, rating_count: 2 });
  });
});
