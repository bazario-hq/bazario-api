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
