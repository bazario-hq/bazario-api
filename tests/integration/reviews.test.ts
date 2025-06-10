import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import { ReviewList, ReviewSchema } from '../../src/modules/reviews/reviews.schemas.js';
import { api, useTestDb } from '../support/app.js';
import { createCategory, createOrder, createProduct, createReview, createSeller, createUser } from '../support/factories.js';
import { expectSchema } from '../support/schema.js';

describe('reviews', () => {
  useTestDb();

  let product: Awaited<ReturnType<typeof createProduct>>;
  let seller: Awaited<ReturnType<typeof createSeller>>;

  beforeEach(async () => {
    const cat = await createCategory();
    seller = await createSeller();
    product = await createProduct(seller.seller.id, cat.id, { name: 'Brass lamp' });
  });

  const rating = () =>
    db.selectFrom('products').select(['rating_avg', 'rating_count']).where('id', '=', product.id).executeTakeFirstOrThrow();

  describe('listing', () => {
    it('masks off-platform contact details in older reviews', async () => {
      const u = await createUser();
      await createReview(product.id, u.id, 4, { body: 'Nice lamp. Even cheaper on WhatsApp!' });
      const res = await api().get(`/api/products/${product.id}/reviews`);
      expect(res.body.items[0].body).toBe('Nice lamp. Even cheaper on ********!');
    });
  });

  describe('writing', () => {
    it('lets a buyer review a purchased product, updates the rating and notifies the seller', async () => {
      const buyer = await createUser();
      await createOrder(buyer.id, [{ product, quantity: 1 }]);

      const res = await api()
        .post(`/api/products/${product.id}/reviews`)
        .set(buyer.auth)
        .send({ rating: 4, title: 'Bright', body: 'Lights up the whole room.' });
      expect(res.status).toBe(201);
      expectSchema(ReviewSchema, res.body);
      expect(res.body.status).toBe('published');
      expect(await rating()).toEqual({ rating_avg: 4, rating_count: 1 });

      const notes = await db.selectFrom('notifications').selectAll().where('user_id', '=', seller.user.id).execute();
      expect(notes.map((n) => n.type)).toEqual(['review.created']);
    });

    it('requires a purchase', async () => {
      const stranger = await createUser();
      const res = await api()
        .post(`/api/products/${product.id}/reviews`)
        .set(stranger.auth)
        .send({ rating: 1, title: 'Meh', body: 'Never bought it' });
      expect(res.status).toBe(403);
    });

    it('allows only one review per product', async () => {
      const buyer = await createUser();
      await createOrder(buyer.id, [{ product, quantity: 1 }]);
      const body = { rating: 5, title: 'Great', body: 'Great lamp' };
      expect((await api().post(`/api/products/${product.id}/reviews`).set(buyer.auth).send(body)).status).toBe(201);
      expect((await api().post(`/api/products/${product.id}/reviews`).set(buyer.auth).send(body)).status).toBe(409);
    });

    it('holds reviews with blocked terms for moderation', async () => {
      const buyer = await createUser();
      await createOrder(buyer.id, [{ product, quantity: 1 }]);
      const res = await api()
        .post(`/api/products/${product.id}/reviews`)
        .set(buyer.auth)
        .send({ rating: 5, title: 'Great', body: 'Contact me on t e l e g r a m for a discount' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
      expect(await rating()).toEqual({ rating_avg: 0, rating_count: 0 });
    });
  });
});
