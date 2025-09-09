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
    it('pages through users newest first', async () => {
      const admin = await createAdmin();
      for (let i = 0; i < 30; i++) {
        await createUser({ email: `shopper-${Math.floor(Math.random() * 10000)}@example.test` });
      }

      const page1 = await api().get('/api/admin/users').query({ pageSize: 10 }).set(admin.auth);
      const page4 = await api().get('/api/admin/users').query({ pageSize: 10, page: 4 }).set(admin.auth);
      expect(page1.body.meta).toEqual({ page: 1, pageSize: 10, total: 31, totalPages: 4 });
      expect(page4.body.items).toHaveLength(1);
      expect(page4.body.items[0].id).toBe(admin.id);
    });

    it('suspends a user, revoking sessions and blocking login', async () => {
      const admin = await createAdmin();
      const user = await createUser();
      const login = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD });

      const res = await api().patch(`/api/admin/users/${user.id}`).set(admin.auth).send({ status: 'suspended' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('suspended');

      expect((await api().post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken })).status).toBe(401);
      expect((await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD })).status).toBe(403);

      const audit = await db.selectFrom('audit_log').select(['action', 'actor_id']).execute();
      expect(audit).toEqual([{ action: 'admin.user.update', actor_id: admin.id }]);
    });

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

  describe('reports', () => {
    it('reports platform totals, months and top sellers', async () => {
      const admin = await createAdmin();
      const cat = await createCategory();
      const big = await createSeller({ storeName: 'Big' });
      const small = await createSeller({ storeName: 'Small' });
      const p1 = await createProduct(big.seller.id, cat.id, { priceCents: 5000 });
      const p2 = await createProduct(small.seller.id, cat.id, { priceCents: 1000 });
      const buyer = await createUser();
      await createOrder(buyer.id, [{ product: p1, quantity: 2 }]);
      await createOrder(buyer.id, [{ product: p2, quantity: 1 }]);

      const res = await api().get('/api/admin/reports/overview').set(admin.auth);
      expect(res.status).toBe(200);
      expect(res.body.totals).toEqual({ gmvCents: 11000, orders: 2, users: 4, activeProducts: 2, activeSellers: 2 });
      const thisMonth = new Date().toISOString().slice(0, 7);
      expect(res.body.months).toEqual([{ month: thisMonth, orders: 2, gmvCents: 11000, buyers: 1, signups: 4 }]);
      expect(res.body.topSellers.map((s: { storeName: string }) => s.storeName)).toEqual(['Big', 'Small']);
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
