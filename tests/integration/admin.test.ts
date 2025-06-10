import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import { api, useTestDb } from '../support/app.js';
import {
  createAdmin,
  createCategory,
  createOrder,
  createProduct,
  createReview,
  createSeller,
  createUser,
  PASSWORD,
} from '../support/factories.js';

describe('admin', () => {
  useTestDb();

  describe('users', () => {
    it('does not let admins change their own account', async () => {
      const admin = await createAdmin();
      expect((await api().patch(`/api/admin/users/${admin.id}`).set(admin.auth).send({ role: 'buyer' })).status).toBe(400);
    });
  });

  describe('sellers', () => {
    it('lists sellers with their active product counts', async () => {
      const admin = await createAdmin();
      const cat = await createCategory();
      const { seller } = await createSeller();
      await createProduct(seller.id, cat.id);
      await createProduct(seller.id, cat.id, { status: 'draft' });
      const res = await api().get('/api/admin/sellers').set(admin.auth);
      expect(res.body.items[0]).toMatchObject({ id: seller.id, productCount: 1 });
    });
  });

  describe('review moderation', () => {
    it('publishes and rejects held reviews and keeps ratings in sync', async () => {
      const admin = await createAdmin();
      const cat = await createCategory();
      const { seller } = await createSeller();
      const product = await createProduct(seller.id, cat.id);
      const a = await createUser();
      const b = await createUser();
      const held = await createReview(product.id, a.id, 5, { status: 'pending' });
      const spam = await createReview(product.id, b.id, 1, { status: 'pending' });

      const queue = await api().get('/api/admin/reviews').set(admin.auth);
      expect(queue.body.items.map((r: { id: number }) => r.id)).toEqual([held.id, spam.id]);

      await api().patch(`/api/admin/reviews/${held.id}`).set(admin.auth).send({ status: 'published' });
      await api().patch(`/api/admin/reviews/${spam.id}`).set(admin.auth).send({ status: 'rejected', note: 'Spam' });

      const p = await db.selectFrom('products').select(['rating_avg', 'rating_count']).where('id', '=', product.id).executeTakeFirstOrThrow();
      expect(p).toEqual({ rating_avg: 5, rating_count: 1 });
      const left = await api().get('/api/admin/reviews').set(admin.auth);
      expect(left.body.items).toEqual([]);
      const note = await db.selectFrom('notifications').select(['type', 'body']).where('user_id', '=', b.id).executeTakeFirstOrThrow();
      expect(note).toEqual({ type: 'review.rejected', body: 'Spam' });
    });
  });

  describe('audit log', () => {
    it('lists entries newest first and filters by entity type', async () => {
      const admin = await createAdmin();
      const user = await createUser();
      await api().patch(`/api/admin/users/${user.id}`).set(admin.auth).send({ status: 'suspended' });
      await api().patch(`/api/admin/users/${user.id}`).set(admin.auth).send({ status: 'active' });

      const res = await api().get('/api/admin/audit-log').query({ entityType: 'user' }).set(admin.auth);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].metadata).toEqual({ status: 'active' });
      expect(res.body.items[0].actor).toEqual({ id: admin.id, email: admin.email });

      const none = await api().get('/api/admin/audit-log').query({ entityType: 'product' }).set(admin.auth);
      expect(none.body.items).toEqual([]);
    });
  });
});
